import { createServerFn } from "@tanstack/react-start";
import { getRequestUrl } from "@tanstack/react-start/server";
import { z } from "zod";
import { inspectUrl, hasBlockingIssue } from "./link-safety";

export const FROM_ADDRESS = "onboarding@resend.dev";

const sendInput = z.object({ campaignId: z.string().uuid() });
const retrySendInput = z.object({ sendId: z.string().uuid() });

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const MAX_ATTEMPTS = 3;

const scheduleInput = z.object({ campaignId: z.string().uuid(), scheduledFor: z.string() });

/**
 * Core background queue worker loop.
 * Can be triggered asynchronously or via API endpoint.
 */
export async function runQueueWorker(targetCampaignId?: string, origin?: string) {
  const apiKey = process.env["RESEND_API_KEY"];
  if (!apiKey) {
    console.error("Worker error: RESEND_API_KEY is not configured.");
    return;
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { signSendToken } = await import("./link-safety");

  // Fetch owner settings for footer and throttling
  const { data: settings } = await supabaseAdmin
    .from("settings")
    .select("*")
    .eq("id", "default")
    .maybeSingle();

  const businessName = settings?.business_name || "Campaign Companion";
  const postalAddress = settings?.postal_address || "123 Business Street, Mumbai, MH 400001, India";
  const supportEmail = settings?.support_email || "support@example.com";
  const fromAddress = settings?.from_address || FROM_ADDRESS;

  // Sending caps (deliverability / reputation safeguard)
  const enforceCaps = settings?.enforce_caps ?? true;
  const dailyCap = settings?.daily_cap ?? 100;
  const monthlyCap = settings?.monthly_cap ?? 3000;
  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const countSince = async (since: string) => {
    const { count } = await supabaseAdmin
      .from("sends")
      .select("id", { count: "exact", head: true })
      .eq("status", "sent")
      .gte("sent_at", since);
    return count ?? 0;
  };
  let remainingToday = enforceCaps ? dailyCap - (await countSince(dayStart)) : Number.MAX_SAFE_INTEGER;
  let remainingMonth = enforceCaps ? monthlyCap - (await countSince(monthStart)) : Number.MAX_SAFE_INTEGER;
  if (remainingToday <= 0 || remainingMonth <= 0) {
    console.warn("Worker: sending cap reached, deferring queue.");
    return;
  }



  let campaignIds: string[] = [];
  if (targetCampaignId) {
    campaignIds = [targetCampaignId];
  } else {
    // Process queued, sending, and scheduled campaigns whose scheduled_for time has passed
    const nowIso = new Date().toISOString();
    const { data: activeCampaigns } = await supabaseAdmin
      .from("campaigns")
      .select("id, status, scheduled_for")
      .or(`status.in.(queued,sending),and(status.eq.scheduled,scheduled_for.lte.${nowIso})`);
    campaignIds = (activeCampaigns ?? []).map((c) => c.id);
  }

  if (campaignIds.length === 0) return;

  const defaultOrigin = origin || "http://localhost:3000";

  for (const cid of campaignIds) {
    const { data: campaign } = await supabaseAdmin
      .from("campaigns")
      .select("*")
      .eq("id", cid)
      .maybeSingle();

    if (!campaign || campaign.status === "completed" || campaign.status === "sent" || campaign.status === "cancelled" || campaign.status === "draft") continue;

    // Mark campaign as sending
    await supabaseAdmin.from("campaigns").update({ status: "sending" }).eq("id", cid);

    // Auto-repair: reset any sends stuck in 'sending' status for >15s back to 'queued'
    const fifteenSecsAgo = new Date(Date.now() - 15_000).toISOString();
    await supabaseAdmin
      .from("sends")
      .update({ status: "queued" })
      .eq("campaign_id", cid)
      .eq("status", "sending")
      .or(`last_attempt_at.is.null,last_attempt_at.lt.${fifteenSecsAgo}`);

    // Try PL/pgSQL atomic claim function first, fallback to standard query
    let sends: Array<{ id: string; lead_id: string; attempt_count: number; status: string }> = [];
    const { data: claimedSends, error: rpcError } = await supabaseAdmin.rpc("claim_queued_sends", {
      p_campaign_id: cid,
      p_batch_size: 10,
    });

    if (!rpcError && claimedSends && claimedSends.length > 0) {
      sends = claimedSends as typeof sends;
    } else {
      const { data: directSends } = await supabaseAdmin
        .from("sends")
        .select("id, lead_id, attempt_count, status")
        .eq("campaign_id", cid)
        .in("status", ["queued", "failed"])
        .lt("attempt_count", MAX_ATTEMPTS);
      sends = directSends ?? [];
    }

    // Fallback: If still no sends claimed, check if sends were stuck in 'sending' and force claim them
    if (!sends || sends.length === 0) {
      const { data: stuckSends } = await supabaseAdmin
        .from("sends")
        .select("id, lead_id, attempt_count, status")
        .eq("campaign_id", cid)
        .eq("status", "sending")
        .lt("attempt_count", MAX_ATTEMPTS);

      if (stuckSends && stuckSends.length > 0) {
        await supabaseAdmin
          .from("sends")
          .update({ status: "queued" })
          .eq("campaign_id", cid)
          .eq("status", "sending");

        const { data: reclaimed } = await supabaseAdmin
          .from("sends")
          .select("id, lead_id, attempt_count, status")
          .eq("campaign_id", cid)
          .eq("status", "queued")
          .lt("attempt_count", MAX_ATTEMPTS);
        sends = reclaimed ?? [];
      }
    }

    if (!sends || sends.length === 0) {
      const { data: remainingPending } = await supabaseAdmin
        .from("sends")
        .select("id")
        .eq("campaign_id", cid)
        .in("status", ["queued", "sending"]);

      if (!remainingPending || remainingPending.length === 0) {
        await supabaseAdmin
          .from("campaigns")
          .update({ status: "completed", sent_at: new Date().toISOString() })
          .eq("id", cid);
      }
      continue;
    }

    const leadIds = Array.from(new Set(sends.map((s) => s.lead_id)));
    const { data: leads } = await supabaseAdmin
      .from("leads")
      .select("id, email, name")
      .in("id", leadIds);

    const leadById = new Map((leads ?? []).map((l) => [l.id, l]));

    const BATCH_SIZE = 2;
    let adaptivePauseMs = settings?.throttle_pause_ms || 1100;

    const deliverOne = async (send: { id: string; lead_id: string; attempt_count: number }) => {
      const lead = leadById.get(send.lead_id);
      if (!lead) {
        await supabaseAdmin
          .from("sends")
          .update({ status: "failed", failure_reason: "Recipient lead record not found" })
          .eq("id", send.id);
        return;
      }

      const sig = signSendToken(send.id);
      const clickUrl = `${defaultOrigin}/track/click?send_id=${send.id}&sig=${sig}`;
      const pixelUrl = `${defaultOrigin}/track/open?send_id=${send.id}&sig=${sig}`;
      const unsubUrl = `${defaultOrigin}/track/unsubscribe?send_id=${send.id}&sig=${sig}`;

      let html = campaign.body_html || "";
      html = html.replaceAll("{{offer_link}}", clickUrl);
      html = html.replaceAll("{{name}}", lead.name ?? "there");
      if (campaign.offer_url) {
        html = html.replaceAll(campaign.offer_url, clickUrl);
      }

      // Compliant DPDP Footer with Business Name, Address, and Support Email
      html += `<div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280;text-align:center;line-height:1.5;">
        <p>Sent by <strong>${businessName}</strong> · ${postalAddress}</p>
        <p>Questions? Contact <a href="mailto:${supportEmail}" style="color:#6b7280;">${supportEmail}</a> · <a href="${unsubUrl}" style="color:#6b7280;text-decoration:underline;">Unsubscribe from marketing emails</a></p>
      </div>`;
      html += `<img src="${pixelUrl}" width="1" height="1" alt="" style="display:block;border:0;" />`;

      const plainText = campaign.body_text || html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

      const attempt = send.attempt_count + 1;
      await supabaseAdmin
        .from("sends")
        .update({
          status: "sending",
          attempt_count: attempt,
          last_attempt_at: new Date().toISOString(),
          failure_reason: null,
        })
        .eq("id", send.id);

      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            from: fromAddress,
            to: [lead.email],
            subject: campaign.subject,
            html,
            text: plainText,
            headers: {
              "List-Unsubscribe": `<${unsubUrl}>`,
              "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            },
          }),
        });

        if (res.ok) {
          const resData = await res.json().catch(() => ({}));
          await supabaseAdmin
            .from("sends")
            .update({
              status: "sent",
              sent_at: new Date().toISOString(),
              failure_reason: null,
              provider_message_id: resData.id || null,
            })
            .eq("id", send.id);
          return;
        }

        // Adaptive rate limiting check on 429/503 responses
        const retryAfter = res.headers.get("retry-after");
        if (res.status === 429 || res.status === 503) {
          const pauseSec = retryAfter ? parseInt(retryAfter, 10) || 3 : 3;
          adaptivePauseMs = Math.max(adaptivePauseMs, pauseSec * 1000);
        }

        const body = (await res.text()).replaceAll(/\s+/g, " ").slice(0, 300);
        const failureReason = `Resend returned ${res.status}${body ? `: ${body}` : ""}`;

        // Hard bounce / invalid email handling -> permanently suppress
        if (res.status === 400 || body.toLowerCase().includes("invalid")) {
          await supabaseAdmin
            .from("leads")
            .update({
              subscribed: false,
              suppression_status: "bounced",
              suppression_reason: failureReason,
              suppressed_at: new Date().toISOString(),
            })
            .eq("id", lead.id);
        }

        await supabaseAdmin
          .from("sends")
          .update({ status: "failed", failure_reason: failureReason })
          .eq("id", send.id);
      } catch (err) {
        const failureReason = err instanceof Error ? err.message : "Resend request error";
        await supabaseAdmin
          .from("sends")
          .update({ status: "failed", failure_reason: failureReason })
          .eq("id", send.id);
      }
    };

    for (let i = 0; i < sends.length; i += BATCH_SIZE) {
      const allowed = Math.max(0, Math.min(remainingToday, remainingMonth));
      if (allowed <= 0) {
        console.warn("Worker: sending cap reached mid-run, remaining sends stay queued.");
        break;
      }
      const batch = sends.slice(i, i + Math.min(BATCH_SIZE, allowed));
      await Promise.all(batch.map(deliverOne));
      remainingToday -= batch.length;
      remainingMonth -= batch.length;
      if (i + BATCH_SIZE < sends.length) {
        await wait(adaptivePauseMs);
      }
    }
    // Release any claimed-but-unattempted sends back to the queue
    await supabaseAdmin
      .from("sends")
      .update({ status: "queued" })
      .eq("campaign_id", cid)
      .eq("status", "sending")
      .is("last_attempt_at", null);

    // Final check for completion of this campaign

    const { data: remainingUnfinished } = await supabaseAdmin
      .from("sends")
      .select("id")
      .eq("campaign_id", cid)
      .in("status", ["queued", "sending"]);

    if (!remainingUnfinished || remainingUnfinished.length === 0) {
      await supabaseAdmin
        .from("campaigns")
        .update({ status: "completed", sent_at: new Date().toISOString() })
        .eq("id", cid);
    }
  }
}

