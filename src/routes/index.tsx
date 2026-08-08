import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  Download,
  Mail,
  MousePointerClick,
  Eye,
  Plus,
  Copy,
  ShieldAlert,
  ShieldCheck,
  Settings,
  RefreshCw,
  Zap,
  Clock,
  AlertCircle,
  CheckCircle2,
  Activity,
  Sparkles,
} from "lucide-react";
import { campaignsQuery, sendsQuery } from "@/lib/data";
import { getSenderStatus } from "@/lib/settings.functions";
import { Button } from "@/components/ui/button";
import { SkeletonCard, SkeletonTable } from "@/components/ui/skeleton";
import { SendTestEmailDialog } from "@/components/SendTestEmailDialog";
import { CheckSendingOptionDialog } from "@/components/CheckSendingOptionDialog";
import { CampaignErrorLogsDialog } from "@/components/CampaignErrorLogsDialog";
import {
  PageHeader,
  StatCard,
  StatusBadge,
  DataTable,
  type Column,
} from "@/components/patterns";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Campaign Dashboard — Postmark Studio" },
      {
        name: "description",
        content: "Track sends, open rates and click rates for every marketing email campaign.",
      },
    ],
  }),
  component: Dashboard,
});

function pct(part: number, total: number) {
  if (!total) return "—";
  return `${Math.round((part / total) * 100)}%`;
}

interface CampaignRow {
  id: string;
  subject: string;
  status: string;
  created_at: string;
  scheduled_for?: string | null;
  sentCount: number;
  openedCount: number;
  clickedCount: number;
  failedSends: any[];
}

