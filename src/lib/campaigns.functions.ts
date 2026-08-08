import { createServerFn } from "@tanstack/react-start";
import { getRequestUrl } from "@tanstack/react-start/server";
import { z } from "zod";
import { inspectUrl, hasBlockingIssue } from "./link-safety";
import { isVerifiedSenderAddress, SENDER_REQUIRED_MESSAGE } from "./sender";

const sendInput = z.object({ campaignId: z.string().uuid() });
const retrySendInput = z.object({ sendId: z.string().uuid() });

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const MAX_ATTEMPTS = 3;

const scheduleInput = z.object({ campaignId: z.string().uuid(), scheduledFor: z.string() });

async function parseResendError(res: Response): Promise<string> {
  const status = res.status;
  let rawText = "";
  try {
    rawText = await res.text();
  } catch {
    rawText = "";
  }

  let jsonDetail: { message?: string; name?: string; statusCode?: number; error?: string } | null =
    null;
  if (rawText) {
    try {
      jsonDetail = JSON.parse(rawText);
    } catch {
      // plain text
    }
  }

  let detailMsg = (jsonDetail?.message || jsonDetail?.error || rawText)
    .replaceAll(/\s+/g, " ")
    .trim();
  if (detailMsg.length > 350) detailMsg = detailMsg.slice(0, 350) + "…";

  if (status === 403) {
    return `HTTP 403 Forbidden: Resend domain validation failed — ${detailMsg || "Sender address domain is not verified in Resend account."}`;
  }
  if (status === 422) {
    return `HTTP 422 Unprocessable Entity: ${detailMsg || "Invalid recipient email address or payload format."}`;
  }
  if (status === 400) {
    return `HTTP 400 Bad Request: ${detailMsg || "Invalid email payload."}`;
  }
  if (status === 429) {
    return `HTTP 429 Rate Limit Exceeded: ${detailMsg || "Too many requests to Resend API."}`;
  }
  return `Resend returned HTTP ${status}${detailMsg ? `: ${detailMsg}` : ""}`;
}

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
  const fromAddress = (settings?.from_address ?? "").trim();
  if (!isVerifiedSenderAddress(fromAddress)) {
    console.error("Worker error: " + SENDER_REQUIRED_MESSAGE);
    return;
  }

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
  let remainingToday = enforceCaps
    ? dailyCap - (await countSince(dayStart))
    : Number.MAX_SAFE_INTEGER;
  let remainingMonth = enforceCaps
    ? monthlyCap - (await countSince(monthStart))
    : Number.MAX_SAFE_INTEGER;
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

    if (
      !campaign ||
      campaign.status === "completed" ||
      campaign.status === "sent" ||
      campaign.status === "cancelled" ||
      campaign.status === "draft"
    )
      continue;

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

      const plainText =
        campaign.body_text ||
        html
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim();

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

        const failureReason = await parseResendError(res);

        // Hard bounce / invalid email handling -> permanently suppress
        if (res.status === 400 || failureReason.toLowerCase().includes("invalid")) {
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

        await supabaseAdmin.from("audit_logs").insert({
          action: "send_failed",
          details: {
            campaignId: cid,
            sendId: send.id,
            leadEmail: lead.email,
            status: res.status,
            error: failureReason,
          },
        });
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

      sendCampaignCompletionNotification(cid, defaultOrigin).catch((err) => {
        console.error("Worker error sending completion notification:", err);
      });
    }
  }
}

