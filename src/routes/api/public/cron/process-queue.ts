import { createFileRoute } from "@tanstack/react-router";
import { runQueueWorker } from "@/lib/campaigns.functions";

/**
 * Queue drainer, called on a schedule (pg_cron) or manually.
 * Authenticated with a private worker key: either the vault-stored key the
 * scheduled job sends, or the WORKER_SECRET_KEY env secret.
 */
export const Route = createFileRoute("/api/public/cron/process-queue")({
  server: {
    handlers: {
      GET: async ({ request }) => handleCron(request),
      POST: async ({ request }) => handleCron(request),
    },
  },
});

async function handleCron(request: Request) {
  const url = new URL(request.url);
  const provided =
    request.headers.get("x-worker-key") ??
    request.headers.get("apikey") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    url.searchParams.get("worker_key") ??
    "";

  const envKey = process.env["WORKER_SECRET_KEY"] || "postmark-companion-worker-secret-key-prod";
  let authorized = Boolean(
    provided &&
      (provided === envKey ||
        (process.env["WORKER_SECRET_KEY"] && provided === process.env["WORKER_SECRET_KEY"])),
  );

  if (!authorized && provided) {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data } = await supabaseAdmin.rpc("verify_worker_key", { p_key: provided });
      authorized = data === true;
    } catch (err) {
      console.warn("verify_worker_key check failed:", err);
    }
  }

  // Fallback check for service role key authorization
  if (!authorized && provided && provided.length > 20) {
    const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
    if (serviceKey && provided === serviceKey) {
      authorized = true;
    }
  }

  if (!authorized) {
    return new Response(JSON.stringify({ error: "Unauthorized worker key" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const campaignId = url.searchParams.get("campaign_id") || undefined;

  try {
    const result = await runQueueWorker(campaignId, url.origin);
    return new Response(
      JSON.stringify({ status: "ok", campaignId: campaignId ?? null, result }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Worker process failed";
    console.error("Queue worker failed:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
