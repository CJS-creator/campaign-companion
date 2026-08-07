import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/webhooks/resend")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json();
          const { type, data } = body || {};

          // Resend webhook events: email.bounced, email.complained
          if (type === "email.bounced" || type === "email.complained") {
            const recipient = data?.to?.[0] || data?.email;
            if (recipient) {
              const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
              await supabaseAdmin
                .from("leads")
                .update({ subscribed: false })
                .eq("email", recipient.toLowerCase());
            }
          }

          return new Response(JSON.stringify({ received: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Webhook error";
          return new Response(JSON.stringify({ error: message }), { status: 400 });
        }
      },
    },
  },
});
