import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Mail, MousePointerClick, Eye, Plus } from "lucide-react";
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
  const { data: campaigns = [], isLoading } = useQuery(campaignsQuery);
  const { data: sends = [] } = useQuery(sendsQuery);

  const totals = {
    sent: sends.filter((s) => s.sent_at).length,
    opened: sends.filter((s) => s.opened_at).length,
    clicked: sends.filter((s) => s.clicked_at).length,
  };

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Performance across all campaigns.
          </p>
        </div>
        <Button asChild>
          <Link to="/campaigns/new">
            <Plus className="size-4" /> New campaign
          </Link>
        </Button>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={<Mail className="size-4" />} label="Emails sent" value={totals.sent} />
        <StatCard
          icon={<Eye className="size-4" />}
          label="Open rate"
          value={pct(totals.opened, totals.sent)}
        />
        <StatCard
          icon={<MousePointerClick className="size-4" />}
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
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-muted-foreground">
                  Loading…
                </td>
              </tr>
            )}
            {!isLoading && campaigns.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-muted-foreground">
                  No campaigns yet.
                </td>
              </tr>
            )}
            {campaigns.map((campaign) => {
              const rows = sends.filter((s) => s.campaign_id === campaign.id);
              const sent = rows.filter((s) => s.sent_at).length;
              const opened = rows.filter((s) => s.opened_at).length;
              const clicked = rows.filter((s) => s.clicked_at).length;
              return (
                <tr key={campaign.id} className="border-b border-border last:border-0">
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
                    <Badge variant={campaign.status === "sent" ? "default" : "secondary"}>
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