export const sendCampaign = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => sendInput.parse(data))
  .handler(async ({ data }) => {
    const { assertOwner } = await import("./owner-guard.server");
    const sendUser = await assertOwner();


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
      .select("require_link_check, block_url_shorteners, from_address, enforce_caps, daily_cap, monthly_cap")
      .eq("id", "default")
      .maybeSingle();
    if (!isVerifiedSenderAddress((sendSettings?.from_address ?? "").trim())) {
      throw new Error(SENDER_REQUIRED_MESSAGE);
    }
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

    // Recipient snapshotting: only this account's subscribed leads with active suppression status
    const { data: leads, error: leadsError } = await supabaseAdmin
      .from("leads")
      .select("id, email, name")
      .eq("subscribed", true)
      .or(`user_id.eq.${sendUser.userId},user_id.is.null`)
      .or("suppression_status.is.null,suppression_status.eq.active");

    if (leadsError) throw new Error(leadsError.message);
    if (!leads || leads.length === 0) throw new Error("No eligible subscribed leads to send to.");

    // Sending caps: refuse to queue a run the caps cannot deliver today.
    if (sendSettings?.enforce_caps ?? true) {
      const dailyCap = sendSettings?.daily_cap ?? 100;
      const monthlyCap = sendSettings?.monthly_cap ?? 3000;
      const now = new Date();
      const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const usedSince = async (since: string) => {
        const { count } = await supabaseAdmin
          .from("sends")
          .select("id", { count: "exact", head: true })
          .eq("status", "sent")
          .gte("sent_at", since);
        return count ?? 0;
      };
      const remainingToday = dailyCap - (await usedSince(dayStart));
      const remainingMonth = monthlyCap - (await usedSince(monthStart));
      if (remainingToday <= 0 || remainingMonth <= 0) {
        throw new Error(
          `Sending cap reached (${remainingToday <= 0 ? "daily" : "monthly"}). Try again later or raise the cap in Settings.`,
        );
      }
      if (leads.length > Math.min(remainingToday, remainingMonth)) {
        throw new Error(
          `This campaign targets ${leads.length} recipients but only ${Math.min(remainingToday, remainingMonth)} sends remain within your cap. Raise the cap in Settings or split the send.`,
        );
      }
    }



    // Claim draft
    const { data: claimedCampaign, error: claimError } = await supabaseAdmin
      .from("campaigns")
      .update({
        status: "queued",
        approved_at: new Date().toISOString(),
        approved_by: sendUser.email || "Owner",
        recipient_count: leads.length,
      })
      .eq("id", campaign.id)
      .select("id")
      .maybeSingle();
    if (claimError) throw new Error(claimError.message);
    if (!claimedCampaign) throw new Error("This campaign is already being processed.");

    // Audit log approval
    await supabaseAdmin.from("audit_logs").insert({
      user_id: sendUser.userId,
      action: "campaign_approved",
      details: { campaignId: campaign.id, recipientCount: leads.length, mode: "immediate" },
    });

    // Insert queued send records
    const { error: sendsError } = await supabaseAdmin.from("sends").insert(
      leads.map((lead) => ({
        user_id: sendUser.userId,
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
    const schedUser = await assertOwner();


    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: schedSettings } = await supabaseAdmin
      .from("settings")
      .select("from_address")
      .eq("id", "default")
      .maybeSingle();
    if (!isVerifiedSenderAddress((schedSettings?.from_address ?? "").trim())) {
      throw new Error(SENDER_REQUIRED_MESSAGE);
    }

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
      .or(`user_id.eq.${schedUser.userId},user_id.is.null`)
      .or("suppression_status.is.null,suppression_status.eq.active");

    const recipientCount = leads?.length || 0;

    await supabaseAdmin
      .from("campaigns")
      .update({
        status: "scheduled",
        scheduled_for: data.scheduledFor,
        approved_at: new Date().toISOString(),
        approved_by: schedUser.email || "Owner",
        recipient_count: recipientCount,
      })
      .eq("id", data.campaignId);

    // Populate queued send records so when scheduled_for arrives, worker delivers them
    if (leads && leads.length > 0) {
      await supabaseAdmin
        .from("sends")
        .delete()
        .eq("campaign_id", data.campaignId)
        .eq("status", "queued");
      await supabaseAdmin.from("sends").insert(
        leads.map((lead) => ({
          user_id: schedUser.userId,
          campaign_id: data.campaignId,
          lead_id: lead.id,
          status: "queued",
          attempt_count: 0,
        })),
      );
    }

    // Audit log schedule
    await supabaseAdmin.from("audit_logs").insert({
      user_id: schedUser.userId,
      action: "campaign_scheduled",
      details: { campaignId: data.campaignId, scheduledFor: data.scheduledFor, recipientCount },
    });


    return { scheduled: true, scheduledFor: data.scheduledFor };
  });

export const cancelScheduledCampaign = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => sendInput.parse(data))
  .handler(async ({ data }) => {
    const { assertOwner } = await import("./owner-guard.server");
    await assertOwner();
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
    await assertOwner();
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
    await assertOwner();

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
    const postalAddress =
      settings?.postal_address || "123 Business Street, Mumbai, MH 400001, India";
    const supportEmail = settings?.support_email || "support@example.com";
    const fromAddress = (settings?.from_address ?? "").trim();
    if (!isVerifiedSenderAddress(fromAddress)) throw new Error(SENDER_REQUIRED_MESSAGE);

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

    const plainText =
      campaign.body_text ||
      html
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();

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
      const failureReason = await parseResendError(res);
      await supabaseAdmin
        .from("sends")
        .update({ status: "failed", failure_reason: failureReason })
        .eq("id", sendId);

      await supabaseAdmin.from("audit_logs").insert({
        action: "test_email_failed",
        details: {
          campaignId: campaign.id,
          testEmail: data.testEmail,
          sendId,
          error: failureReason,
          fromAddress,
        },
      });

      return {
        success: false,
        sendId,
        recipientEmail: data.testEmail,
        fromAddress,
        status: "failed",
        failureReason,
        providerMessageId: null,
        pixelUrl,
        clickUrl,
      };
    }

    const resData = await res.json().catch(() => ({}));
    await supabaseAdmin
      .from("sends")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        provider_message_id: resData.id || null,
        failure_reason: null,
      })
      .eq("id", sendId);

    await supabaseAdmin.from("audit_logs").insert({
      action: "test_email_sent",
      details: { campaignId: campaign.id, testEmail: data.testEmail, sendId, fromAddress },
    });

    return {
      success: true,
      sendId,
      recipientEmail: data.testEmail,
      fromAddress,
      status: "sent",
      failureReason: null,
      providerMessageId: resData.id || null,
      pixelUrl,
      clickUrl,
    };
  });

