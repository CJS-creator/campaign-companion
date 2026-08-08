import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type TimeframeOption = "7d" | "30d" | "90d" | "all";

const analyticsInputSchema = z.object({
  timeframe: z.enum(["7d", "30d", "90d", "all"]).default("30d"),
  campaignId: z.string().uuid().nullable().optional(),
});

export type TimeSeriesDataPoint = {
  date: string;
  displayDate: string;
  sent: number;
  opens: number;
  clicks: number;
};

export type CampaignComparisonPoint = {
  campaignId: string;
  subject: string;
  createdAt: string;
  sent: number;
  opens: number;
  clicks: number;
  openRate: number;
  clickRate: number;
};

export type TopLinkItem = {
  url: string;
  totalClicks: number;
  uniqueLeads: number;
  campaignSubject: string;
};

export type AnalyticsSummaryData = {
  timeframe: TimeframeOption;
  totalSent: number;
  totalOpens: number;
  totalClicks: number;
  openRatePct: number;
  clickRatePct: number;
  clickToOpenRatePct: number;
  timeSeries: TimeSeriesDataPoint[];
  campaignComparison: CampaignComparisonPoint[];
  topLinks: TopLinkItem[];
};

export const fetchAnalyticsData = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => analyticsInputSchema.parse(data ?? {}))
  .handler(async ({ data }): Promise<AnalyticsSummaryData> => {
    const { assertOwner } = await import("./owner-guard.server");
    await assertOwner();

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Calculate cutoff date based on timeframe
    const now = new Date();
    let cutoffDate: Date | null = new Date();
    if (data.timeframe === "7d") {
      cutoffDate.setDate(now.getDate() - 7);
    } else if (data.timeframe === "30d") {
      cutoffDate.setDate(now.getDate() - 30);
    } else if (data.timeframe === "90d") {
      cutoffDate.setDate(now.getDate() - 90);
    } else {
      cutoffDate = null;
    }

    const cutoffIso = cutoffDate ? cutoffDate.toISOString() : null;

    // 1. Query Sends
    let sendsQuery = supabaseAdmin
      .from("sends")
      .select("id, campaign_id, lead_id, status, sent_at, opened_at, clicked_at, created_at");

    if (cutoffIso) {
      sendsQuery = sendsQuery.gte("created_at", cutoffIso);
    }
    if (data.campaignId) {
      sendsQuery = sendsQuery.eq("campaign_id", data.campaignId);
    }

    const { data: sends, error: sendsError } = await sendsQuery;
    if (sendsError) throw new Error(sendsError.message);

    // 2. Query Campaigns
    let campaignsQuery = supabaseAdmin
      .from("campaigns")
      .select("id, subject, created_at, offer_url");
    if (data.campaignId) {
      campaignsQuery = campaignsQuery.eq("id", data.campaignId);
    }
    const { data: campaigns } = await campaignsQuery;
    const campaignMap = new Map((campaigns ?? []).map((c) => [c.id, c]));

    // 3. Query Events
    let eventsQuery = supabaseAdmin
      .from("events")
      .select("id, event_type, campaign_id, lead_id, metadata, created_at")
      .in("event_type", ["opened", "clicked"]);

    if (cutoffIso) {
      eventsQuery = eventsQuery.gte("created_at", cutoffIso);
    }
    if (data.campaignId) {
      eventsQuery = eventsQuery.eq("campaign_id", data.campaignId);
    }
    const { data: events } = await eventsQuery;

    const allSends = sends ?? [];
    const sentRecords = allSends.filter((s) => s.status === "sent");
    const totalSent = sentRecords.length;
    const totalOpens = allSends.filter((s) => s.opened_at).length;
    const totalClicks = allSends.filter((s) => s.clicked_at).length;

    const openRatePct = totalSent ? Math.round((totalOpens / totalSent) * 100) : 0;
    const clickRatePct = totalSent ? Math.round((totalClicks / totalSent) * 100) : 0;
    const clickToOpenRatePct = totalOpens ? Math.round((totalClicks / totalOpens) * 100) : 0;

    // Build Time-Series Map by Date (YYYY-MM-DD)
    const dateMap = new Map<string, { sent: number; opens: number; clicks: number }>();

    // Pre-populate days for continuous line chart
    const daysCount = data.timeframe === "7d" ? 7 : data.timeframe === "90d" ? 90 : 30;
    if (data.timeframe !== "all") {
      for (let i = daysCount - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const isoKey = d.toISOString().slice(0, 10);
        dateMap.set(isoKey, { sent: 0, opens: 0, clicks: 0 });
      }
    }

    allSends.forEach((s) => {
      if (s.sent_at) {
        const key = s.sent_at.slice(0, 10);
        const entry = dateMap.get(key) || { sent: 0, opens: 0, clicks: 0 };
        entry.sent += 1;
        dateMap.set(key, entry);
      }
      if (s.opened_at) {
        const key = s.opened_at.slice(0, 10);
        const entry = dateMap.get(key) || { sent: 0, opens: 0, clicks: 0 };
        entry.opens += 1;
        dateMap.set(key, entry);
      }
      if (s.clicked_at) {
        const key = s.clicked_at.slice(0, 10);
        const entry = dateMap.get(key) || { sent: 0, opens: 0, clicks: 0 };
        entry.clicks += 1;
        dateMap.set(key, entry);
      }
    });

    const timeSeries: TimeSeriesDataPoint[] = Array.from(dateMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, val]) => ({
        date,
        displayDate: new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        sent: val.sent,
        opens: val.opens,
        clicks: val.clicks,
      }));

    // Build Campaign Comparison metrics
    const campaignComparison: CampaignComparisonPoint[] = (campaigns ?? []).map((c) => {
      const cSends = allSends.filter((s) => s.campaign_id === c.id);
      const cSent = cSends.filter((s) => s.status === "sent").length;
      const cOpens = cSends.filter((s) => s.opened_at).length;
      const cClicks = cSends.filter((s) => s.clicked_at).length;
      return {
        campaignId: c.id,
        subject: c.subject.length > 25 ? `${c.subject.slice(0, 25)}…` : c.subject,
        createdAt: c.created_at,
        sent: cSent,
        opens: cOpens,
        clicks: cClicks,
        openRate: cSent ? Math.round((cOpens / cSent) * 100) : 0,
        clickRate: cSent ? Math.round((cClicks / cSent) * 100) : 0,
      };
    });

    // Build Top-Clicked Links analysis
    const linkMap = new Map<
      string,
      { totalClicks: number; leads: Set<string>; campaignSubject: string }
    >();
    (events ?? [])
      .filter((e) => e.event_type === "clicked")
      .forEach((e) => {
        const campaign = campaignMap.get(e.campaign_id || "");
        const offerUrl = campaign?.offer_url || "Tracked Campaign Link";
        const entry = linkMap.get(offerUrl) || {
          totalClicks: 0,
          leads: new Set<string>(),
          campaignSubject: campaign?.subject || "Marketing Email",
        };
        entry.totalClicks += 1;
        if (e.lead_id) entry.leads.add(e.lead_id);
        linkMap.set(offerUrl, entry);
      });

    const topLinks: TopLinkItem[] = Array.from(linkMap.entries())
      .map(([url, val]) => ({
        url,
        totalClicks: val.totalClicks,
        uniqueLeads: val.leads.size,
        campaignSubject: val.campaignSubject,
      }))
      .sort((a, b) => b.totalClicks - a.totalClicks);

    return {
      timeframe: data.timeframe,
      totalSent,
      totalOpens,
      totalClicks,
      openRatePct,
      clickRatePct,
      clickToOpenRatePct,
      timeSeries,
      campaignComparison,
      topLinks,
    };
  });
