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

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
        <TrendingUp className="size-8 animate-pulse text-primary" />
        <p className="text-sm font-medium">Aggregating engagement performance trends…</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header with Filters */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight flex items-center gap-2">
            <TrendingUp className="size-7 text-primary" />
            Performance Analytics
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Visual metrics, open & click time-series curves, and top offer link performance.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Campaign Filter Dropdown */}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/30 p-1 rounded-md border">
            <Filter className="size-3.5 ml-1.5" />
            <select
              value={selectedCampaignId}
              onChange={(e) => setSelectedCampaignId(e.target.value)}
              className="bg-transparent text-foreground text-xs font-medium focus:outline-none pr-2"
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
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/30 p-1 rounded-md border">
            <Calendar className="size-3.5 ml-1.5" />
            <select
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value as TimeframeOption)}
              className="bg-transparent text-foreground text-xs font-medium focus:outline-none pr-2"
              aria-label="Filter analytics date range"
            >
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
              <option value="90d">Last 90 Days</option>
              <option value="all">All Time</option>
            </select>
          </div>

          <Button type="button" variant="outline" size="sm" onClick={exportAnalyticsCsv}>
            <Download className="size-4 mr-1.5" />
            Export Report
          </Button>
        </div>
      </header>

      {/* Primary Key Performance Metrics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-5 space-y-1">
          <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <span>Emails Delivered</span>
            <Mail className="size-4 text-blue-500" />
          </div>
          <div className="text-3xl font-bold tabular-nums">{analytics?.totalSent ?? 0}</div>
          <p className="text-xs text-muted-foreground">
            {isFetching ? "Updating…" : "Total successfully delivered"}
          </p>
        </Card>

        <Card className="p-5 space-y-1">
          <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <span>Open Rate</span>
            <Eye className="size-4 text-purple-500" />
          </div>
          <div className="text-3xl font-bold tabular-nums text-purple-600">
            {analytics?.openRatePct ?? 0}%
          </div>
          <p className="text-xs text-muted-foreground">
            {analytics?.totalOpens ?? 0} unique open events
          </p>
        </Card>

        <Card className="p-5 space-y-1">
          <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <span>Click-Through Rate</span>
            <MousePointerClick className="size-4 text-amber-500" />
          </div>
          <div className="text-3xl font-bold tabular-nums text-amber-600">
            {analytics?.clickRatePct ?? 0}%
          </div>
          <p className="text-xs text-muted-foreground">
            {analytics?.totalClicks ?? 0} total link clicks
          </p>
        </Card>

        <Card className="p-5 space-y-1">
          <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <span>Click-to-Open Ratio</span>
            <Percent className="size-4 text-emerald-500" />
          </div>
          <div className="text-3xl font-bold tabular-nums text-emerald-600">
            {analytics?.clickToOpenRatePct ?? 0}%
          </div>
          <p className="text-xs text-muted-foreground">Clicks per opened email</p>
        </Card>
      </div>

      {/* Main Time-Series Line Chart: Opens vs Clicks over time */}
      <Card className="p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold flex items-center gap-2">
              <TrendingUp className="size-5 text-primary" />
              Engagement Trends Over Time
            </h2>
            <p className="text-xs text-muted-foreground">
              Daily curves comparing emails delivered, unique opens, and offer link clicks.
            </p>
          </div>
        </div>

        <div className="h-72 w-full pt-2">
          {analytics?.timeSeries && analytics.timeSeries.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={analytics.timeSeries}
                margin={{ top: 10, right: 20, left: -20, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="displayDate" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--background)",
                    borderColor: "var(--border)",
                    borderRadius: "6px",
                    fontSize: "12px",
                  }}
                />
                <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "10px" }} />
                <Line
                  type="monotone"
                  dataKey="sent"
                  name="Delivered"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
                <Line
                  type="monotone"
                  dataKey="opens"
                  name="Unique Opens"
                  stroke="#a855f7"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
                <Line
                  type="monotone"
                  dataKey="clicks"
                  name="Link Clicks"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
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
      <Card className="p-5 space-y-4">
        <div>
          <h2 className="text-base font-semibold flex items-center gap-2">
            <BarChart3 className="size-5 text-primary" />
            Campaign Performance Comparison
          </h2>
          <p className="text-xs text-muted-foreground">
            Side-by-side open rate and click rate comparison across all marketing campaigns.
          </p>
        </div>

        <div className="h-64 w-full pt-2">
          {analytics?.campaignComparison && analytics.campaignComparison.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={analytics.campaignComparison}
                margin={{ top: 10, right: 20, left: -20, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="subject" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} unit="%" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--background)",
                    borderColor: "var(--border)",
                    borderRadius: "6px",
                    fontSize: "12px",
                  }}
                  formatter={(value: number) => [`${value}%`]}
                />
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
      <Card className="p-5 space-y-4">
        <div>
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Target className="size-5 text-amber-500" />
            Top Performing Tracked Links
          </h2>
          <p className="text-xs text-muted-foreground">
            Destination URLs ranked by total clicks and unique recipient engagements.
          </p>
        </div>

        <div className="overflow-hidden rounded-md border text-sm">
          <table className="w-full text-xs text-left">
            <thead className="border-b bg-muted/40 font-medium uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="p-3">Destination Link URL</th>
                <th className="p-3">Campaign Subject</th>
                <th className="p-3 text-right">Total Clicks</th>
                <th className="p-3 text-right">Unique Lead Clicks</th>
              </tr>
            </thead>
            <tbody>
              {analytics?.topLinks.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-muted-foreground">
                    No link click events recorded yet.
                  </td>
                </tr>
              ) : (
                analytics?.topLinks.map((link, idx) => (
                  <tr key={idx} className="border-b last:border-0 hover:bg-muted/20">
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
                    <td className="p-3 text-right font-bold text-amber-600 tabular-nums">
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
      </Card>
    </div>
  );
}
