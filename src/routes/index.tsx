import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Download,
  Mail,
  MousePointerClick,
  Eye,
  Plus,
  Copy,
  CheckCircle2,
  ShieldAlert,
  ShieldCheck,
  Settings,
  Sparkles,
} from "lucide-react";
import { campaignsQuery, sendsQuery } from "@/lib/data";
import { getSenderStatus } from "@/lib/settings.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SkeletonCard, SkeletonTable } from "@/components/ui/skeleton";
import { SendTestEmailDialog } from "@/components/SendTestEmailDialog";
import { CheckSendingOptionDialog } from "@/components/CheckSendingOptionDialog";
import { CampaignErrorLogsDialog } from "@/components/CampaignErrorLogsDialog";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Campaign dashboard — Postmark Studio" },
      {
        name: "description",
        content: "Track sends, open rates and click rates for every marketing email campaign.",
      },
      { property: "og:title", content: "Campaign dashboard — Postmark Studio" },
      {
        property: "og:description",
        content: "Track sends, open rates and click rates for every marketing email campaign.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

function pct(part: number, total: number) {
  if (!total) return "—";
  return `${Math.round((part / total) * 100)}%`;
}

function Dashboard() {
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

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight font-heading">
            Campaign Dashboard
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Real-time deliverability and engagement performance trends.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CheckSendingOptionDialog />
          <Button
            type="button"
            variant="outline"
            onClick={exportMetrics}
            disabled={campaigns.length === 0}
            className="h-9 text-xs"
          >
            <Download className="size-3.5 mr-1.5" /> Export Metrics
          </Button>
          <Button asChild className="h-9 text-xs shadow-sm">
            <Link to="/campaigns/new">
              <Plus className="size-4 mr-1" /> New Campaign
            </Link>
          </Button>
        </div>
      </header>

      {/* Prominent Sender Address Status Banner */}
      {senderStatus && !senderStatus.verified ? (
        <div className="rounded-xl border border-amber-500/40 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-background p-4 sm:p-5 text-amber-950 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="rounded-lg bg-amber-500/20 p-2.5 text-amber-700 shrink-0 mt-0.5">
              <ShieldAlert className="size-6 text-amber-600" />
            </div>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold text-amber-950 text-base">
                  Campaign Sending Disabled
                </h3>
                <Badge
                  variant="outline"
                  className="border-amber-500/50 bg-amber-500/20 text-amber-950 text-[11px] font-semibold"
                >
                  Sender Unverified
                </Badge>
              </div>
              <p className="text-xs sm:text-sm text-amber-900/90 leading-relaxed">
                {senderStatus.validation?.message ||
                  "No verified sender address is configured. Add your verified sending address in Settings before sending campaigns."}
              </p>
              <div className="pt-1 flex flex-wrap items-center gap-2 text-xs">
                <span className="text-muted-foreground">Configured Sender Address:</span>
                <code className="font-mono bg-background/80 px-2 py-0.5 rounded border border-amber-500/30 text-amber-950 font-medium">
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
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3.5 text-xs flex flex-wrap items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300">
            <ShieldCheck className="size-4 text-emerald-600 shrink-0" />
            <span>
              Sending active from verified Sender Address:{" "}
              <strong className="font-mono text-emerald-950 dark:text-emerald-200">{senderStatus.fromAddress}</strong>
            </span>
          </div>
          <Badge
            variant="outline"
            className="border-emerald-500/40 text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 font-semibold text-[10px]"
          >
            Sender Verified
          </Badge>
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
            icon={<Mail className="size-4 text-blue-500" />}
            label="Emails Delivered"
            value={totals.sent}
            badge="+100% verified"
          />
          <StatCard
            icon={<CheckCircle2 className="size-4 text-emerald-500" />}
            label="Delivery Rate"
            value={totals.deliverability}
            badge="High inbox score"
          />
          <StatCard
            icon={<Eye className="size-4 text-purple-500" />}
            label="Open Rate"
            value={pct(totals.opened, totals.sent)}
            badge="Tracked opens"
          />
          <StatCard
            icon={<MousePointerClick className="size-4 text-amber-500" />}
            label="Click Rate"
            value={pct(totals.clicked, totals.sent)}
            badge="Link engagements"
          />
        </div>
      )}

      {/* Campaigns Table / Skeleton */}
      {isLoading ? (
        <SkeletonTable rows={4} />
      ) : campaigns.length === 0 ? (
        <Card className="p-12 text-center space-y-4 border-dashed border-2 border-border/80 bg-muted/20">
          <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Sparkles className="size-7" />
          </div>
          <div className="max-w-md mx-auto space-y-1">
            <h3 className="text-lg font-bold">No Email Campaigns Yet</h3>
            <p className="text-sm text-muted-foreground">
              Create your first email marketing campaign to start tracking sends, open rates, and click engagements.
            </p>
          </div>
          <Button asChild className="mt-2">
            <Link to="/campaigns/new">
              <Plus className="size-4 mr-2" /> Compose Your First Campaign
            </Link>
          </Button>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0 border-border/80 shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                <tr>
                  <th className="px-5 py-3.5">Campaign</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5">Sent</th>
                  <th className="px-5 py-3.5">Opens</th>
                  <th className="px-5 py-3.5">Clicks</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {campaigns.map((campaign) => {
                  const rows = sends.filter((s) => s.campaign_id === campaign.id);
                  const sent = rows.filter((s) => s.sent_at).length;
                  const opened = rows.filter((s) => s.opened_at).length;
                  const clicked = rows.filter((s) => s.clicked_at).length;
                  const failedSends = rows.filter((s) => s.status === "failed");
                  const isProcessing = campaign.status === "queued" || campaign.status === "sending";
                  const isScheduled = campaign.status === "scheduled";

                  return (
                    <tr
                      key={campaign.id}
                      className="hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-5 py-3.5">
                        <Link
                          to="/campaigns/$id"
                          params={{ id: campaign.id }}
                          className="font-semibold text-foreground hover:text-primary hover:underline transition-colors"
                        >
                          {campaign.subject}
                        </Link>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {isScheduled && campaign.scheduled_for
                            ? `Scheduled for ${new Date(campaign.scheduled_for).toLocaleString()}`
                            : new Date(campaign.created_at).toLocaleDateString()}
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex flex-col items-start gap-1">
                          <Badge
                            variant={
                              campaign.status === "sent"
                                ? "default"
                                : isProcessing
                                  ? "secondary"
                                  : "outline"
                            }
                            className={
                              isScheduled
                                ? "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/30 font-medium"
                                : ""
                            }
                          >
                            {isScheduled ? "Scheduled" : campaign.status}
                          </Badge>

                          {failedSends.length > 0 && (
                            <CampaignErrorLogsDialog
                              campaignId={campaign.id}
                              campaignSubject={campaign.subject}
                              failedSends={failedSends}
                            />
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 font-medium">{sent}</td>
                      <td className="px-5 py-3.5">
                        {opened} <span className="text-xs text-muted-foreground">({pct(opened, sent)})</span>
                      </td>
                      <td className="px-5 py-3.5">
                        {clicked} <span className="text-xs text-muted-foreground">({pct(clicked, sent)})</span>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <div className="flex justify-end items-center gap-1.5">
                          <SendTestEmailDialog
                            campaignId={campaign.id}
                            campaignSubject={campaign.subject}
                            senderVerified={Boolean(senderStatus?.verified)}
                          />
                          <Button asChild size="sm" variant="ghost" className="h-8 text-xs">
                            <Link to="/campaigns/new" search={{ clone: campaign.id }}>
                              <Copy className="size-3.5 mr-1" /> Duplicate
                            </Link>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  badge,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  badge?: string;
}) {
  return (
    <Card className="p-5 hover:scale-[1.01] hover:shadow-md transition-all ease-out cursor-default border-border/80 bg-card/90">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider font-semibold text-muted-foreground">
          {icon}
          {label}
        </div>
        {badge && (
          <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
            {badge}
          </span>
        )}
      </div>
      <div className="mt-3 text-3xl font-extrabold tabular-nums font-heading tracking-tight">{value}</div>
    </Card>
  );
}
