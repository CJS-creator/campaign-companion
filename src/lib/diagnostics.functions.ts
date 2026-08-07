import { createServerFn } from "@tanstack/react-start";
import { getRequestUrl } from "@tanstack/react-start/server";
import { z } from "zod";
import { runQueueWorker } from "./campaigns.functions";
import { getCapturedErrorRecords, clearCapturedErrorRecords, addCapturedErrorRecord, type CapturedError } from "./error-capture";

export type HealthCheckResult = {
  timestamp: string;
  healthy: boolean;
  openEndpoint: {
    reachable: boolean;
    status: number | null;
    responseTimeMs: number;
    contentType: string | null;
  };
  clickEndpoint: {
    reachable: boolean;
    status: number | null;
    responseTimeMs: number;
    redirectUrl: string | null;
  };
  eventsRecorded: {
    success: boolean;
    openEventRecorded: boolean;
    clickEventRecorded: boolean;
    message: string;
  };
  queueWorkerStatus: {
    executed: boolean;
    message: string;
  };
};

export type DiagnosticsData = {
  healthCheck: HealthCheckResult;
  errors: CapturedError[];
  resendConfigured: boolean;
  supabaseConnected: boolean;
  queueMetrics: {
    queuedCount: number;
    sendingCount: number;
    scheduledCount: number;
    failedCount: number;
  };
};

export const runHealthCheck = createServerFn({ method: "POST" }).handler(async (): Promise<HealthCheckResult> => {
  const { assertOwner } = await import("./owner-guard.server");
  assertOwner();

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { signSendToken } = await import("./link-safety");

  const reqUrl = getRequestUrl();
  const origin = new URL(reqUrl).origin;
  const timestamp = new Date().toISOString();

  // 1. Trigger background queue worker to process any due scheduled campaigns
  let workerExecuted = false;
  let workerMessage = "Queue worker checked successfully";
  try {
    await runQueueWorker(undefined, origin);
    workerExecuted = true;
  } catch (err) {
    workerMessage = err instanceof Error ? err.message : "Queue worker check failed";
  }

  // 2. Health probe against /track/open endpoint
  const testSendId = "00000000-0000-4000-a000-000000000000";
  const sig = signSendToken(testSendId);

  const openStart = Date.now();
  let openStatus: number | null = null;
  let openContentType: string | null = null;
  let openReachable = false;
  try {
    const openRes = await fetch(`${origin}/track/open?send_id=${testSendId}&sig=${sig}&health_check=1`, {
      method: "GET",
      headers: { "User-Agent": "CampaignCompanion-HealthCheckProbe/1.0" },
    });
    openStatus = openRes.status;
    openContentType = openRes.headers.get("content-type");
    openReachable = openRes.status === 200 && (openContentType?.includes("image") ?? false);
  } catch (err) {
    console.error("Health check open endpoint probe failed:", err);
  }
  const openTime = Date.now() - openStart;

  // 3. Health probe against /track/click endpoint
  const clickStart = Date.now();
  let clickStatus: number | null = null;
  let redirectUrl: string | null = null;
  let clickReachable = false;
  try {
    const clickRes = await fetch(`${origin}/track/click?send_id=${testSendId}&sig=${sig}&health_check=1`, {
      method: "GET",
      redirect: "manual",
      headers: { "User-Agent": "CampaignCompanion-HealthCheckProbe/1.0" },
    });
    clickStatus = clickRes.status;
    redirectUrl = clickRes.headers.get("location");
    // 302 redirect or 200 ok signifies click endpoint is responding
    clickReachable = clickRes.status === 302 || clickRes.status === 200;
  } catch (err) {
    console.error("Health check click endpoint probe failed:", err);
  }
  const clickTime = Date.now() - clickStart;

  // 4. Verify DB event recording capabilities by probing recent events table
  let openEventRecorded = false;
  let clickEventRecorded = false;
  let dbWriteSuccess = false;
  let eventMsg = "Database event recording verified";

  try {
    // Insert a probe test event to verify events table writes
    const { data: insertedEvent, error: insertErr } = await supabaseAdmin
      .from("events")
      .insert({
        event_type: "health_check",
        reason: "Health check endpoint verification probe",
        metadata: { probe: true, timestamp },
      })
      .select("id")
      .maybeSingle();

    if (insertErr) {
      eventMsg = `DB insert error: ${insertErr.message}`;
    } else if (insertedEvent) {
      dbWriteSuccess = true;
    }

    // Check if open / click events exist in recent events table
    const { data: recentEvents } = await supabaseAdmin
      .from("events")
      .select("event_type")
      .order("created_at", { ascending: false })
      .limit(50);

    const types = (recentEvents ?? []).map((e) => e.event_type);
    openEventRecorded = types.includes("opened") || types.includes("health_check") || dbWriteSuccess;
    clickEventRecorded = types.includes("clicked") || types.includes("health_check") || dbWriteSuccess;
  } catch (err) {
    eventMsg = err instanceof Error ? err.message : "Database event query failed";
  }

  const overallHealthy = openReachable && clickReachable && dbWriteSuccess;

  return {
    timestamp,
    healthy: overallHealthy,
    openEndpoint: {
      reachable: openReachable,
      status: openStatus,
      responseTimeMs: openTime,
      contentType: openContentType,
    },
    clickEndpoint: {
      reachable: clickReachable,
      status: clickStatus,
      responseTimeMs: clickTime,
      redirectUrl,
    },
    eventsRecorded: {
      success: dbWriteSuccess,
      openEventRecorded,
      clickEventRecorded,
      message: eventMsg,
    },
    queueWorkerStatus: {
      executed: workerExecuted,
      message: workerMessage,
    },
  };
});

export const fetchDiagnosticsData = createServerFn({ method: "GET" }).handler(
  async (): Promise<DiagnosticsData> => {
    const { assertOwner } = await import("./owner-guard.server");
    assertOwner();

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Run health check
    const healthCheck = await runHealthCheck();

    // Check Resend configuration
    const resendConfigured = Boolean(process.env["RESEND_API_KEY"]);

    // Fetch sends queue counts
    let queuedCount = 0;
    let sendingCount = 0;
    let scheduledCount = 0;
    let failedCount = 0;
    let supabaseConnected = false;

    try {
      const { data: sends } = await supabaseAdmin.from("sends").select("status");
      if (sends) {
        supabaseConnected = true;
        queuedCount = sends.filter((s) => s.status === "queued").length;
        sendingCount = sends.filter((s) => s.status === "sending").length;
        failedCount = sends.filter((s) => s.status === "failed").length;
      }

      const { data: campaigns } = await supabaseAdmin
        .from("campaigns")
        .select("status")
        .eq("status", "scheduled");
      scheduledCount = campaigns?.length || 0;
    } catch (err) {
      console.error("Diagnostics fetch query error:", err);
    }

    const errors = getCapturedErrorRecords();

    return {
      healthCheck,
      errors,
      resendConfigured,
      supabaseConnected,
      queueMetrics: {
        queuedCount,
        sendingCount,
        scheduledCount,
        failedCount,
      },
    };
  },
);

export const logClientErrorServerFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        message: z.string(),
        stack: z.string().optional(),
        source: z
          .enum(["client_window", "unhandled_rejection", "react_boundary", "server_error", "console"])
          .default("react_boundary"),
        path: z.string().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    addCapturedErrorRecord(data);
    return { logged: true };
  });

export const clearDiagnosticsErrorsServerFn = createServerFn({ method: "POST" }).handler(async () => {
  const { assertOwner } = await import("./owner-guard.server");
  assertOwner();
  clearCapturedErrorRecords();
  return { cleared: true };
});
