import { createServerFn } from "@tanstack/react-start";
import { getRequestUrl } from "@tanstack/react-start/server";
import { z } from "zod";

const sendInput = z.object({ campaignId: z.string().uuid() });

export const FROM_ADDRESS = "onboarding@resend.dev";

export const sendCampaign = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => sendInput.parse(data))
  .handler(async ({ data }) => {
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
    if (campaign.status === "sent") throw new Error("This campaign has already been sent.");

    const { data: leads, error: leadsError } = await supabaseAdmin
      .from("leads")
      .select("id, email, name")
      .eq("subscribed", true);
    if (leadsError) throw new Error(leadsError.message);
    if (!leads || leads.length === 0) throw new Error("No subscribed leads to send to.");

    const { data: sends, error: sendsError } = await supabaseAdmin
      .from("sends")
      .insert(leads.map((lead) => ({ campaign_id: campaign.id, lead_id: lead.id })))
      .select("id, lead_id");
    if (sendsError) throw new Error(sendsError.message);

    const leadById = new Map(leads.map((l) => [l.id, l]));
    let delivered = 0;
    const failures: string[] = [];

    for (const send of sends ?? []) {
      const lead = leadById.get(send.lead_id);
      if (!lead) continue;

      const clickUrl = `${origin}/track/click?send_id=${send.id}`;
      const pixelUrl = `${origin}/track/open?send_id=${send.id}`;

      let html = campaign.body_html || "";
      html = html.replaceAll("{{offer_link}}", clickUrl);
      html = html.replaceAll("{{name}}", lead.name ?? "there");
      if (campaign.offer_url) {
        html = html.replaceAll(campaign.offer_url, clickUrl);
      }
      html += `<img src="${pixelUrl}" width="1" height="1" alt="" style="display:block;border:0;" />`;

      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            from: FROM_ADDRESS,
            to: [lead.email],
            subject: campaign.subject,
            html,
          }),
        });

        if (!res.ok) {
          const body = await res.text();
          console.error(`Resend failed [${res.status}] for ${lead.email}: ${body}`);
          failures.push(`${lead.email}: ${res.status}`);
          continue;
        }

        await supabaseAdmin
          .from("sends")
          .update({ sent_at: new Date().toISOString() })
          .eq("id", send.id);
        delivered += 1;
      } catch (err) {
        console.error("Resend request error", err);
        failures.push(`${lead.email}: request failed`);
      }
    }

    await supabaseAdmin
      .from("campaigns")
      .update({ status: "sent", sent_at: new Date().toISOString() })
      .eq("id", campaign.id);

    return { delivered, attempted: leads.length, failures };
  });
