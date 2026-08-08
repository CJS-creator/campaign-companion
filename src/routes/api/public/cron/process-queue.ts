import { createFileRoute } from "@tanstack/react-router";
import { runQueueWorker } from "@/lib/campaigns.functions";

/**
 * Queue drainer, called on a schedule (pg_cron) or manually.
 * Authenticated with a private worker key: either the vault-stored key the
 * scheduled job sends, or the WORKER_SECRET_KEY env secret. The public
 * anon/publishable key is NOT accepted — it ships to every browser.
 */
export const Route = createFileRoute("/api/public/cron/process-queue")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const provided =
          request.headers.get("x-worker-key") ??
          request.headers.get("apikey") ??
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
          "";

        const envKey = process.env["WORKER_SECRET_KEY"];
        let authorized = Boolean(envKey && provided && provided === envKey);

        if (!authorized && provided) {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data } = await supabaseAdmin.rpc("verify_worker_key", { p_key: provided });
          authorized = data === true;
        }

        if (!authorized) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }


        const url = new URL(request.url);
        const campaignId = url.searchParams.get("campaign_id") || undefined;

        try {
          await runQueueWorker(campaignId, url.origin);
          return new Response(JSON.stringify({ status: "ok", campaignId: campaignId ?? null }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Worker process failed";
          console.error("Queue worker failed:", message);
          return new Response(JSON.stringify({ error: message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