export const retryFailedSends = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => sendInput.parse(data))
  .handler(async ({ data }) => {
    const { assertOwner } = await import("./owner-guard.server");
    await assertOwner();

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const origin = new URL(getRequestUrl()).origin;

    const { error: sendsError } = await supabaseAdmin
      .from("sends")
      .update({ status: "queued", failure_reason: null, attempt_count: 0 })
      .eq("campaign_id", data.campaignId)
      .eq("status", "failed");

    if (sendsError) throw new Error(sendsError.message);

    await supabaseAdmin.from("campaigns").update({ status: "sending" }).eq("id", data.campaignId);

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
    await assertOwner();

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

    await supabaseAdmin.from("campaigns").update({ status: "sending" }).eq("id", send.campaign_id);

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
  .inputValidator((data: unknown) =>
    z.object({ campaignId: z.string().uuid().optional() }).parse(data ?? {}),
  )
  .handler(async ({ data }) => {
    const { assertOwner } = await import("./owner-guard.server");
    await assertOwner();

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

    const { data: resetRows } = await resetQuery.select("id");
    const resetCount = resetRows?.length ?? 0;

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
    await assertOwner();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Mark campaign as cancelled
    await supabaseAdmin.from("campaigns").update({ status: "cancelled" }).eq("id", data.campaignId);

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
    await assertOwner();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const origin = new URL(getRequestUrl()).origin;

    // Reset skipped/failed sends back to queued
    await supabaseAdmin
      .from("sends")
      .update({ status: "queued", failure_reason: null, attempt_count: 0 })
      .eq("campaign_id", data.campaignId)
      .in("status", ["skipped", "failed"]);

    // Mark campaign as queued
    await supabaseAdmin.from("campaigns").update({ status: "queued" }).eq("id", data.campaignId);

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
    await assertOwner();
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

export async function sendCampaignCompletionNotification(campaignId: string, origin?: string) {
  const apiKey = process.env["RESEND_API_KEY"];
  if (!apiKey) return;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: campaign } = await supabaseAdmin
    .from("campaigns")
    .select("*")
    .eq("id", campaignId)
    .maybeSingle();
  if (!campaign) return;

  const { data: settings } = await supabaseAdmin
    .from("settings")
    .select("*")
    .eq("id", "default")
    .maybeSingle();

  const fromAddress = (settings?.from_address ?? "").trim();
  const supportEmail = (settings?.support_email ?? "").trim();
  const businessName = settings?.business_name || "Campaign Companion";
  const postalAddress =
    settings?.postal_address || "123 Business Street, Tech Park, Mumbai, MH 400050, India";

  if (!isVerifiedSenderAddress(fromAddress) || !supportEmail) return;

  const { data: sends } = await supabaseAdmin
    .from("sends")
    .select("status")
    .eq("campaign_id", campaignId);

  const totalSends = sends?.length || 0;
  const sentCount = sends?.filter((s) => s.status === "sent").length || 0;
  const failedCount = sends?.filter((s) => s.status === "failed").length || 0;

  const appOrigin = origin || "http://localhost:3000";
  const campaignUrl = `${appOrigin}/campaigns/${campaignId}`;

  const html = `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px;background-color:#ffffff;color:#1f2937;">
    <div style="background-color:#ecfdf5;border:1px solid #a7f3d0;padding:16px 20px;border-radius:8px;margin-bottom:24px;">
      <h2 style="color:#065f46;margin:0 0 6px 0;font-size:20px;font-weight:700;">🎉 Campaign Delivery Complete</h2>
      <p style="color:#047857;margin:0;font-size:14px;">Your marketing email campaign has been fully processed and dispatched by the delivery queue.</p>
    </div>

    <table style="width:100%;border-collapse:collapse;margin-bottom:24px;font-size:14px;line-height:1.6;">
      <tr style="border-b:1px solid #f3f4f6;">
        <td style="padding:10px 0;color:#6b7280;width:35%;font-weight:500;">Campaign Subject:</td>
        <td style="padding:10px 0;color:#111827;font-weight:700;">${campaign.subject}</td>
      </tr>
      <tr style="border-b:1px solid #f3f4f6;">
        <td style="padding:10px 0;color:#6b7280;">Emails Delivered:</td>
        <td style="padding:10px 0;color:#059669;font-weight:700;">${sentCount} of ${totalSends} recipients</td>
      </tr>
      ${
        failedCount > 0
          ? `
      <tr style="border-b:1px solid #f3f4f6;">
        <td style="padding:10px 0;color:#6b7280;">Failed Attempts:</td>
        <td style="padding:10px 0;color:#dc2626;font-weight:700;">${failedCount} recipients</td>
      </tr>
      `
          : ""
      }
      <tr>
        <td style="padding:10px 0;color:#6b7280;">Completion Time:</td>
        <td style="padding:10px 0;color:#111827;">${new Date().toLocaleString()}</td>
      </tr>
    </table>

    <div style="text-align:center;margin:32px 0 24px 0;">
      <a href="${campaignUrl}" style="background-color:#2563eb;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;display:inline-block;box-shadow:0 1px 3px rgba(0,0,0,0.1);">View Campaign Analytics Dashboard &rarr;</a>
    </div>

    <div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280;text-align:center;line-height:1.5;">
      <p>Automated confirmation sent by <strong>${businessName}</strong> · ${postalAddress}</p>
    </div>
  </div>
  `;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [supportEmail],
        subject: `🎉 Campaign Sent Confirmation: "${campaign.subject}"`,
        html,
      }),
    });

    if (res.ok) {
      await supabaseAdmin.from("audit_logs").insert({
        action: "campaign_sent_confirmation_delivered",
        details: { campaignId, supportEmail, sentCount, failedCount },
      });
    }
  } catch (err) {
    console.error("Error dispatching campaign completion confirmation email:", err);
  }
}

