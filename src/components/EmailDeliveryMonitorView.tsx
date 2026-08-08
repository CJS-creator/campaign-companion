import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock,
  Copy,
  Filter,
  Mail,
  RefreshCw,
  Search,
  ShieldAlert,
  Zap,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { fetchDeliveryMonitorData, retrySingleSend } from "@/lib/campaigns.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

export function EmailDeliveryMonitorView() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const queryClient = useQueryClient();

  const fetchMonitor = useServerFn(fetchDeliveryMonitorData);
  const executeRetrySingle = useServerFn(retrySingleSend);

  const {
    data: attempts = [],
    isLoading,
    isRefetching,
  } = useQuery({
    queryKey: ["delivery-monitor"],
    queryFn: () => fetchMonitor(),
    refetchInterval: 5000, // Refresh every 5s for real-time monitoring
  });

  const retrySingleMutation = useMutation({
    mutationFn: (sendId: string) => executeRetrySingle({ data: { sendId } }),
    onSuccess: () => {
      toast.success("Queued single send attempt for delivery retry");
      queryClient.invalidateQueries({ queryKey: ["delivery-monitor"] });
      queryClient.invalidateQueries({ queryKey: ["sends"] });
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to retry send");
    },
  });

  const filtered = attempts.filter((item) => {
    if (statusFilter !== "all" && item.status !== statusFilter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      item.lead_email.toLowerCase().includes(q) ||
      item.campaign_subject.toLowerCase().includes(q) ||
      (item.failure_reason && item.failure_reason.toLowerCase().includes(q)) ||
      (item.provider_message_id && item.provider_message_id.toLowerCase().includes(q))
    );
  });

  const totalCount = attempts.length;
  const sentCount = attempts.filter((a) => a.status === "sent").length;
  const failedCount = attempts.filter((a) => a.status === "failed").length;
  const sendingCount = attempts.filter((a) => a.status === "sending").length;
  const queuedCount = attempts.filter((a) => a.status === "queued").length;

  const copyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`Copied ${label} to clipboard`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <Activity className="size-5 text-primary" />
            Email Delivery Monitoring & Error Logs
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Real-time feed of recent send attempts, Resend HTTP status codes, and API response error
            details.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => queryClient.invalidateQueries({ queryKey: ["delivery-monitor"] })}
          disabled={isLoading || isRefetching}
        >
          <RefreshCw className={`size-3.5 mr-1.5 ${isRefetching ? "animate-spin" : ""}`} />
          Refresh Feed
        </Button>
      </div>

      {/* Metric Cards Summary */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-3.5 space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Total Send Attempts</span>
            <Mail className="size-3.5 text-blue-500" />
          </div>
          <div className="text-2xl font-bold tabular-nums">{totalCount}</div>
          <p className="text-[11px] text-muted-foreground">Recorded in queue</p>
        </Card>

        <Card className="p-3.5 space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Delivered (Sent)</span>
            <CheckCircle2 className="size-3.5 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold text-emerald-600 tabular-nums">{sentCount}</div>
          <p className="text-[11px] text-muted-foreground">HTTP 200 Success</p>
        </Card>

        <Card className="p-3.5 space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Failed / Errored</span>
            <AlertCircle className="size-3.5 text-destructive" />
          </div>
          <div className="text-2xl font-bold text-destructive tabular-nums">{failedCount}</div>
          <p className="text-[11px] text-muted-foreground">Resend API errors (e.g. 403, 422)</p>
        </Card>

        <Card className="p-3.5 space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>In-Flight / Queued</span>
            <Zap className="size-3.5 text-amber-500" />
          </div>
          <div className="text-2xl font-bold text-amber-600 tabular-nums">
            {sendingCount + queuedCount}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {sendingCount} sending · {queuedCount} queued
          </p>
        </Card>
      </div>

      {/* Search & Filter Bar */}
      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="size-4 absolute left-3 top-2.5 text-muted-foreground" />
            <Input
              placeholder="Search recipient, subject, or error code (e.g. 403)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 text-xs"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-muted-foreground flex items-center gap-1 mr-1">
              <Filter className="size-3.5" /> Status:
            </span>
            {(["all", "sent", "failed", "sending", "queued"] as const).map((st) => (
              <Button
                key={st}
                variant={statusFilter === st ? "default" : "outline"}
                size="sm"
                className="h-7 text-[11px] capitalize px-2.5"
                onClick={() => setStatusFilter(st)}
              >
                {st}
              </Button>
            ))}
          </div>
        </div>
      </Card>

      {/* Main Attempts Monitoring Table */}
      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="border-b bg-muted/40 text-left uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Attempt Time</th>
                <th className="px-4 py-3 font-medium">Recipient</th>
                <th className="px-4 py-3 font-medium">Campaign</th>
                <th className="px-4 py-3 font-medium">Status & Attempts</th>
                <th className="px-4 py-3 font-medium">Resend Response / Error Log</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    <RefreshCw className="size-5 animate-spin mx-auto mb-2 text-primary" />
                    Loading delivery monitor logs…
                  </td>
                </tr>
              )}
              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                    No send attempts match these filters.
                  </td>
                </tr>
              )}
              {filtered.map((item) => {
                const isFailed = item.status === "failed";
                const isSent = item.status === "sent";
                const isSending = item.status === "sending";

                return (
                  <tr key={item.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                      <div className="font-mono text-[11px]">
                        {item.last_attempt_at || item.sent_at
                          ? new Date(item.last_attempt_at || item.sent_at!).toLocaleTimeString()
                          : "Pending"}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {item.last_attempt_at || item.sent_at
                          ? new Date(item.last_attempt_at || item.sent_at!).toLocaleDateString()
                          : "—"}
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <div className="font-medium">{item.lead_email}</div>
                      {item.lead_name && (
                        <div className="text-[10px] text-muted-foreground">{item.lead_name}</div>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      <Link
                        to="/campaigns/$id"
                        params={{ id: item.campaign_id }}
                        className="font-medium hover:underline text-primary"
                      >
                        {item.campaign_subject}
                      </Link>
                    </td>

                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        {isSent && (
                          <Badge className="bg-emerald-600 text-white text-[10px]">
                            <CheckCircle2 className="size-3 mr-1" /> Sent
                          </Badge>
                        )}
                        {isFailed && (
                          <Badge variant="destructive" className="text-[10px]">
                            <AlertCircle className="size-3 mr-1" /> Failed
                          </Badge>
                        )}
                        {isSending && (
                          <Badge
                            variant="secondary"
                            className="text-[10px] bg-amber-500/10 text-amber-700 border-amber-500/30"
                          >
                            <Zap className="size-3 mr-1 animate-pulse" /> Sending
                          </Badge>
                        )}
                        {!isSent && !isFailed && !isSending && (
                          <Badge variant="outline" className="text-[10px]">
                            <Clock className="size-3 mr-1" /> Queued
                          </Badge>
                        )}
                        <span className="text-[10px] text-muted-foreground font-mono">
                          ({item.attempt_count} try)
                        </span>
                      </div>
                    </td>

                    <td className="px-4 py-3 max-w-sm">
                      {isSent ? (
                        <div className="space-y-0.5">
                          <span className="text-emerald-700 font-semibold text-[11px] block">
                            HTTP 200 OK — Delivered
                          </span>
                          {item.provider_message_id && (
                            <div className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground bg-muted/40 px-1.5 py-0.5 rounded w-fit">
                              <span>ID: {item.provider_message_id}</span>
                              <button
                                type="button"
                                onClick={() => copyText(item.provider_message_id!, "Message ID")}
                                className="hover:text-foreground"
                              >
                                <Copy className="size-2.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      ) : isFailed && item.failure_reason ? (
                        <div className="space-y-1">
                          <div className="font-mono text-[11px] text-destructive bg-destructive/10 p-1.5 rounded border border-destructive/20 break-all leading-tight">
                            {item.failure_reason}
                          </div>
                          {item.failure_reason.includes("403") && (
                            <p className="text-[10px] text-amber-700 font-medium flex items-center gap-1">
                              <ShieldAlert className="size-3 shrink-0" />
                              Unverified Resend sender domain or invalid API Key permissions.
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-[11px]">Awaiting attempt…</span>
                      )}
                    </td>

                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {isFailed && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs text-destructive border border-destructive/30 hover:bg-destructive/10"
                          onClick={() => retrySingleMutation.mutate(item.id)}
                          disabled={retrySingleMutation.isPending}
                        >
                          <RefreshCw
                            className={`size-3 mr-1 ${
                              retrySingleMutation.isPending ? "animate-spin" : ""
                            }`}
                          />
                          Retry
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
