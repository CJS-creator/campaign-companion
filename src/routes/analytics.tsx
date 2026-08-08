import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  TrendingUp,
  Mail,
  Eye,
  MousePointerClick,
  Download,
  Calendar,
  Filter,
  BarChart3,
  ExternalLink,
  Target,
  Percent,
  Sparkles,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { fetchAnalyticsData, type TimeframeOption } from "@/lib/analytics.functions";
import { campaignsQuery } from "@/lib/data";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SkeletonCard, SkeletonTable } from "@/components/ui/skeleton";

export const Route = createFileRoute("/analytics")({
  head: () => ({
    meta: [
      { title: "Performance Analytics — Postmark Studio" },
      {
        name: "description",
        content:
          "Deep visual analytics for email opens, clicks, top performing links, and campaign comparisons.",
      },
    ],
  }),
  component: AnalyticsPage,
});

function CustomTooltip({ active, payload, label }: any) {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-xl border border-border/80 bg-card/95 p-3 shadow-xl backdrop-blur-md text-xs space-y-1.5 min-w-[140px]">
        <p className="font-bold text-foreground pb-1 border-b border-border/60">{label}</p>
        {payload.map((entry: any, index: number) => (
          <div key={`item-${index}`} className="flex items-center justify-between gap-3 text-xs">
            <span className="flex items-center gap-1.5 font-medium text-muted-foreground">
              <span className="size-2 rounded-full" style={{ backgroundColor: entry.color }} />
              {entry.name}:
            </span>
            <span className="font-bold text-foreground tabular-nums">{entry.value}</span>
          </div>
        ))}
      </div>
    );
  }
  return null;
}

