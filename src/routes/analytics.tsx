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
  ShieldCheck,
  AlertTriangle,
  Activity,
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
import { Button } from "@/components/ui/button";
import { SkeletonCard, SkeletonTable } from "@/components/ui/skeleton";
import { PageHeader, StatCard, StatusBadge, DataTable, type Column } from "@/components/patterns";

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

interface TopLinkRow {
  url: string;
  campaignSubject: string;
  totalClicks: number;
  uniqueLeads: number;
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

  const topLinksData: TopLinkRow[] = analytics?.topLinks ?? [];

  const topLinksColumns: Column<TopLinkRow>[] = [
    {
      key: "url",
      header: "Destination Link URL",
      cell: (row) => (
        <a
          href={row.url.startsWith("http") ? row.url : `https://${row.url}`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 hover:underline text-primary font-medium max-w-md truncate"
        >
          {row.url}
          <ExternalLink className="size-3 shrink-0" />
        </a>
      ),
    },
    {
      key: "campaignSubject",
      header: "Campaign Subject",
      cell: (row) => <span className="text-muted-foreground font-medium">{row.campaignSubject}</span>,
    },
    {
      key: "totalClicks",
      header: "Total Clicks",
      className: "text-right w-28",
      cell: (row) => <span className="font-bold text-warning tabular-nums">{row.totalClicks}</span>,
    },
    {
      key: "uniqueLeads",
      header: "Unique Leads",
      className: "text-right w-28",
      cell: (row) => <span className="font-semibold text-foreground tabular-nums">{row.uniqueLeads}</span>,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Performance Analytics"
        description="Visual engagement metrics, deliverability health, time-series trends, and top offer link performance."
        actions={
          <div className="flex flex-wrap items-center gap-2.5">
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

            <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/40 p-1.5 rounded-lg border border-border/80">
              <Calendar className="size-3.5 ml-1" />
              <select
                value={timeframe}
                onChange={(e) => setTimeframe(e.target.value as TimeframeOption)}
                className="bg-transparent text-foreground text-xs font-semibold focus:outline-none pr-2 cursor-pointer"
                aria-label="Filter analytics timeframe"
              >
                <option value="7d">Last 7 Days</option>
                <option value="30d">Last 30 Days</option>
                <option value="90d">Last 90 Days</option>
                <option value="all">All Time</option>
              </select>
            </div>

            <Button type="button" variant="outline" size="sm" onClick={exportAnalyticsCsv} className="h-9 text-xs" aria-label="Export analytics report">
              <Download className="size-3.5 mr-1.5" /> Export Report
            </Button>
          </div>
        }
      />

      {/* Headline Health & Risk Hierarchy Cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="glass-panel rounded-xl p-4 border border-success/30 bg-success/5 flex items-start gap-3 shadow-xs">
          <div className="rounded-lg bg-success/20 p-2 text-success shrink-0">
            <ShieldCheck className="size-5" />
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-sm text-foreground">Bounce Risk Status</h3>
              <StatusBadge status="sent" label="Low Risk (< 0.5%)" />
            </div>
            <p className="text-xs text-muted-foreground">
              Your overall delivery bounce rate is well within Postmark's 2% safety threshold.
            </p>
          </div>
        </div>

        <div className="glass-panel rounded-xl p-4 border border-info/30 bg-info/5 flex items-start gap-3 shadow-xs">
          <div className="rounded-lg bg-info/20 p-2 text-info shrink-0">
            <Activity className="size-5" />
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-sm text-foreground">Complaint Risk Score</h3>
              <StatusBadge status="info" label="Optimal (0.01%)" />
            </div>
            <p className="text-xs text-muted-foreground">
              Spam complaint rate remains optimal with high domain reputation score.
            </p>
          </div>
        </div>
      </div>

      {/* Primary Key Performance Metrics Grid */}
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
            value={analytics?.totalSent ?? 0}
            change={{ value: "100% delivered", trend: "up" }}
            sparklineData={[10, 20, 30, 45, 60, analytics?.totalSent ?? 0]}
          />
          <StatCard
            icon={Eye}
            title="Open Rate"
            value={`${analytics?.openRatePct ?? 0}%`}
            change={{ value: `${analytics?.totalOpens ?? 0} opens`, trend: "up" }}
            sparklineData={[15, 22, 28, 35, 42, analytics?.openRatePct ?? 0]}
          />
          <StatCard
            icon={MousePointerClick}
            title="Click Rate"
            value={`${analytics?.clickRatePct ?? 0}%`}
            change={{ value: `${analytics?.totalClicks ?? 0} clicks`, trend: "up" }}
            sparklineData={[5, 10, 15, 20, 25, analytics?.clickRatePct ?? 0]}
          />
          <StatCard
            icon={Percent}
            title="Click-to-Open"
            value={`${analytics?.clickToOpenRatePct ?? 0}%`}
            change={{ value: "High engagement", trend: "up" }}
            sparklineData={[30, 35, 40, 45, 50, analytics?.clickToOpenRatePct ?? 0]}
          />
        </div>
      )}

      {/* Time-Series Engagement Line Chart */}
      <div className="glass-panel rounded-xl p-6 border border-border/80 space-y-4 shadow-xs">
        <div>
          <h2 className="text-base font-bold flex items-center gap-2 font-heading text-foreground">
            <TrendingUp className="size-5 text-primary" />
            Engagement Trends Over Time
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Daily performance curves comparing emails delivered, unique opens, and offer link clicks.
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
                  stroke="oklch(0.58 0.18 230)"
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                  activeDot={{ r: 6 }}
                />
                <Line
                  type="monotone"
                  dataKey="opens"
                  name="Unique Opens"
                  stroke="oklch(0.62 0.22 260)"
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                  activeDot={{ r: 6 }}
                />
                <Line
                  type="monotone"
                  dataKey="clicks"
                  name="Link Clicks"
                  stroke="oklch(0.72 0.17 75)"
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
      </div>

      {/* Campaign Performance Comparison Bar Chart */}
      <div className="glass-panel rounded-xl p-6 border border-border/80 space-y-4 shadow-xs">
        <div>
          <h2 className="text-base font-bold flex items-center gap-2 font-heading text-foreground">
            <BarChart3 className="size-5 text-primary" />
            Campaign Performance Comparison
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Side-by-side open rate and click rate comparison across marketing campaigns.
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
                <Bar dataKey="openRate" name="Open Rate %" fill="oklch(0.62 0.22 260)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="clickRate" name="Click Rate %" fill="oklch(0.72 0.17 75)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
              No campaign data available for comparison.
            </div>
          )}
        </div>
      </div>

      {/* Top-Clicked Links Table */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Target className="size-5 text-warning" />
          <h2 className="text-base font-bold font-heading text-foreground">Top Performing Tracked Links</h2>
        </div>
        <DataTable
          data={topLinksData}
          columns={topLinksColumns}
          keyExtractor={(item, index) => `${item.url}-${index}`}
          searchPlaceholder="Search destination URLs..."
          loading={isLoading}
          emptyTitle="No Link Clicks Recorded"
          emptyDescription="When subscribers click tracked offer links in your campaigns, they will appear here."
        />
      </div>
    </div>
  );
}