export const sendCampaign = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => sendInput.parse(data))
  .handler(async ({ data }) => {
    const { assertOwner } = await import("./owner-guard.server");
    assertOwner();

    const apiKey = process.env["RESEND_API_KEY"];
    if (!apiKey) {
      throw new Error("RESEND_API_KEY is not configured.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const origin = new URL(getRequestUrl()).origin;

    const { data: campaign, error: campaignError } = await supabaseAdmin
      .from("campaigns")
      .select("*")
      .eq("id", data.campaignId)
      .maybeSingle();
    if (campaignError) throw new Error(campaignError.message);
    if (!campaign) throw new Error("Campaign not found.");
    if (campaign.status !== "draft" && campaign.status !== "approved") {
      throw new Error("This campaign has already been started or queued.");
    }

    const { data: sendSettings } = await supabaseAdmin
      .from("settings")
      .select("require_link_check, block_url_shorteners")
      .eq("id", "default")
      .maybeSingle();
    const requireLinkCheck = sendSettings?.require_link_check ?? true;
    const blockShorteners = sendSettings?.block_url_shorteners ?? true;

    // Security gate: check links
    const urlsToCheck = new Set<string>();
    if (campaign.offer_url) urlsToCheck.add(campaign.offer_url);
    for (const match of (campaign.body_html || "").matchAll(/href\s*=\s*["']([^"']+)["']/gi)) {
      const href = match[1]?.trim();
      if (href && !href.startsWith("{{") && !href.startsWith("mailto:")) urlsToCheck.add(href);
    }
    for (const candidate of urlsToCheck) {
      const { issues } = inspectUrl(candidate);
      if (hasBlockingIssue(issues)) {
        throw new Error(
          `Unsafe link blocked (${candidate}): ${issues.find((i) => i.level === "error")?.message}`,
        );
      }
      if (blockShorteners && issues.some((i) => i.message.startsWith("Shortened links"))) {
        throw new Error(`Shortened link blocked (${candidate}). Use the full destination URL.`);
      }
      if (requireLinkCheck) {
        try {
          const probe = await fetch(candidate, {
            method: "GET",
            redirect: "follow",
            signal: AbortSignal.timeout(2500),
          });
          if (probe.status >= 400) {
            throw new Error(`Link check failed (${candidate}): HTTP ${probe.status}`);
          }
        } catch (error) {
          if (error instanceof Error && error.name === "TimeoutError") {
            console.warn(`Link check probe timed out for ${candidate}, allowing queueing.`);
          } else {
            throw new Error(
              error instanceof Error && error.message.startsWith("Link check failed")
                ? error.message
                : `Link check failed (${candidate}): the URL could not be reached.`,
            );
          }
        }
      }
    }


    // Recipient snapshotting: only select subscribed leads with active suppression status
    const { data: leads, error: leadsError } = await supabaseAdmin
      .from("leads")
      .select("id, email, name")
      .eq("subscribed", true)
      .or("suppression_status.is.null,suppression_status.eq.active");

    if (leadsError) throw new Error(leadsError.message);
    if (!leads || leads.length === 0) throw new Error("No eligible subscribed leads to send to.");

    // Claim draft
    const { data: claimedCampaign, error: claimError } = await supabaseAdmin
      .from("campaigns")
      .update({
        status: "queued",
        approved_at: new Date().toISOString(),
        approved_by: "Owner",
        recipient_count: leads.length,
      })
      .eq("id", campaign.id)
      .select("id")
      .maybeSingle();
    if (claimError) throw new Error(claimError.message);
    if (!claimedCampaign) throw new Error("This campaign is already being processed.");

    // Audit log approval
    await supabaseAdmin.from("audit_logs").insert({
      action: "campaign_approved",
      details: { campaignId: campaign.id, recipientCount: leads.length, mode: "immediate" },
    });

    // Insert queued send records
    const { error: sendsError } = await supabaseAdmin
      .from("sends")
      .insert(
        leads.map((lead) => ({
          campaign_id: campaign.id,
          lead_id: lead.id,
          status: "queued",
          attempt_count: 0,
        })),
      );
    if (sendsError) {
      await supabaseAdmin.from("campaigns").update({ status: "draft" }).eq("id", campaign.id);
      throw new Error(sendsError.message);
    }

    // Launch worker in background without blocking response
    runQueueWorker(campaign.id, origin).catch((err) => {
      console.error("Queue worker background failure:", err);
    });

    return { queued: true, count: leads.length };
  });

export const scheduleCampaign = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => scheduleInput.parse(data))
  .handler(async ({ data }) => {
    const { assertOwner } = await import("./owner-guard.server");
    assertOwner();

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: campaign } = await supabaseAdmin
      .from("campaigns")
      .select("id, status")
      .eq("id", data.campaignId)
      .maybeSingle();

    if (!campaign) throw new Error("Campaign not found.");

    const { data: leads } = await supabaseAdmin
      .from("leads")
      .select("id")
      .eq("subscribed", true)
      .or("suppression_status.is.null,suppression_status.eq.active");

    const recipientCount = leads?.length || 0;

    await supabaseAdmin
      .from("campaigns")
      .update({
        status: "scheduled",
        scheduled_for: data.scheduledFor,
        approved_at: new Date().toISOString(),
        approved_by: "Owner",
        recipient_count: recipientCount,
      })
      .eq("id", data.campaignId);

    // Populate queued send records so when scheduled_for arrives, worker delivers them
    if (leads && leads.length > 0) {
      await supabaseAdmin.from("sends").delete().eq("campaign_id", data.campaignId).eq("status", "queued");
      await supabaseAdmin
        .from("sends")
        .insert(
          leads.map((lead) => ({
            campaign_id: data.campaignId,
            lead_id: lead.id,
            status: "queued",
            attempt_count: 0,
          })),
        );
    }

    // Audit log schedule
    await supabaseAdmin.from("audit_logs").insert({
      action: "campaign_scheduled",
      details: { campaignId: data.campaignId, scheduledFor: data.scheduledFor, recipientCount },
    });

    return { scheduled: true, scheduledFor: data.scheduledFor };
  });