const contactFormInput = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  email: z.string().trim().email("Valid email required").max(255),
  subject: z.string().trim().min(1, "Subject is required").max(200),
  message: z.string().trim().min(1, "Message is required").max(2000),
});

export const submitContactForm = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => contactFormInput.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Upsert or create lead from contact submission
    const { data: existingLead } = await supabaseAdmin
      .from("leads")
      .select("id")
      .eq("email", data.email.toLowerCase())
      .maybeSingle();

    if (!existingLead) {
      await supabaseAdmin.from("leads").insert({
        email: data.email.toLowerCase(),
        name: data.name,
        consent_source: "contact_form",
        consent_date: new Date().toISOString(),
        consent_note: `Submitted contact form message: "${data.subject}"`,
        subscribed: true,
      });
    }

    await supabaseAdmin.from("audit_logs").insert({
      action: "contact_form_submitted",
      details: { name: data.name, email: data.email, subject: data.subject },
    });

    const apiKey = process.env["RESEND_API_KEY"];
    const { data: settings } = await supabaseAdmin
      .from("settings")
      .select("*")
      .eq("id", "default")
      .maybeSingle();

    const fromAddress = (settings?.from_address ?? "").trim();
    const supportEmail = (settings?.support_email ?? "").trim();
    const businessName = settings?.business_name || "Campaign Companion";
    const postalAddress =
      settings?.postal_address || "123 Business Street, Tech Park, Mumbai, MH 400050, India";

    let notificationSent = false;
    let autoReplySent = false;

    if (apiKey && isVerifiedSenderAddress(fromAddress) && supportEmail) {
      // 1. Send Notification Email to Owner
      const notificationHtml = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px;background-color:#ffffff;color:#1f2937;">
        <div style="background-color:#eff6ff;border:1px solid #bfdbfe;padding:14px 18px;border-radius:8px;margin-bottom:20px;">
          <h2 style="color:#1e40af;margin:0 0 4px 0;font-size:18px;font-weight:700;">📬 New Contact Form Message Received</h2>
          <p style="color:#1d4ed8;margin:0;font-size:13px;">A new message was submitted via your application contact form.</p>
        </div>

        <div style="background-color:#f9fafb;border:1px solid #e5e7eb;padding:16px;border-radius:8px;margin-bottom:20px;font-size:14px;line-height:1.6;">
          <p style="margin:4px 0;"><strong>Sender Name:</strong> ${data.name}</p>
          <p style="margin:4px 0;"><strong>Sender Email:</strong> <a href="mailto:${data.email}" style="color:#2563eb;">${data.email}</a></p>
          <p style="margin:4px 0;"><strong>Subject:</strong> ${data.subject}</p>
          <p style="margin:4px 0;"><strong>Received At:</strong> ${new Date().toLocaleString()}</p>
        </div>

        <div style="background-color:#ffffff;border:1px solid #e5e7eb;padding:18px;border-radius:8px;margin-bottom:24px;">
          <h4 style="margin:0 0 10px 0;color:#374151;font-size:14px;text-transform:uppercase;letter-spacing:0.05em;">Message Body:</h4>
          <p style="white-space:pre-wrap;color:#1f2937;margin:0;font-size:14px;line-height:1.6;">${data.message}</p>
        </div>

        <div style="text-align:center;margin-bottom:24px;">
          <a href="mailto:${data.email}?subject=Re: ${encodeURIComponent(data.subject)}" style="background-color:#2563eb;color:#ffffff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;display:inline-block;">Reply Direct to ${data.email}</a>
        </div>

        <div style="margin-top:24px;padding-top:14px;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280;text-align:center;">
          <p>Sent by <strong>${businessName}</strong> · ${postalAddress}</p>
        </div>
      </div>
      `;

      try {
        const notifRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            from: fromAddress,
            to: [supportEmail],
            replyTo: data.email,
            subject: `📬 Contact Form Submission: "${data.subject}" from ${data.name}`,
            html: notificationHtml,
          }),
        });
        notificationSent = notifRes.ok;
      } catch (e) {
        console.error("Failed to send contact notification email:", e);
      }

      // 2. Send Confirmation Auto-Reply Email to Visitor
      const autoReplyHtml = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px;background-color:#ffffff;color:#1f2937;">
        <h2 style="color:#111827;margin:0 0 12px 0;font-size:20px;">Thank you for reaching out, ${data.name}!</h2>
        <p style="color:#4b5563;font-size:14px;line-height:1.6;">
          We received your message regarding "<strong>${data.subject}</strong>". Our support team has been notified and will review your inquiry shortly.
        </p>

        <div style="background-color:#f9fafb;border:1px solid #e5e7eb;padding:16px;border-radius:8px;margin:20px 0;font-size:13px;color:#374151;">
          <p style="margin:0 0 6px 0;font-weight:600;color:#111827;">Your Submitted Message:</p>
          <p style="white-space:pre-wrap;margin:0;color:#4b5563;line-height:1.5;">${data.message}</p>
        </div>

        <p style="color:#6b7280;font-size:12px;margin-top:28px;border-top:1px solid #e5e7eb;padding-top:14px;text-align:center;">
          Sent by <strong>${businessName}</strong> · ${postalAddress}<br/>
          If you did not submit this request, you can safely ignore this email.
        </p>
      </div>
      `;

      try {
        const replyRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            from: fromAddress,
            to: [data.email],
            subject: `We received your message — ${businessName}`,
            html: autoReplyHtml,
          }),
        });
        autoReplySent = replyRes.ok;
      } catch (e) {
        console.error("Failed to send contact auto-reply email:", e);
      }
    }

    return {
      success: true,
      name: data.name,
      email: data.email,
      notificationSent,
      autoReplySent,
    };
  });

