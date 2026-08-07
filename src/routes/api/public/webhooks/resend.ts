import { createFileRoute } from "@tanstack/react-router";
import crypto from "node:crypto";

/**
 * Resend webhook receiver (Svix-signed).
 * Handles bounces, complaints, deliveries, opens and clicks.
 */
function verifySvixSignature(
  secret: string,
  headers: Headers,
  payload: string,
): boolean {
  const id = headers.get("svix-id");
  const timestamp = headers.get("svix-timestamp");
  const signatureHeader = headers.get("svix-signature");
  if (!id || !timestamp || !signatureHeader) return false;

  // Reject replays older than 5 minutes
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false;

  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = crypto
    .createHmac("sha256", key)
    .update(`${id}.${timestamp}.${payload}`)
    .digest("base64");

  const expectedBuf = Buffer.from(expected);
  return signatureHeader
    .split(" ")
    .map((part) => part.split(",")[1] ?? "")
    .some((sig) => {
      const sigBuf = Buffer.from(sig);
      return sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf);
    });
}

export const Route = createFileRoute("/api/public/webhooks/resend")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["RESEND_WEBHOOK_SECRET"];
        const raw = await request.text();

        if (!secret) {
          console.error("Resend webhook rejected: RESEND_WEBHOOK_SECRET is not configured.");
          return new Response(JSON.stringify({ error: "Webhook not configured" }), {
            status: 503,
            headers: { "Content-Type": "application/json" },
          });
        }

        if (!verifySvixSignature(secret, request.headers, raw)) {
          return new Response(JSON.stringify({ error: "Invalid signature" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        let body: { type?: string; data?: Record<string, unknown> };
        try {
          body = JSON.parse(raw);
        } catch {
          return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
        }

        const type = body.type ?? "";
        const data = (body.data ?? {}) as {
          to?: string[];
          email?: string;
          email_id?: string;
          bounce?: { type?: string };
        };
        const recipient = (Array.isArray(data.to) ? data.to[0] : data.email)?.toLowerCase();
        const messageId = data.email_id;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Resolve the matching send record when the provider message id is known
        let sendId: string | null = null;
        let leadId: string | null = null;
        if (messageId) {
          const { data: send } = await supabaseAdmin
            .from("sends")
            .select("id, lead_id")
            .eq("provider_message_id", messageId)
            .maybeSingle();
          sendId = send?.id ?? null;
          leadId = send?.lead_id ?? null;
        }

        const nowIso = new Date().toISOString();

        if (type === "email.bounced" || type === "email.complained") {
          const suppression = type === "email.complained" ? "complained" : "bounced";
          if (recipient) {
            await supabaseAdmin
              .from("leads")
              .update({
                subscribed: false,
                suppression_status: suppression,
                suppression_reason: `Resend reported ${type}`,
                suppressed_at: nowIso,
              })
              .eq("email", recipient);
          }
          if (sendId) {
            await supabaseAdmin
              .from("sends")
              .update({ status: "failed", failure_reason: `Resend reported ${type}` })
              .eq("id", sendId);
          }
        }

        if (type === "email.delivered" && sendId) {
          await supabaseAdmin.from("sends").update({ status: "sent" }).eq("id", sendId);
        }

        if (type === "email.opened" && sendId) {
          await supabaseAdmin
            .from("sends")
            .update({ opened_at: nowIso })
            .eq("id", sendId)
            .is("opened_at", null);
        }

        if (type === "email.clicked" && sendId) {
          await supabaseAdmin
            .from("sends")
            .update({ clicked_at: nowIso })
            .eq("id", sendId)
            .is("clicked_at", null);
        }

        await supabaseAdmin.from("events").insert({
          send_id: sendId,
          lead_id: leadId,
          event_type: type || "unknown",
          reason: data.bounce?.type ?? null,
          metadata: { provider: "resend", recipient: recipient ?? null, message_id: messageId ?? null },
        });

        return new Response(JSON.stringify({ received: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
