import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/track/click")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const sendId = url.searchParams.get("send_id");
        let destination = url.origin;

        if (sendId) {
          try {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const { data: send } = await supabaseAdmin
              .from("sends")
              .select("id, campaign_id")
              .eq("id", sendId)
              .maybeSingle();

            if (send) {
              await supabaseAdmin
                .from("sends")
                .update({ clicked_at: new Date().toISOString() })
                .eq("id", send.id)
                .is("clicked_at", null);

              const { data: campaign } = await supabaseAdmin
                .from("campaigns")
                .select("offer_url")
                .eq("id", send.campaign_id)
                .maybeSingle();

              if (campaign?.offer_url) destination = campaign.offer_url;
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