export const fetchDeliveryMonitorData = createServerFn({ method: "GET" }).handler(async () => {
  const { assertOwner } = await import("./owner-guard.server");
  await assertOwner();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: sends, error } = await supabaseAdmin
    .from("sends")
    .select(
      "id, campaign_id, lead_id, status, attempt_count, last_attempt_at, sent_at, failure_reason, provider_message_id, created_at",
    )
    .order("last_attempt_at", { ascending: false, nullsFirst: false })
    .limit(200);

  if (error) throw new Error(error.message);

  const campaignIds = Array.from(new Set((sends ?? []).map((s) => s.campaign_id).filter(Boolean)));
  const leadIds = Array.from(new Set((sends ?? []).map((s) => s.lead_id).filter(Boolean)));

  const { data: campaigns } = await supabaseAdmin
    .from("campaigns")
    .select("id, subject")
    .in("id", campaignIds.length ? campaignIds : ["00000000-0000-0000-0000-000000000000"]);

  const { data: leads } = await supabaseAdmin
    .from("leads")
    .select("id, email, name")
    .in("id", leadIds.length ? leadIds : ["00000000-0000-0000-0000-000000000000"]);

  const campaignMap = new Map((campaigns ?? []).map((c) => [c.id, c.subject]));
  const leadMap = new Map((leads ?? []).map((l) => [l.id, l]));

  return (sends ?? []).map((s) => {
    const lead = leadMap.get(s.lead_id);
    return {
      ...s,
      campaign_subject: campaignMap.get(s.campaign_id) || "Unknown Campaign",
      lead_email: lead?.email || "Unknown Lead",
      lead_name: lead?.name || null,
    };
  });
});
