import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Activity,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Server,
  Zap,
  Trash2,
  Eye,
  Terminal,
  ShieldCheck,
  Radio,
  Mail,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useState, Fragment } from "react";
import {
  fetchDiagnosticsData,
  runHealthCheck,
  clearDiagnosticsErrorsServerFn,
} from "@/lib/diagnostics.functions";
import { Button } from "@/components/ui/button";
import { CheckSendingOptionDialog } from "@/components/CheckSendingOptionDialog";
import { EmailDeliveryMonitorView } from "@/components/EmailDeliveryMonitorView";
import { PageHeader, StatCard, StatusBadge } from "@/components/patterns";

export const Route = createFileRoute("/diagnostics")({
  head: () => ({
    meta: [
      { title: "Diagnostics & System Health — Postmark Studio" },
      {
        name: "description",
        content:
          "Monitor tracking endpoint reachability, event recording, client errors, and delivery queue health.",
      },
    ],
  }),
  component: DiagnosticsPage,
});

function DiagnosticsPage() {
  const queryClient = useQueryClient();
  const [expandedErrorId, setExpandedErrorId] = useState<string | null>(null);

  const { data, isLoading, isRefetching } = useQuery({
    queryKey: ["diagnostics"],
    queryFn: () => fetchDiagnosticsData(),
    refetchInterval: 15000,
  });

  const healthCheckMutation = useMutation({
    mutationFn: () => runHealthCheck(),
    onSuccess: () => {
      toast.success("Health check completed successfully!");
      queryClient.invalidateQueries({ queryKey: ["diagnostics"] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Health check probe failed");
    },
  });

  const clearErrorsMutation = useMutation({
    mutationFn: () => clearDiagnosticsErrorsServerFn(),
    onSuccess: () => {
      toast.success("Cleared captured error log");
      queryClient.invalidateQueries({ queryKey: ["diagnostics"] });
    },
  });

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
        <RefreshCw className="size-6 animate-spin text-primary" />
        <p className="text-sm font-medium">Running diagnostic health probes…</p>
      </div>
    );
  }

  const health = data?.healthCheck;
  const errors = data?.errors || [];
  const metrics = data?.queueMetrics;

  return (
    <div className="space-y-6">
      <PageHeader
        title="System Diagnostics"
        description="Monitor tracking endpoint reachability, real-time event recording, client runtime errors, and queue health."
        badge={{
          label: health?.healthy ? "Systems Normal" : "Issues Detected",
          variant: health?.healthy ? "success" : "warning",
        }}
        actions={
          <div className="flex flex-wrap gap-2">
            <CheckSendingOptionDialog />
            <Button
              type="button"
              onClick={() => healthCheckMutation.mutate()}
              disabled={healthCheckMutation.isPending || isRefetching}
              className="h-9 text-xs font-semibold shadow-xs"
              aria-label="Run diagnostic check now"
            >
              <RefreshCw
                className={`size-3.5 mr-1.5 ${healthCheckMutation.isPending || isRefetching ? "animate-spin" : ""}`}
              />
              {healthCheckMutation.isPending ? "Probing…" : "Run Diagnostic Check"}
            </Button>
          </div>
        }
      />

      {/* Top Health Metric Cards Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Eye}
          title="/track/open"
          value={health?.openEndpoint.reachable ? "Reachable" : "Unreachable"}
          subtitle={`Latency: ${health?.openEndpoint.responseTimeMs}ms`}
          badge={<StatusBadge status={health?.openEndpoint.reachable ? "sent" : "bounce"} label={`HTTP ${health?.openEndpoint.status ?? "ERR"}`} />}
        />
        <StatCard
          icon={Zap}
          title="/track/click"
          value={health?.clickEndpoint.reachable ? "Reachable" : "Unreachable"}
          subtitle={`Latency: ${health?.clickEndpoint.responseTimeMs}ms`}
          badge={<StatusBadge status={health?.clickEndpoint.reachable ? "sent" : "bounce"} label={`HTTP ${health?.clickEndpoint.status ?? "ERR"}`} />}
        />
        <StatCard
          icon={Server}
          title="Event Writes"
          value={health?.eventsRecorded.success ? "Verified" : "Failing"}
          subtitle={health?.eventsRecorded.message || "Database persistence OK"}
          badge={<StatusBadge status={health?.eventsRecorded.success ? "sent" : "bounce"} label={health?.eventsRecorded.success ? "OK" : "Error"} />}
        />
        <StatCard
          icon={Mail}
          title="Queue & API"
          value={data?.resendConfigured ? "Configured" : "Missing Key"}
          subtitle={metrics?.scheduledCount ? `${metrics.scheduledCount} scheduled campaign(s)` : "No pending scheduled sends"}
          badge={<StatusBadge status={data?.resendConfigured ? "sent" : "warning"} label={metrics?.queuedCount ? `${metrics.queuedCount} Queued` : "Idle"} />}
        />
      </div>

      {/* Tracking Endpoints Detailed Audit Surface */}
      <div className="glass-panel rounded-xl p-5 border border-border/80 space-y-4 shadow-xs">
        <h2 className="text-base font-bold flex items-center gap-2 font-heading text-foreground">
          <ShieldCheck className="size-5 text-primary" />
          Tracking Endpoints Reachability & Recording Status
        </h2>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-border/80 p-4 text-xs space-y-2.5 bg-muted/20">
            <div className="flex items-center justify-between font-medium">
              <span className="font-mono text-sm font-semibold text-foreground">GET /track/open</span>
              <StatusBadge status={health?.openEndpoint.reachable ? "sent" : "bounce"} label={health?.openEndpoint.reachable ? "200 OK" : "FAILED"} />
            </div>
            <p className="text-muted-foreground leading-relaxed">
              Embeds transparent 1x1 GIF pixels into HTML campaign bodies. Records open events in real time.
            </p>
            <div className="font-mono text-[11px] text-muted-foreground bg-card p-2.5 rounded border border-border/60">
              Response Time: {health?.openEndpoint.responseTimeMs}ms | Content-Type: {health?.openEndpoint.contentType || "image/gif"}
            </div>
          </div>

          <div className="rounded-lg border border-border/80 p-4 text-xs space-y-2.5 bg-muted/20">
            <div className="flex items-center justify-between font-medium">
              <span className="font-mono text-sm font-semibold text-foreground">GET /track/click</span>
              <StatusBadge status={health?.clickEndpoint.reachable ? "sent" : "bounce"} label={health?.clickEndpoint.reachable ? "302 Found" : "FAILED"} />
            </div>
            <p className="text-muted-foreground leading-relaxed">
              Wraps offer links with cryptographic token signatures. Updates click metrics & redirects recipient.
            </p>
            <div className="font-mono text-[11px] text-muted-foreground bg-card p-2.5 rounded border border-border/60">
              Response Time: {health?.clickEndpoint.responseTimeMs}ms | Location: {health?.clickEndpoint.redirectUrl || "Origin URL"}
            </div>
          </div>
        </div>
      </div>

      {/* Client & Server Error Logs Section */}
      <div className="glass-panel rounded-xl p-5 border border-border/80 space-y-4 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/60 pb-3">
          <div>
            <h2 className="text-base font-bold flex items-center gap-2 font-heading text-foreground">
              <Terminal className="size-5 text-destructive" />
              Recent Client & Server Errors ({errors.length})
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Captured out-of-band runtime exceptions, React boundary errors, and unhandled rejections.
            </p>
          </div>
          {errors.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => clearErrorsMutation.mutate()}
              disabled={clearErrorsMutation.isPending}
              className="h-8 text-xs font-semibold"
              aria-label="Clear captured error logs"
            >
              <Trash2 className="size-3.5 mr-1.5" /> Clear Error Log
            </Button>
          )}
        </div>

        {errors.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/80 py-12 text-center text-muted-foreground space-y-2 bg-muted/10">
            <CheckCircle2 className="size-8 text-success mx-auto" />
            <p className="text-sm font-bold text-foreground">No recent runtime errors captured</p>
            <p className="text-xs max-w-sm mx-auto">
              Client window exceptions and server errors will appear here automatically if triggered.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border/80 text-sm">
            <table className="w-full text-xs text-left">
              <thead className="border-b border-border/80 bg-muted/50 font-semibold uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="p-3">Time</th>
                  <th className="p-3">Source</th>
                  <th className="p-3">Path</th>
                  <th className="p-3">Error Message</th>
                  <th className="p-3 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60 bg-card">
                {errors.map((err) => {
                  const isExpanded = expandedErrorId === err.id;
                  return (
                    <Fragment key={err.id}>
                      <tr className="hover:bg-accent/40 transition-colors">
                        <td className="p-3 font-mono text-muted-foreground whitespace-nowrap">
                          {new Date(err.timestamp).toLocaleTimeString()}
                        </td>
                        <td className="p-3">
                          <StatusBadge status="warning" label={err.source} />
                        </td>
                        <td className="p-3 font-mono text-muted-foreground">{err.path || "/"}</td>
                        <td className="p-3 font-medium text-destructive max-w-md truncate">
                          {err.message}
                        </td>
                        <td className="p-3 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="size-7 p-0"
                            onClick={() => setExpandedErrorId(isExpanded ? null : err.id)}
                            aria-label="Toggle stack trace details"
                          >
                            {isExpanded ? (
                              <ChevronUp className="size-4" />
                            ) : (
                              <ChevronDown className="size-4" />
                            )}
                          </Button>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-muted/30 border-b border-border/60">
                          <td colSpan={5} className="p-4">
                            <div className="space-y-2 text-xs font-mono">
                              <p className="font-semibold text-foreground">Stack Trace:</p>
                              <pre className="p-3 rounded-lg bg-card border border-border/80 overflow-x-auto text-[11px] leading-relaxed text-muted-foreground">
                                {err.stack || err.message}
                              </pre>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <EmailDeliveryMonitorView />
    </div>
  );
}