function AnalyticsPage() {
  const [timeframe, setTimeframe] = useState<TimeframeOption>("30d");
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>("all");

  const { data: campaigns = [] } = useQuery(campaignsQuery);

  const {
    data: analytics,
    isLoading,
    isFetching,
  } = useQuery({
    queryKey: ["analytics", timeframe, selectedCampaignId],
    queryFn: () =>
      fetchAnalyticsData({
        data: {
          timeframe,
          campaignId: selectedCampaignId === "all" ? null : selectedCampaignId,
        },
      }),
  });

  const exportAnalyticsCsv = () => {
    if (!analytics) return;
    const escape = (val: string) => `"${val.replaceAll('"', '""')}"`;
    const rows = [
      ["Date", "Emails Delivered", "Unique Opens", "Tracked Clicks"],
      ...analytics.timeSeries.map((t) => [
        t.date,
        String(t.sent),
        String(t.opens),
        String(t.clicks),
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => escape(c)).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `analytics-report-${timeframe}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Exported analytics CSV report!");
  };

  return (
    <div className="space-y-8">
      {/* Header with Filters */}
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight font-heading flex items-center gap-2.5">
            <TrendingUp className="size-7 text-primary" />
            Performance Analytics
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Visual metrics, open & click time-series curves, and top offer link performance.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Campaign Filter Dropdown */}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/40 p-1.5 rounded-lg border border-border/80">
            <Filter className="size-3.5 ml-1" />
            <select
              value={selectedCampaignId}
              onChange={(e) => setSelectedCampaignId(e.target.value)}
              className="bg-transparent text-foreground text-xs font-semibold focus:outline-none pr-2 cursor-pointer"
              aria-label="Filter analytics by campaign"
            >
              <option value="all">All Campaigns ({campaigns.length})</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.subject.length > 30 ? `${c.subject.slice(0, 30)}…` : c.subject}
                </option>
              ))}
            </select>
          </div>

          {/* Timeframe Range Selector */}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/40 p-1.5 rounded-lg border border-border/80">
            <Calendar className="size-3.5 ml-1" />
            <select
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value as TimeframeOption)}
              className="bg-transparent text-foreground text-xs font-semibold focus:outline-none pr-2 cursor-pointer"
              aria-label="Filter analytics date range"
            >
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
              <option value="90d">Last 90 Days</option>
              <option value="all">All Time</option>
            </select>
          </div>

          <Button type="button" variant="outline" size="sm" onClick={exportAnalyticsCsv} className="h-9 text-xs">
            <Download className="size-3.5 mr-1.5" />
            Export Report
          </Button>
        </div>
      </header>

      {/* Primary Key Performance Metrics */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            title="Emails Delivered"
            icon={<Mail className="size-4 text-blue-500" />}
            value={analytics?.totalSent ?? 0}
            subtext={isFetching ? "Updating…" : "Total successfully delivered"}
          />
          <MetricCard
            title="Open Rate"
            icon={<Eye className="size-4 text-purple-500" />}
            value={`${analytics?.openRatePct ?? 0}%`}
            valueColor="text-purple-600 dark:text-purple-400"
            subtext={`${analytics?.totalOpens ?? 0} unique open events`}
          />
          <MetricCard
            title="Click-Through Rate"
            icon={<MousePointerClick className="size-4 text-amber-500" />}
            value={`${analytics?.clickRatePct ?? 0}%`}
            valueColor="text-amber-600 dark:text-amber-400"
            subtext={`${analytics?.totalClicks ?? 0} total link clicks`}
          />
          <MetricCard
            title="Click-to-Open Ratio"
            icon={<Percent className="size-4 text-emerald-500" />}
            value={`${analytics?.clickToOpenRatePct ?? 0}%`}
            valueColor="text-emerald-600 dark:text-emerald-400"
            subtext="Clicks per opened email"
          />
        </div>
      )}

      {/* Main Time-Series Line Chart */}
      <Card className="p-6 space-y-4 border-border/80 shadow-xs">
        <div>
          <h2 className="text-base font-bold flex items-center gap-2 font-heading">
            <TrendingUp className="size-5 text-primary" />
            Engagement Trends Over Time
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Daily curves comparing emails delivered, unique opens, and offer link clicks.
          </p>
        </div>

        <div className="h-72 w-full pt-2">
          {isLoading ? (
            <div className="h-full w-full shimmer-skeleton rounded-lg" />
          ) : analytics?.timeSeries && analytics.timeSeries.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={analytics.timeSeries}
                margin={{ top: 10, right: 20, left: -20, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="displayDate" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "10px" }} />
                <Line
                  type="monotone"
                  dataKey="sent"
                  name="Delivered"
                  stroke="#3b82f6"
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                  activeDot={{ r: 6 }}
                />
                <Line
                  type="monotone"
                  dataKey="opens"
                  name="Unique Opens"
                  stroke="#a855f7"
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                  activeDot={{ r: 6 }}
                />
                <Line
                  type="monotone"
                  dataKey="clicks"
                  name="Link Clicks"
                  stroke="#f59e0b"
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
              No engagement events recorded for this timeframe.
            </div>
          )}
        </div>
      </Card>

      {/* Campaign Comparison Bar Chart */}
      <Card className="p-6 space-y-4 border-border/80 shadow-xs">
        <div>
          <h2 className="text-base font-bold flex items-center gap-2 font-heading">
            <BarChart3 className="size-5 text-primary" />
            Campaign Performance Comparison
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Side-by-side open rate and click rate comparison across all marketing campaigns.
          </p>
        </div>

        <div className="h-64 w-full pt-2">
          {isLoading ? (
            <div className="h-full w-full shimmer-skeleton rounded-lg" />
          ) : analytics?.campaignComparison && analytics.campaignComparison.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={analytics.campaignComparison}
                margin={{ top: 10, right: 20, left: -20, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="subject" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} unit="%" />
                <Tooltip content={<CustomTooltip />} formatter={(val: number) => `${val}%`} />
                <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "10px" }} />
                <Bar dataKey="openRate" name="Open Rate %" fill="#a855f7" radius={[4, 4, 0, 0]} />
                <Bar dataKey="clickRate" name="Click Rate %" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
              No campaign data available.
            </div>
          )}
        </div>
      </Card>

      {/* Top-Clicked Links Table */}
      <Card className="p-6 space-y-4 border-border/80 shadow-xs">
        <div>
          <h2 className="text-base font-bold flex items-center gap-2 font-heading">
            <Target className="size-5 text-amber-500" />
            Top Performing Tracked Links
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Destination URLs ranked by total clicks and unique recipient engagements.
          </p>
        </div>

        {isLoading ? (
          <SkeletonTable rows={3} />
        ) : (
          <div className="overflow-hidden rounded-lg border border-border text-sm">
            <table className="w-full text-xs text-left">
              <thead className="border-b bg-muted/50 font-semibold uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="p-3">Destination Link URL</th>
                  <th className="p-3">Campaign Subject</th>
                  <th className="p-3 text-right">Total Clicks</th>
                  <th className="p-3 text-right">Unique Lead Clicks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {analytics?.topLinks.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-muted-foreground">
                      No link click events recorded yet.
                    </td>
                  </tr>
                ) : (
                  analytics?.topLinks.map((link, idx) => (
                    <tr key={idx} className="hover:bg-muted/30 transition-colors">
                      <td className="p-3 font-medium text-foreground max-w-sm truncate">
                        <a
                          href={link.url.startsWith("http") ? link.url : `https://${link.url}`}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1 hover:underline text-primary"
                        >
                          {link.url}
                          <ExternalLink className="size-3 shrink-0" />
                        </a>
                      </td>
                      <td className="p-3 text-muted-foreground font-medium">
                        {link.campaignSubject}
                      </td>
                      <td className="p-3 text-right font-bold text-amber-600 dark:text-amber-400 tabular-nums">
                        {link.totalClicks}
                      </td>
                      <td className="p-3 text-right font-semibold text-foreground tabular-nums">
                        {link.uniqueLeads}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function MetricCard({
  title,
  icon,
  value,
  valueColor,
  subtext,
}: {
  title: string;
  icon: React.ReactNode;
  value: string | number;
  valueColor?: string;
  subtext: string;
}) {
  return (
    <Card className="p-5 space-y-1.5 hover:scale-[1.01] hover:shadow-md transition-all ease-out cursor-default border-border/80 bg-card/90">
      <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <span>{title}</span>
        {icon}
      </div>
      <div className={`text-3xl font-extrabold tabular-nums font-heading tracking-tight ${valueColor || "text-foreground"}`}>
        {value}
      </div>
      <p className="text-xs text-muted-foreground">{subtext}</p>
    </Card>
  );
}
