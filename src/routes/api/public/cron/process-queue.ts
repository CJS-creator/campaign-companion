import { createFileRoute } from "@tanstack/react-router";
import { runQueueWorker } from "@/lib/campaigns.functions";

/**
 * Queue drainer, called on a schedule (pg_cron) or manually.
 * Authenticated with the project's publishable/anon key in the `apikey` header.
 */
export const Route = createFileRoute("/api/public/cron/process-queue")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const provided =
          request.headers.get("apikey") ??
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
          "";

        const allowed = [
          process.env["SUPABASE_PUBLISHABLE_KEY"],
          process.env["SUPABASE_ANON_KEY"],
          process.env["WORKER_SECRET_KEY"],
        ].filter((k): k is string => Boolean(k));

        if (allowed.length === 0 || !allowed.includes(provided)) {
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