export const cancelScheduledCampaign = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => sendInput.parse(data))
  .handler(async ({ data }) => {
    const { assertOwner } = await import("./owner-guard.server");
    assertOwner();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    await supabaseAdmin
      .from("campaigns")
      .update({ status: "draft", scheduled_for: null })
      .eq("id", data.campaignId);

    await supabaseAdmin
      .from("sends")
      .delete()
      .eq("campaign_id", data.campaignId)
      .eq("status", "queued");

    await supabaseAdmin.from("audit_logs").insert({
      action: "campaign_schedule_cancelled",
      details: { campaignId: data.campaignId },
    });

    return { success: true };
  });

export const sendScheduledNow = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => sendInput.parse(data))
  .handler(async ({ data }) => {
    const { assertOwner } = await import("./owner-guard.server");
    assertOwner();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const origin = new URL(getRequestUrl()).origin;

    await supabaseAdmin
      .from("campaigns")
      .update({ status: "queued", scheduled_for: null })
      .eq("id", data.campaignId);

    runQueueWorker(data.campaignId, origin).catch((err) => {
      console.error("Send scheduled now background failure:", err);
    });

    return { success: true };
  });

const sendTestEmailInput = z.object({
  campaignId: z.string().uuid(),
  testEmail: z.string().trim().email(),
});