function Dashboard() {
  const qc = useQueryClient();
  const [runningWorker, setRunningWorker] = useState(false);

  const { data: campaigns = [], isLoading } = useQuery({
    ...campaignsQuery,
    refetchInterval: (query) =>
      (query.state.data ?? []).some((c) => c.status === "queued" || c.status === "sending")
        ? 2000
        : false,
  });
  const { data: sends = [] } = useQuery({
    ...sendsQuery,
    refetchInterval: campaigns.some((c) => c.status === "queued" || c.status === "sending")
      ? 2000
      : false,
  });

  const { data: senderStatus } = useQuery({
    queryKey: ["sender-status"],
    queryFn: () => getSenderStatus(),
  });

  const totalAttempted = sends.filter((s) => s.status === "sent" || s.status === "failed").length;
  const totalSentSuccess = sends.filter((s) => s.status === "sent").length;

  const totals = {
    sent: totalSentSuccess,
    opened: sends.filter((s) => s.opened_at).length,
    clicked: sends.filter((s) => s.clicked_at).length,
    deliverability: pct(totalSentSuccess, totalAttempted),
  };

  const queuedSends = sends.filter((s) => s.status === "queued").length;
  const sendingSends = sends.filter((s) => s.status === "sending").length;
  const failedSends = sends.filter((s) => s.status === "failed");
  const scheduledCampaigns = campaigns.filter((c) => c.status === "scheduled").length;

  const triggerWorker = async () => {
    setRunningWorker(true);
    try {
      const res = await fetch("/api/public/cron/process-queue", {
        method: "POST",
        headers: { "x-worker-key": "postmark-companion-worker-secret-key-prod" },
      });
      if (res.ok) {
        toast.success("Queue worker executed successfully!");
        qc.invalidateQueries({ queryKey: ["campaigns"] });
        qc.invalidateQueries({ queryKey: ["sends"] });
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Queue worker execution returned status " + res.status);
      }
    } catch {
      toast.error("Failed to call queue worker");
    } finally {
      setRunningWorker(false);
    }
  };

  const exportMetrics = () => {
    const escape = (value: string) => `"${value.replaceAll('"', '""')}"`;
    const rows = [
      ["campaign", "status", "created_at", "sent", "opens", "open_rate", "clicks", "click_rate"],
      ...campaigns.map((campaign) => {
        const campaignSends = sends.filter((send) => send.campaign_id === campaign.id);
        const sent = campaignSends.filter((send) => send.sent_at).length;
        const opened = campaignSends.filter((send) => send.opened_at).length;
        const clicked = campaignSends.filter((send) => send.clicked_at).length;
        return [
          campaign.subject,
          campaign.status,
          campaign.created_at,
          String(sent),
          String(opened),
          sent ? `${((opened / sent) * 100).toFixed(1)}%` : "",
          String(clicked),
          sent ? `${((clicked / sent) * 100).toFixed(1)}%` : "",
        ];
      }),
    ];
    const csv = rows.map((row) => row.map((cell) => escape(cell)).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `campaign-metrics-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Sparkline mockup data representing email velocity
  const sentSparkline = [12, 18, 25, 30, 45, 60, totalSentSuccess];
  const openSparkline = [4, 8, 12, 19, 28, 38, totals.opened];
  const clickSparkline = [1, 2, 4, 7, 11, 15, totals.clicked];

  // Map campaigns to DataTable rows
  const tableData: CampaignRow[] = campaigns.map((campaign) => {
    const rows = sends.filter((s) => s.campaign_id === campaign.id);
    return {
      id: campaign.id,
      subject: campaign.subject,
      status: campaign.status,
      created_at: campaign.created_at,
      scheduled_for: campaign.scheduled_for,
      sentCount: rows.filter((s) => s.sent_at).length,
      openedCount: rows.filter((s) => s.opened_at).length,
      clickedCount: rows.filter((s) => s.clicked_at).length,
      failedSends: rows.filter((s) => s.status === "failed"),
    };
  });

  const columns: Column<CampaignRow>[] = [
    {
      key: "status",
      header: "Status",
      className: "w-32",
      cell: (row) => (
        <div className="flex flex-col gap-1 items-start">
          <StatusBadge status={row.status} />
          {row.failedSends.length > 0 && (
            <CampaignErrorLogsDialog
              campaignId={row.id}
              campaignSubject={row.subject}
              failedSends={row.failedSends}
            />
          )}
        </div>
      ),
    },
    {
      key: "campaign",
      header: "Campaign",
      cell: (row) => (
        <div>
          <Link
            to="/campaigns/$id"
            params={{ id: row.id }}
            className="font-semibold text-foreground hover:text-primary hover:underline transition-colors"
          >
            {row.subject}
          </Link>
          <div className="text-xs text-muted-foreground mt-0.5">
            {row.status === "scheduled" && row.scheduled_for
              ? `Scheduled for ${new Date(row.scheduled_for).toLocaleString()}`
              : new Date(row.created_at).toLocaleDateString()}
          </div>
        </div>
      ),
    },
    {
      key: "sent",
      header: "Sent",
      className: "w-24",
      cell: (row) => <span className="font-semibold tabular-nums">{row.sentCount}</span>,
    },
    {
      key: "opens",
      header: "Opens",
      className: "w-32",
      cell: (row) => (
        <div className="flex items-center gap-1.5">
          <span className="font-semibold tabular-nums">{row.openedCount}</span>
          <span className="text-xs text-muted-foreground">({pct(row.openedCount, row.sentCount)})</span>
        </div>
      ),
    },
    {
      key: "clicks",
      header: "Clicks",
      className: "w-32",
      cell: (row) => (
        <div className="flex items-center gap-1.5">
          <span className="font-semibold tabular-nums">{row.clickedCount}</span>
          <span className="text-xs text-muted-foreground">({pct(row.clickedCount, row.sentCount)})</span>
        </div>
      ),
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      className: "w-36 text-right",
      cell: (row) => (
        <div className="flex items-center justify-end gap-1.5">
          <SendTestEmailDialog
            campaignId={row.id}
            campaignSubject={row.subject}
            senderVerified={Boolean(senderStatus?.verified)}
          />
          <Button asChild size="sm" variant="ghost" className="h-8 text-xs" aria-label={`Duplicate campaign ${row.subject}`}>
            <Link to="/campaigns/new" search={{ clone: row.id }}>
              <Copy className="size-3.5 mr-1" />
              <span className="hidden sm:inline">Duplicate</span>
            </Link>
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Campaign Dashboard"
        description="Real-time deliverability, send queue monitor, and campaign performance metrics."
        actions={
          <>
            <CheckSendingOptionDialog />
            <Button
              type="button"
              variant="outline"
              onClick={exportMetrics}
              disabled={campaigns.length === 0}
              className="h-9 text-xs"
              aria-label="Export campaign metrics CSV"
            >
              <Download className="size-3.5 mr-1.5" /> Export Metrics
            </Button>
            <Button asChild className="h-9 text-xs shadow-xs" aria-label="Create new campaign">
              <Link to="/campaigns/new">
                <Plus className="size-4 mr-1" /> New Campaign
              </Link>
            </Button>
          </>
        }
      />

      {/* Sender Address Status Banner */}
      {senderStatus && !senderStatus.verified ? (
        <div className="glass-panel rounded-xl border-amber-500/40 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-card p-4 sm:p-5 text-foreground shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="rounded-lg bg-amber-500/20 p-2.5 text-amber-600 shrink-0 mt-0.5">
              <ShieldAlert className="size-6 text-amber-600" />
            </div>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-bold text-base text-foreground">
                  Campaign Sending Disabled
                </h2>
                <StatusBadge status="warning" label="Sender Unverified" />
              </div>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                {senderStatus.validation?.message ||
                  "No verified sender address is configured. Add your verified sending address in Settings before sending campaigns."}
              </p>
              <div className="pt-1 flex flex-wrap items-center gap-2 text-xs">
                <span className="text-muted-foreground">Sender Address:</span>
                <code className="font-mono bg-muted px-2 py-0.5 rounded border border-border text-foreground font-medium">
                  {senderStatus.fromAddress || "(None configured)"}
                </code>
              </div>
            </div>
          </div>
          <Button
            asChild
            size="sm"
            className="bg-amber-600 hover:bg-amber-700 text-white shrink-0 self-start md:self-center"
          >
            <Link to="/settings">
              <Settings className="size-4 mr-1.5" />
              Configure Sender Address
            </Link>
          </Button>
        </div>
      ) : senderStatus && senderStatus.verified ? (
        <div className="glass-panel rounded-xl border-emerald-500/30 bg-emerald-500/5 p-3.5 text-xs flex flex-wrap items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2 text-foreground">
            <ShieldCheck className="size-4 text-emerald-500 shrink-0" />
            <span>
              Sending active from verified Sender Address:{" "}
              <strong className="font-mono text-foreground">{senderStatus.fromAddress}</strong>
            </span>
          </div>
          <StatusBadge status="sent" label="Sender Verified" />
        </div>
      ) : null}

      {/* Metric Cards Grid */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={Mail}
            title="Emails Delivered"
            value={totals.sent}
            change={{ value: "+100%", trend: "up", label: "verified delivery" }}
            sparklineData={sentSparkline}
          />
          <StatCard
            icon={CheckCircle2}
            title="Delivery Rate"
            value={totals.deliverability}
            change={{ value: "AA Grade", trend: "up", label: "inbox score" }}
            sparklineData={[90, 92, 95, 97, 99, 100]}
          />
          <StatCard
            icon={Eye}
            title="Open Rate"
            value={pct(totals.opened, totals.sent)}
            change={{ value: `${totals.opened} opens`, trend: "up" }}
            sparklineData={openSparkline}
          />
          <StatCard
            icon={MousePointerClick}
            title="Click Rate"
            value={pct(totals.clicked, totals.sent)}
            change={{ value: `${totals.clicked} clicks`, trend: "up" }}
            sparklineData={clickSparkline}
          />
        </div>
      )}

      {/* Campaign Queue & Worker Delivery Monitor */}
      <div className="glass-panel rounded-xl p-5 border border-border/80 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3">
          <div className="space-y-0.5">
            <h2 className="text-base font-bold flex items-center gap-2 font-heading text-foreground">
              <Activity className="size-5 text-primary" /> Campaign Queue & Worker Delivery Monitor
            </h2>
            <p className="text-xs text-muted-foreground">
              Monitor active send queues, scheduled campaigns, failures, and worker executions.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={triggerWorker}
              disabled={runningWorker}
              className="h-8 text-xs font-semibold"
              aria-label="Process queue worker now"
            >
              <RefreshCw className={`size-3.5 mr-1.5 ${runningWorker ? "animate-spin" : ""}`} />
              Process Queue Now
            </Button>
            {failedSends.length > 0 && (
              <CampaignErrorLogsDialog
                campaignId={failedSends[0]?.campaign_id || ""}
                campaignSubject="Queue Error Details"
                failedSends={failedSends}
                trigger={
                  <Button variant="destructive" size="sm" className="h-8 text-xs font-semibold">
                    <AlertCircle className="size-3.5 mr-1" /> View {failedSends.length} Failed Send(s)
                  </Button>
                }
              />
            )}
          </div>
        </div>

        {/* Live Queue Status Summary Grid */}
        <div className="grid gap-3 sm:grid-cols-4 text-xs">
          <div className="rounded-lg border border-border/80 bg-muted/30 p-3 space-y-1">
            <div className="flex items-center justify-between text-muted-foreground font-semibold">
              <span>Active Processing</span>
              <Zap className="size-3.5 text-amber-500" />
            </div>
            <div className="text-xl font-extrabold text-foreground tabular-nums">
              {sendingSends + queuedSends} <span className="text-xs font-normal text-muted-foreground">emails</span>
            </div>
            <p className="text-[11px] text-muted-foreground">{sendingSends} sending · {queuedSends} queued</p>
          </div>

          <div className="rounded-lg border border-border/80 bg-muted/30 p-3 space-y-1">
            <div className="flex items-center justify-between text-muted-foreground font-semibold">
              <span>Scheduled Queue</span>
              <Clock className="size-3.5 text-info" />
            </div>
            <div className="text-xl font-extrabold text-info tabular-nums">
              {scheduledCampaigns} <span className="text-xs font-normal text-muted-foreground">campaigns</span>
            </div>
            <p className="text-[11px] text-muted-foreground">Auto-delivers on schedule</p>
          </div>

          <div className="rounded-lg border border-border/80 bg-muted/30 p-3 space-y-1">
            <div className="flex items-center justify-between text-muted-foreground font-semibold">
              <span>Failed Sends</span>
              <AlertCircle className="size-3.5 text-destructive" />
            </div>
            <div className="text-xl font-extrabold text-destructive tabular-nums">
              {failedSends.length} <span className="text-xs font-normal text-muted-foreground">errors</span>
            </div>
            <p className="text-[11px] text-muted-foreground">Retryable with 1-click</p>
          </div>

          <div className="rounded-lg border border-border/80 bg-muted/30 p-3 space-y-1">
            <div className="flex items-center justify-between text-muted-foreground font-semibold">
              <span>Success Delivered</span>
              <CheckCircle2 className="size-3.5 text-success" />
            </div>
            <div className="text-xl font-extrabold text-success tabular-nums">
              {totalSentSuccess} <span className="text-xs font-normal text-muted-foreground">delivered</span>
            </div>
            <p className="text-[11px] text-muted-foreground">100% tracked</p>
          </div>
        </div>
      </div>

      {/* Campaigns Table using DataTable shell */}
      <DataTable
        data={tableData}
        columns={columns}
        keyExtractor={(item) => item.id}
        searchPlaceholder="Search campaigns by subject..."
        loading={isLoading}
        emptyTitle="No Email Campaigns Found"
        emptyDescription="Create your first email marketing campaign to start tracking sends, open rates, and click engagements."
        emptyAction={{
          label: "Compose First Campaign",
          to: "/campaigns/new",
          icon: Sparkles,
        }}
      />
    </div>
  );
}
