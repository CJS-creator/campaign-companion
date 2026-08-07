import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Activity, Download, Filter, ScrollText } from "lucide-react";
import { campaignsQuery, eventsQuery, type EventRow } from "@/lib/data";
import { fetchAuditLogs } from "@/lib/app.functions";
import { EVENT_TYPES } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

export const Route = createFileRoute("/events")({
  head: () => ({
    meta: [
      { title: "Events & Audit — Postmark Studio" },
      {
        name: "description",
        content: "Filter delivery, open, click, bounce and complaint events per send, and export the audit trail.",
      },
      { property: "og:title", content: "Events & Audit — Postmark Studio" },
      {
        property: "og:description",
        content: "Every delivery event per send, with filters and CSV export.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: EventsPage,
});

const badgeClass: Record<string, string> = {
  delivered: "bg-emerald-500/10 text-emerald-600",
  opened: "bg-sky-500/10 text-sky-600",
  clicked: "bg-violet-500/10 text-violet-600",
  bounced: "bg-red-500/10 text-red-600",
  complained: "bg-amber-500/10 text-amber-600",
  unsubscribed: "bg-muted text-muted-foreground",
  failed: "bg-red-500/10 text-red-600",
};

function EventsPage() {
  const [types, setTypes] = useState<string[]>([]);
  const [campaignId, setCampaignId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const { data: campaigns = [] } = useQuery(campaignsQuery);
  const { data: events = [], isLoading } = useQuery(
    eventsQuery({
      types,
      campaignId: campaignId || null,
      search,
      from: from ? new Date(from).toISOString() : null,
      to: to ? new Date(`${to}T23:59:59`).toISOString() : null,
    }),
  );
  const { data: auditLogs = [] } = useQuery({
    queryKey: ["audit-logs"],
    queryFn: () => fetchAuditLogs({ data: { limit: 100 } }),
  });

  const toggleType = (type: string) =>
    setTypes((current) => (current.includes(type) ? current.filter((t) => t !== type) : [...current, type]));

  const resetFilters = () => {
    setTypes([]);
    setCampaignId("");
    setSearch("");
    setFrom("");
    setTo("");
  };

  const exportCsv = () => {
    if (events.length === 0) {
      toast.info("Nothing to export with these filters");
      return;
    }
    const escape = (value: string) => `"${value.replaceAll('"', '""')}"`;
    const rows: string[][] = [
      ["timestamp", "event", "recipient", "campaign", "reason", "send_id"],
      ...events.map((event: EventRow) => [
        event.created_at,
        event.event_type,
        event.lead_email ?? "",
        event.campaign_subject ?? "",
        event.reason ?? "",
        event.send_id ?? "",
      ]),
    ];
    const csv = rows.map((row) => row.map((cell) => escape(String(cell))).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `events-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${events.length} event${events.length === 1 ? "" : "s"}`);
  };

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight flex items-center gap-2">
            <Activity className="size-7 text-primary" /> Events & Audit
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Delivery, open, click, bounce, complaint and unsubscribe events recorded per send.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={exportCsv}>
          <Download className="size-4" /> Export CSV
        </Button>
      </header>

      <Card className="space-y-5 p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Filter className="size-4 text-muted-foreground" /> Filters
        </h2>

        <div className="flex flex-wrap gap-4">
          {EVENT_TYPES.map((type) => (
            <label key={type} className="flex items-center gap-2 text-sm capitalize">
              <Checkbox
                checked={types.includes(type)}
                onCheckedChange={() => toggleType(type)}
                aria-label={`Filter ${type} events`}
              />
              {type}
            </label>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="event-campaign">Campaign</Label>
            <select
              id="event-campaign"
              value={campaignId}
              onChange={(e) => setCampaignId(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
            >
              <option value="">All campaigns</option>
              {campaigns.map((campaign) => (
                <option key={campaign.id} value={campaign.id}>
                  {campaign.subject}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="event-search">Recipient or subject</Label>
            <Input
              id="event-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="jane@example.com"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="event-from">From</Label>
            <Input id="event-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="event-to">To</Label>
            <Input id="event-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
          <span>{isLoading ? "Loading…" : `${events.length} event${events.length === 1 ? "" : "s"}`}</span>
          <Button type="button" variant="ghost" size="sm" onClick={resetFilters}>
            Reset filters
          </Button>
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-5 py-3 font-medium">When</th>
                <th className="px-5 py-3 font-medium">Event</th>
                <th className="px-5 py-3 font-medium">Recipient</th>
                <th className="px-5 py-3 font-medium">Campaign</th>
                <th className="px-5 py-3 font-medium">Reason</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-muted-foreground">
                    Loading events…
                  </td>
                </tr>
              )}
              {!isLoading && events.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-muted-foreground">
                    No events match these filters yet.
                  </td>
                </tr>
              )}
              {events.map((event: EventRow) => (
                <tr key={event.id} className="border-b border-border last:border-0">
                  <td className="whitespace-nowrap px-5 py-3 text-muted-foreground">
                    {new Date(event.created_at).toLocaleString()}
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                        badgeClass[event.event_type] ?? "bg-muted text-muted-foreground"
                      }`}
                    >
                      {event.event_type}
                    </span>
                  </td>
                  <td className="px-5 py-3 font-medium">{event.lead_email ?? "—"}</td>
                  <td className="px-5 py-3 text-muted-foreground">{event.campaign_subject ?? "—"}</td>
                  <td className="px-5 py-3 text-muted-foreground">{event.reason ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="space-y-4 p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <ScrollText className="size-4 text-muted-foreground" /> Owner audit trail
        </h2>
        {auditLogs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No owner actions recorded yet.</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {auditLogs.map((log) => (
              <li key={log.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="font-medium">{log.action.replaceAll("_", " ")}</span>
                <span className="text-xs text-muted-foreground">{new Date(log.created_at).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
