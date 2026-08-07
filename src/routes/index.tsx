import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Download, Mail, MousePointerClick, Eye, Plus, Copy, CheckCircle2 } from "lucide-react";
import { campaignsQuery, sendsQuery } from "@/lib/data";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Campaign dashboard — Postmark Studio" },
      {
        name: "description",
        content:
          "Track sends, open rates and click rates for every marketing email campaign.",
      },
      { property: "og:title", content: "Campaign dashboard — Postmark Studio" },
      {
        property: "og:description",
        content:
          "Track sends, open rates and click rates for every marketing email campaign.",
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
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Performance across all marketing campaigns.
          </p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={exportMetrics} disabled={campaigns.length === 0}>
            <Download className="size-4" /> Export metrics
          </Button>
          <Button asChild>
            <Link to="/campaigns/new">
              <Plus className="size-4" /> New campaign
            </Link>
          </Button>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={<Mail className="size-4 text-blue-500" />} label="Emails delivered" value={totals.sent} />
        <StatCard icon={<CheckCircle2 className="size-4 text-emerald-500" />} label="Delivery rate" value={totals.deliverability} />
        <StatCard
          icon={<Eye className="size-4 text-purple-500" />}
          label="Open rate"
          value={pct(totals.opened, totals.sent)}
        />
        <StatCard
          icon={<MousePointerClick className="size-4 text-amber-500" />}
          label="Click rate"
          value={pct(totals.clicked, totals.sent)}
        />
      </div>

      <Card className="overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-5 py-3 font-medium">Campaign</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium">Sent</th>
              <th className="px-5 py-3 font-medium">Opens</th>
              <th className="px-5 py-3 font-medium">Clicks</th>
              <th className="px-5 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-muted-foreground">
                  Loading…
                </td>
              </tr>
            )}
            {!isLoading && campaigns.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-muted-foreground">
                  No campaigns yet.
                </td>
              </tr>
            )}
            {campaigns.map((campaign) => {
              const rows = sends.filter((s) => s.campaign_id === campaign.id);
              const sent = rows.filter((s) => s.sent_at).length;
              const opened = rows.filter((s) => s.opened_at).length;
              const clicked = rows.filter((s) => s.clicked_at).length;
              const isProcessing = campaign.status === "queued" || campaign.status === "sending";

              return (
                <tr key={campaign.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                  <td className="px-5 py-3">
                    <Link
                      to="/campaigns/$id"
                      params={{ id: campaign.id }}
                      className="font-medium hover:underline"
                    >
                      {campaign.subject}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {new Date(campaign.created_at).toLocaleDateString()}
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <Badge variant={campaign.status === "sent" ? "default" : isProcessing ? "secondary" : "outline"}>
                      {campaign.status}
                    </Badge>
                  </td>
                  <td className="px-5 py-3">{sent}</td>
                  <td className="px-5 py-3">
                    {opened} <span className="text-muted-foreground">({pct(opened, sent)})</span>
                  </td>
                  <td className="px-5 py-3">
                    {clicked}{" "}
                    <span className="text-muted-foreground">({pct(clicked, sent)})</span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Button asChild size="sm" variant="ghost" className="h-8 text-xs">
                      <Link to="/campaigns/new" search={{ clone: campaign.id }}>
                        <Copy className="size-3.5 mr-1" /> Duplicate
                      </Link>
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-2 text-3xl font-semibold tabular-nums">{value}</div>
    </Card>
  );
}

