import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Activity,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Server,
  Zap,
  Trash2,
  Clock,
  Terminal,
  ShieldCheck,
  Radio,
  FileCode,
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
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { CheckSendingOptionDialog } from "@/components/CheckSendingOptionDialog";

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
    refetchInterval: 15000, // Background health check poll every 15 seconds
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
        <p className="text-sm">Running diagnostic health probes…</p>
      </div>
    );
  }

  const health = data?.healthCheck;
  const errors = data?.errors || [];
  const metrics = data?.queueMetrics;

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-semibold tracking-tight">System Diagnostics</h1>
            <Badge
              variant={health?.healthy ? "default" : "destructive"}
              className={health?.healthy ? "bg-emerald-600 hover:bg-emerald-700" : ""}
            >
              {health?.healthy ? "Systems Normal" : "Issues Detected"}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground flex items-center gap-2">
            <Radio className="size-3.5 text-emerald-500 animate-pulse" />
            Background health check active · Auto-refreshing every 15s
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <CheckSendingOptionDialog />
          <Button
            type="button"
            onClick={() => healthCheckMutation.mutate()}
            disabled={healthCheckMutation.isPending || isRefetching}
          >
            <RefreshCw
              className={`size-4 mr-1.5 ${healthCheckMutation.isPending || isRefetching ? "animate-spin" : ""}`}
            />
            {healthCheckMutation.isPending ? "Probing…" : "Run Diagnostic Check"}
          </Button>
        </div>
      </header>

      {/* Top Health Metric Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4 space-y-2">
          <div className="flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground">
            <span>/track/open</span>
            <Eye className="size-4 text-purple-500" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-xl font-bold">
              {health?.openEndpoint.reachable ? "Reachable" : "Unreachable"}
            </span>
            <Badge variant={health?.openEndpoint.reachable ? "outline" : "destructive"} className="text-xs">
              HTTP {health?.openEndpoint.status ?? "ERR"}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Latency: {health?.openEndpoint.responseTimeMs}ms · {health?.openEndpoint.contentType || "GIF pixel"}
          </p>
        </Card>

        <Card className="p-4 space-y-2">
          <div className="flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground">
            <span>/track/click</span>
            <Zap className="size-4 text-amber-500" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-xl font-bold">
              {health?.clickEndpoint.reachable ? "Reachable" : "Unreachable"}
            </span>
            <Badge variant={health?.clickEndpoint.reachable ? "outline" : "destructive"} className="text-xs">
              HTTP {health?.clickEndpoint.status ?? "ERR"}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Latency: {health?.clickEndpoint.responseTimeMs}ms · 302 Redirect wrapper
          </p>
        </Card>

        <Card className="p-4 space-y-2">
          <div className="flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground">
            <span>Event Database Writes</span>
            <Server className="size-4 text-blue-500" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-xl font-bold">
              {health?.eventsRecorded.success ? "Verified" : "Failing"}
            </span>
            {health?.eventsRecorded.success ? (
              <CheckCircle2 className="size-5 text-emerald-600" />
            ) : (
              <XCircle className="size-5 text-destructive" />
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate">{health?.eventsRecorded.message}</p>
        </Card>

        <Card className="p-4 space-y-2">
          <div className="flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground">
            <span>Queue & Resend API</span>
            <Mail className="size-4 text-emerald-500" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-xl font-bold">
              {data?.resendConfigured ? "Configured" : "Missing API Key"}
            </span>
            <Badge variant={data?.resendConfigured ? "default" : "destructive"} className="text-xs">
              {metrics?.queuedCount ? `${metrics.queuedCount} Queued` : "Idle"}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            {metrics?.scheduledCount ? `${metrics.scheduledCount} scheduled campaign(s)` : "No pending scheduled sends"}
          </p>
        </Card>
      </div>

      {/* Tracking Endpoints Detailed Audit Card */}
      <Card className="p-5 space-y-4">
        <h2 className="text-base font-semibold flex items-center gap-2">
          <ShieldCheck className="size-5 text-primary" />
          Tracking Endpoints Reachability & Recording Status
        </h2>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-md border p-3 text-xs space-y-2 bg-muted/20">
            <div className="flex items-center justify-between font-medium">
              <span className="font-mono text-sm text-foreground">GET /track/open</span>
              {health?.openEndpoint.reachable ? (
                <Badge className="bg-emerald-600">200 OK</Badge>
              ) : (
                <Badge variant="destructive">FAILED</Badge>
              )}
            </div>
            <p className="text-muted-foreground">
              Embeds transparent 1x1 GIF pixels into HTML campaign bodies. Records open events in real time.
            </p>
            <div className="font-mono text-[11px] text-muted-foreground bg-background p-2 rounded border">
              Response Time: {health?.openEndpoint.responseTimeMs}ms | Content-Type: {health?.openEndpoint.contentType}
            </div>
          </div>

          <div className="rounded-md border p-3 text-xs space-y-2 bg-muted/20">
            <div className="flex items-center justify-between font-medium">
              <span className="font-mono text-sm text-foreground">GET /track/click</span>
              {health?.clickEndpoint.reachable ? (
                <Badge className="bg-emerald-600">302 Found</Badge>
              ) : (
                <Badge variant="destructive">FAILED</Badge>
              )}
            </div>
            <p className="text-muted-foreground">
              Wraps offer links with cryptographic token signatures. Updates click metrics & redirects recipient.
            </p>
            <div className="font-mono text-[11px] text-muted-foreground bg-background p-2 rounded border">
              Response Time: {health?.clickEndpoint.responseTimeMs}ms | Location: {health?.clickEndpoint.redirectUrl || "Origin URL"}
            </div>
          </div>
        </div>
      </Card>

      {/* Client & Server Error Logs Section */}
      <Card className="p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold flex items-center gap-2">
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
            >
              <Trash2 className="size-3.5 mr-1.5" /> Clear Error Log
            </Button>
          )}
        </div>

        {errors.length === 0 ? (
          <div className="rounded-md border border-dashed py-12 text-center text-muted-foreground space-y-2">
            <CheckCircle2 className="size-8 text-emerald-500 mx-auto" />
            <p className="text-sm font-medium text-foreground">No recent errors captured!</p>
            <p className="text-xs max-w-sm mx-auto">
              Client window exceptions and server errors will appear here automatically if triggered.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-md border text-sm">
            <table className="w-full text-xs text-left">
              <thead className="border-b bg-muted/40 font-medium uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="p-3">Time</th>
                  <th className="p-3">Source</th>
                  <th className="p-3">Path</th>
                  <th className="p-3">Error Message</th>
                  <th className="p-3 text-right">Details</th>
                </tr>
              </thead>
              <tbody>
                {errors.map((err) => {
                  const isExpanded = expandedErrorId === err.id;
                  return (
                    <Fragment key={err.id}>
                      <tr className="border-b last:border-0 hover:bg-muted/20">
                        <td className="p-3 font-mono text-muted-foreground whitespace-nowrap">
                          {new Date(err.timestamp).toLocaleTimeString()}
                        </td>
                        <td className="p-3">
                          <Badge variant="outline" className="text-[10px]">
                            {err.source}
                          </Badge>
                        </td>
                        <td className="p-3 font-mono text-muted-foreground">{err.path || "/"}</td>
                        <td className="p-3 font-medium text-destructive max-w-md truncate">{err.message}</td>
                        <td className="p-3 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => setExpandedErrorId(isExpanded ? null : err.id)}
                          >
                            {isExpanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                          </Button>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-muted/30 border-b">
                          <td colSpan={5} className="p-3">
                            <div className="space-y-2 text-xs font-mono">
                              <p className="font-semibold text-foreground">Stack Trace:</p>
                              <pre className="p-3 rounded bg-background border overflow-x-auto text-[11px] leading-relaxed text-muted-foreground">
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
      </Card>
    </div>
  );
}
