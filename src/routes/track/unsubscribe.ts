import { createFileRoute } from "@tanstack/react-router";
import { verifySendToken } from "@/lib/link-safety";

export const Route = createFileRoute("/track/unsubscribe")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const sendId = url.searchParams.get("send_id");
        const sig = url.searchParams.get("sig");

        if (!sendId || !verifySendToken(sendId, sig)) {
          return new Response("Invalid or expired unsubscribe link.", {
            status: 400,
            headers: { "Content-Type": "text/html" },
          });
        }

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: send } = await supabaseAdmin
            .from("sends")
            .select("id, lead_id")
            .eq("id", sendId)
            .maybeSingle();

          if (send) {
            await supabaseAdmin
              .from("leads")
              .update({ subscribed: false })
              .eq("id", send.lead_id);
          }
        } catch (err) {
          console.error("Unsubscribe error:", err);
        }

        return new Response(
          `<!DOCTYPE html>
          <html>
            <head><title>Unsubscribed</title><style>body{font-family:sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#fafafa;color:#333;}div{background:#fff;padding:2rem;border-radius:8px;border:1px solid #eee;box-shadow:0 2px 4px rgba(0,0,0,0.05);text-align:center;}</style></head>
            <body>
              <div>
                <h2>You have been unsubscribed</h2>
                <p>You will no longer receive marketing emails from this sender.</p>
              </div>
            </body>
          </html>`,
          {
            status: 200,
            headers: { "Content-Type": "text/html; charset=utf-8" },
          }
        );
      },
      POST: async ({ request }) => {
        // RFC 8058 One-Click Unsubscribe POST handler
        const url = new URL(request.url);
        const sendId = url.searchParams.get("send_id");
        const sig = url.searchParams.get("sig");

        if (!sendId || !verifySendToken(sendId, sig)) {
          return new Response("Unauthorized", { status: 400 });
        }

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: send } = await supabaseAdmin
            .from("sends")
            .select("id, lead_id")
            .eq("id", sendId)
            .maybeSingle();

          if (send) {
            await supabaseAdmin
              .from("leads")
              .update({ subscribed: false })
              .eq("id", send.lead_id);
          }
        } catch (err) {
          console.error("RFC 8058 Unsubscribe POST error:", err);
        }

        return new Response("OK", { status: 200 });
      },
    },
  },
});
