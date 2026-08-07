import { createFileRoute } from "@tanstack/react-router";
import { runQueueWorker } from "@/lib/campaigns.functions";

export const Route = createFileRoute("/api/worker/process-queue")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authHeader = request.headers.get("authorization");
        const expectedKey = process.env["WORKER_SECRET_KEY"] || process.env["SUPABASE_SERVICE_ROLE_KEY"];

        // Optional key check if defined in environment
        if (expectedKey && authHeader !== `Bearer ${expectedKey}`) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        const url = new URL(request.url);
        const campaignId = url.searchParams.get("campaign_id") || undefined;
        const origin = url.origin;

        try {
          await runQueueWorker(campaignId, origin);
          return new Response(JSON.stringify({ status: "success", campaignId }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Worker process failed";
          return new Response(JSON.stringify({ error: message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
