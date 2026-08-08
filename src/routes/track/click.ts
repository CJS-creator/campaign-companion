import { createFileRoute } from "@tanstack/react-router";
import { verifySendToken, inspectUrl, hasBlockingIssue } from "@/lib/link-safety";

export const Route = createFileRoute("/track/click")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const sendId = url.searchParams.get("send_id");
        const sig = url.searchParams.get("sig");
        let destination = url.origin;

        const isValidToken = sendId && sig ? verifySendToken(sendId, sig) : true;

        if (sendId && isValidToken) {
          try {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const { data: send } = await supabaseAdmin
              .from("sends")
              .select("id, campaign_id, lead_id")
              .eq("id", sendId)
              .maybeSingle();

            if (send) {
              await supabaseAdmin
                .from("sends")
                .update({ clicked_at: new Date().toISOString() })
                .eq("id", send.id)
                .is("clicked_at", null);

              await supabaseAdmin.from("events").insert({
                send_id: send.id,
                lead_id: send.lead_id,
                campaign_id: send.campaign_id,
                event_type: "clicked",
                metadata: { source: "tracked_link" },
              });

              const { data: campaign } = await supabaseAdmin
                .from("campaigns")
                .select("offer_url")
                .eq("id", send.campaign_id)
                .maybeSingle();

              if (campaign?.offer_url) {
                const { url: parsedUrl, issues } = inspectUrl(campaign.offer_url);
                if (parsedUrl && !hasBlockingIssue(issues)) {
                  destination = parsedUrl.toString();
                }
              }
            }
          } catch (err) {
            console.error("track/click failed", err);
          }
        }

        return new Response(null, {
          status: 302,
          headers: { Location: destination, "Cache-Control": "no-store" },
        });
      },
    },
  },
});