export const sendTestEmail = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => sendTestEmailInput.parse(data))
  .handler(async ({ data }) => {
    const { assertOwner } = await import("./owner-guard.server");
    assertOwner();

    const apiKey = process.env["RESEND_API_KEY"];
    if (!apiKey) throw new Error("RESEND_API_KEY is not configured.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { signSendToken } = await import("./link-safety");
    const origin = new URL(getRequestUrl()).origin;

    const { data: campaign } = await supabaseAdmin
      .from("campaigns")
      .select("*")
      .eq("id", data.campaignId)
      .maybeSingle();

    if (!campaign) throw new Error("Campaign not found.");

    const { data: settings } = await supabaseAdmin
      .from("settings")
      .select("*")
      .eq("id", "default")
      .maybeSingle();

    const businessName = settings?.business_name || "Campaign Companion";
    const postalAddress = settings?.postal_address || "123 Business Street, Mumbai, MH 400001, India";
    const supportEmail = settings?.support_email || "support@example.com";
    const fromAddress = settings?.from_address || FROM_ADDRESS;

    let leadId: string;
    const { data: existingLead } = await supabaseAdmin
      .from("leads")
      .select("id")
      .eq("email", data.testEmail.toLowerCase())
      .maybeSingle();

    if (existingLead) {
      leadId = existingLead.id;
    } else {
      const { data: newLead, error: leadErr } = await supabaseAdmin
        .from("leads")
        .insert({
          email: data.testEmail.toLowerCase(),
          name: "Test Recipient",
          consent_source: "test_send",
          consent_date: new Date().toISOString(),
          consent_note: "Created for test email verification",
          subscribed: true,
        })
        .select("id")
        .single();
      if (leadErr) throw new Error(leadErr.message);
      leadId = newLead.id;
    }

    const { data: sendRecord, error: sendErr } = await supabaseAdmin
      .from("sends")
      .insert({
        campaign_id: campaign.id,
        lead_id: leadId,
        status: "sending",
        attempt_count: 1,
        last_attempt_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (sendErr) throw new Error(sendErr.message);
    const sendId = sendRecord.id;

    const sig = signSendToken(sendId);
    const clickUrl = `${origin}/track/click?send_id=${sendId}&sig=${sig}`;
    const pixelUrl = `${origin}/track/open?send_id=${sendId}&sig=${sig}`;
    const unsubUrl = `${origin}/track/unsubscribe?send_id=${sendId}&sig=${sig}`;

    let html = campaign.body_html || "";
    html = html.replaceAll("{{offer_link}}", clickUrl);
    html = html.replaceAll("{{name}}", "Test Recipient");
    if (campaign.offer_url) {
      html = html.replaceAll(campaign.offer_url, clickUrl);
    }

    html += `<div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280;text-align:center;line-height:1.5;">
      <p style="background:#fef3c7;color:#92400e;padding:4px 8px;border-radius:4px;display:inline-block;font-weight:600;margin-bottom:8px;">TEST EMAIL DELIVERABILITY PROBE</p>
      <p>Sent by <strong>${businessName}</strong> · ${postalAddress}</p>
      <p>Questions? Contact <a href="mailto:${supportEmail}" style="color:#6b7280;">${supportEmail}</a> · <a href="${unsubUrl}" style="color:#6b7280;text-decoration:underline;">Unsubscribe</a></p>
    </div>`;
    html += `<img src="${pixelUrl}" width="1" height="1" alt="" style="display:block;border:0;" />`;

    const plainText = campaign.body_text || html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [data.testEmail],
        subject: `[TEST] ${campaign.subject}`,
        html,
        text: plainText,
        headers: {
          "List-Unsubscribe": `<${unsubUrl}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      }),
    });

    if (!res.ok) {
      const body = (await res.text()).replaceAll(/\s+/g, " ").slice(0, 300);
      const failureReason = `Resend returned ${res.status}${body ? `: ${body}` : ""}`;
      await supabaseAdmin
        .from("sends")
        .update({ status: "failed", failure_reason: failureReason })
        .eq("id", sendId);
      throw new Error(failureReason);
    }

    const resData = await res.json().catch(() => ({}));
    await supabaseAdmin
      .from("sends")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        provider_message_id: resData.id || null,
      })
      .eq("id", sendId);

    await supabaseAdmin.from("audit_logs").insert({
      action: "test_email_sent",
      details: { campaignId: campaign.id, testEmail: data.testEmail, sendId },
    });

    return {
      success: true,
      sendId,
      recipientEmail: data.testEmail,
      pixelUrl,
      clickUrl,
    };
  });

export const retryFailedSends = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => sendInput.parse(data))
  .handler(async ({ data }) => {
    const { assertOwner } = await import("./owner-guard.server");
    assertOwner();

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const origin = new URL(getRequestUrl()).origin;

    const { error: sendsError } = await supabaseAdmin
      .from("sends")
      .update({ status: "queued", failure_reason: null, attempt_count: 0 })
      .eq("campaign_id", data.campaignId)
      .eq("status", "failed");

    if (sendsError) throw new Error(sendsError.message);

    await supabaseAdmin
      .from("campaigns")
      .update({ status: "sending" })
      .eq("id", data.campaignId);

    // Audit log retry
    await supabaseAdmin.from("audit_logs").insert({
      action: "retry_failed_sends",
      details: { campaignId: data.campaignId },
    });

    runQueueWorker(data.campaignId, origin).catch((err) => {
      console.error("Retry failed sends worker error:", err);
    });

    return { success: true };
  });

export const retrySingleSend = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => retrySendInput.parse(data))
  .handler(async ({ data }) => {
    const { assertOwner } = await import("./owner-guard.server");
    assertOwner();

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const origin = new URL(getRequestUrl()).origin;

    const { data: send } = await supabaseAdmin
      .from("sends")
      .select("id, campaign_id")
      .eq("id", data.sendId)
      .maybeSingle();

    if (!send) throw new Error("Send record not found.");

    await supabaseAdmin
      .from("sends")
      .update({ status: "queued", failure_reason: null, attempt_count: 0 })
      .eq("id", send.id);

    await supabaseAdmin
      .from("campaigns")
      .update({ status: "sending" })
      .eq("id", send.campaign_id);

    // Audit log single retry
    await supabaseAdmin.from("audit_logs").insert({
      action: "retry_single_send",
      details: { sendId: data.sendId, campaignId: send.campaign_id },
    });

    runQueueWorker(send.campaign_id, origin).catch((err) => {
      console.error("Retry single send worker error:", err);
    });

    return { success: true };
  });

export const checkAndRepairQueue = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ campaignId: z.string().uuid().optional() }).parse(data ?? {}))
  .handler(async ({ data }) => {
    const { assertOwner } = await import("./owner-guard.server");
    assertOwner();

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const origin = new URL(getRequestUrl()).origin;

    const apiKeyConfigured = Boolean(process.env["RESEND_API_KEY"]);

    // 1. Reset any stuck sends in 'sending' status older than 5 seconds
    const cutoff = new Date(Date.now() - 5_000).toISOString();
    let resetQuery = supabaseAdmin
      .from("sends")
      .update({ status: "queued" })
      .eq("status", "sending")
      .or(`last_attempt_at.is.null,last_attempt_at.lt.${cutoff}`);

    if (data.campaignId) resetQuery = resetQuery.eq("campaign_id", data.campaignId);

    const { count: resetCount } = await resetQuery.select("id", { count: "exact", head: true });

    // 2. Trigger worker
    if (apiKeyConfigured) {
      await runQueueWorker(data.campaignId, origin);
    }

    // 3. Gather queue status metrics
    let sendsQuery = supabaseAdmin.from("sends").select("status");
    if (data.campaignId) sendsQuery = sendsQuery.eq("campaign_id", data.campaignId);

    const { data: sends } = await sendsQuery;

    const queuedCount = (sends ?? []).filter((s) => s.status === "queued").length;
    const sendingCount = (sends ?? []).filter((s) => s.status === "sending").length;
    const sentCount = (sends ?? []).filter((s) => s.status === "sent").length;
    const failedCount = (sends ?? []).filter((s) => s.status === "failed").length;

    return {
      success: true,
      apiKeyConfigured,
      resetStuckCount: resetCount ?? 0,
      queuedCount,
      sendingCount,
      sentCount,
      failedCount,
      message: !apiKeyConfigured
        ? "Warning: RESEND_API_KEY is not configured in environment variables."
        : resetCount && resetCount > 0
          ? `Reset ${resetCount} stuck send(s) back to queued status and restarted delivery worker.`
          : "Queue check complete. Background worker triggered.",
    };
  });

export const stopCampaignSending = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => sendInput.parse(data))
  .handler(async ({ data }) => {
    const { assertOwner } = await import("./owner-guard.server");
    assertOwner();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Mark campaign as cancelled
    await supabaseAdmin
      .from("campaigns")
      .update({ status: "cancelled" })
      .eq("id", data.campaignId);

    // Mark any unsent sends as skipped
    const { count } = await supabaseAdmin
      .from("sends")
      .update({
        status: "skipped",
        failure_reason: "Sending manually stopped by owner",
      })
      .eq("campaign_id", data.campaignId)
      .in("status", ["queued", "sending"]);

    await supabaseAdmin.from("audit_logs").insert({
      action: "campaign_sending_stopped",
      details: { campaignId: data.campaignId, skippedSendsCount: count ?? 0 },
    });

    return { success: true, skippedCount: count ?? 0 };
  });

export const resumeCampaignSending = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => sendInput.parse(data))
  .handler(async ({ data }) => {
    const { assertOwner } = await import("./owner-guard.server");
    assertOwner();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const origin = new URL(getRequestUrl()).origin;

    // Reset skipped/failed sends back to queued
    await supabaseAdmin
      .from("sends")
      .update({ status: "queued", failure_reason: null, attempt_count: 0 })
      .eq("campaign_id", data.campaignId)
      .in("status", ["skipped", "failed"]);

    // Mark campaign as queued
    await supabaseAdmin
      .from("campaigns")
      .update({ status: "queued" })
      .eq("id", data.campaignId);

    await supabaseAdmin.from("audit_logs").insert({
      action: "campaign_sending_resumed",
      details: { campaignId: data.campaignId },
    });

    runQueueWorker(data.campaignId, origin).catch((err) => {
      console.error("Resume campaign background worker error:", err);
    });

    return { success: true };
  });

export const rescheduleCampaign = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => scheduleInput.parse(data))
  .handler(async ({ data }) => {
    const { assertOwner } = await import("./owner-guard.server");
    assertOwner();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const newDate = new Date(data.scheduledFor);
    if (isNaN(newDate.getTime()) || newDate.getTime() <= Date.now()) {
      throw new Error("Rescheduled date must be a valid future time.");
    }

    const { error } = await supabaseAdmin
      .from("campaigns")
      .update({
        status: "scheduled",
        scheduled_for: newDate.toISOString(),
      })
      .eq("id", data.campaignId);

    if (error) throw new Error(error.message);

    await supabaseAdmin.from("audit_logs").insert({
      action: "campaign_rescheduled",
      details: { campaignId: data.campaignId, newScheduledFor: newDate.toISOString() },
    });

    return { success: true, scheduledFor: newDate.toISOString() };
  });





