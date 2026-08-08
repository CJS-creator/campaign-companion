import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Download, Filter, ScrollText, Eye, Clock } from "lucide-react";
import { campaignsQuery, eventsQuery, type EventRow } from "@/lib/data";
import { fetchAuditLogs } from "@/lib/app.functions";
import { EVENT_TYPES } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { EmailDeliveryMonitorView } from "@/components/EmailDeliveryMonitorView";
import { PageHeader, StatusBadge, DataTable, type Column } from "@/components/patterns";

export const Route = createFileRoute("/events")({
  head: () => ({
    meta: [
      { title: "Events & Audit — Postmark Studio" },
      {
        name: "description",
        content:
          "Filter delivery, open, click, bounce and complaint events per send, and export the audit trail.",
      },
    ],
  }),
  component: EventsPage,
});

function EventsPage() {
  const [types, setTypes] = useState<string[]>([]);
  const [campaignId, setCampaignId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selectedEvent, setSelectedEvent] = useState<EventRow | null>(null);

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
    setTypes((current) =>
      current.includes(type) ? current.filter((t) => t !== type) : [...current, type],
    );

  const applyPreset = (preset: "all" | "deliveries" | "engagements" | "issues") => {
    if (preset === "all") setTypes([]);
    else if (preset === "deliveries") setTypes(["delivered"]);
    else if (preset === "engagements") setTypes(["opened", "clicked"]);
    else if (preset === "issues") setTypes(["bounced", "complained", "failed"]);
  };

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

  const columns: Column<EventRow>[] = [
    {
      key: "created_at",
      header: "Timestamp",
      className: "w-44 text-xs text-muted-foreground",
      cell: (row) => new Date(row.created_at).toLocaleString(),
    },
    {
      key: "event_type",
      header: "Event",
      className: "w-32",
      cell: (row) => <StatusBadge status={row.event_type} />,
    },
    {
      key: "lead_email",
      header: "Recipient",
      cell: (row) => <span className="font-semibold text-foreground">{row.lead_email || "—"}</span>,
    },
    {
      key: "campaign_subject",
      header: "Campaign",
      cell: (row) => <span className="text-muted-foreground">{row.campaign_subject || "—"}</span>,
    },
    {
      key: "actions",
      header: <span className="sr-only">Details</span>,
      className: "w-20 text-right",
      cell: (row) => (
        <Button
          size="icon"
          variant="ghost"
          className="size-8"
          onClick={() => setSelectedEvent(row)}
          title="View Event Details"
          aria-label="View event timeline details"
        >
          <Eye className="size-4" />
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Events & Audit"
        description="Delivery, open, click, bounce, complaint and unsubscribe events recorded per send."
        actions={
          <Button type="button" variant="outline" onClick={exportCsv} className="h-9 text-xs" aria-label="Export CSV events">
            <Download className="size-3.5 mr-1.5" /> Export CSV
          </Button>
        }
      />

      {/* Filter Controls & Presets Panel */}
      <div className="glass-panel rounded-xl p-5 border border-border/80 space-y-4 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3">
          <h2 className="flex items-center gap-2 text-sm font-bold font-heading text-foreground">
            <Filter className="size-4 text-primary" /> Filter Events & Presets
          </h2>

          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-muted-foreground font-medium">Saved Presets:</span>
            <Button
              type="button"
              variant={types.length === 0 ? "default" : "outline"}
              size="sm"
              className="h-7 text-xs px-2.5"
              onClick={() => applyPreset("all")}
            >
              All Events
            </Button>
            <Button
              type="button"
              variant={types.includes("delivered") ? "default" : "outline"}
              size="sm"
              className="h-7 text-xs px-2.5"
              onClick={() => applyPreset("deliveries")}
            >
              Deliveries
            </Button>
            <Button
              type="button"
              variant={types.includes("opened") ? "default" : "outline"}
              size="sm"
              className="h-7 text-xs px-2.5"
              onClick={() => applyPreset("engagements")}
            >
              Engagements
            </Button>
            <Button
              type="button"
              variant={types.includes("bounced") ? "default" : "outline"}
              size="sm"
              className="h-7 text-xs px-2.5 text-destructive"
              onClick={() => applyPreset("issues")}
            >
              Issues / Bounces
            </Button>
          </div>
        </div>

        {/* Filter Chips */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {EVENT_TYPES.map((type) => {
            const isSelected = types.includes(type);
            return (
              <button
                type="button"
                key={type}
                onClick={() => toggleType(type)}
                aria-label={`Toggle filter for ${type}`}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors border ${
                  isSelected
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card text-muted-foreground border-border hover:bg-accent"
                }`}
              >
                {type}
              </button>
            );
          })}
        </div>

        {/* Grid Inputs */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="event-campaign" className="text-xs font-semibold">Campaign</Label>
            <select
              id="event-campaign"
              value={campaignId}
              onChange={(e) => setCampaignId(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-card px-3 text-xs text-foreground cursor-pointer"
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
            <Label htmlFor="event-search" className="text-xs font-semibold">Recipient or Subject</Label>
            <Input
              id="event-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="jane@example.com"
              className="h-9 text-xs bg-card"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="event-from" className="text-xs font-semibold">From Date</Label>
            <Input
              id="event-from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="h-9 text-xs bg-card"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="event-to" className="text-xs font-semibold">To Date</Label>
            <Input
              id="event-to"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="h-9 text-xs bg-card"
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground pt-1">
          <span>
            {isLoading ? "Loading events…" : `${events.length} event${events.length === 1 ? "" : "s"} matched`}
          </span>
          <Button type="button" variant="ghost" size="sm" onClick={resetFilters} className="h-7 text-xs">
            Reset filters
          </Button>
        </div>
      </div>

      {/* Events Table Shell */}
      <DataTable
        data={events}
        columns={columns}
        keyExtractor={(item) => item.id}
        searchable={false}
        loading={isLoading}
        emptyTitle="No Delivery Events Found"
        emptyDescription="No events match your selected filters. Try broadening your date range or event type criteria."
      />

      {/* Owner Audit Trail Card */}
      <div className="glass-panel rounded-xl p-5 border border-border/80 space-y-4 shadow-xs">
        <h2 className="flex items-center gap-2 text-sm font-bold font-heading text-foreground">
          <ScrollText className="size-4 text-primary" /> System & Owner Audit Trail
        </h2>
        {auditLogs.length === 0 ? (
          <p className="text-xs text-muted-foreground">No owner actions recorded yet.</p>
        ) : (
          <ul className="divide-y divide-border/60 text-xs">
            {auditLogs.map((log) => (
              <li key={log.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <span className="font-medium text-foreground">{log.action.replaceAll("_", " ")}</span>
                <span className="text-[11px] text-muted-foreground">
                  {new Date(log.created_at).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <EmailDeliveryMonitorView />

      {/* Per-send Timeline Drawer/Modal */}
      {selectedEvent && (
        <Dialog open={Boolean(selectedEvent)} onOpenChange={() => setSelectedEvent(null)}>
          <DialogContent className="sm:max-w-md bg-card border-border">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base font-bold">
                <Clock className="size-4.5 text-primary" /> Event Timeline Detail
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 pt-2 text-xs">
              <div className="flex justify-between border-b border-border/60 pb-2">
                <span className="text-muted-foreground">Event Type:</span>
                <StatusBadge status={selectedEvent.event_type} />
              </div>
              <div className="flex justify-between border-b border-border/60 pb-2">
                <span className="text-muted-foreground">Recipient Email:</span>
                <strong className="text-foreground">{selectedEvent.lead_email || "—"}</strong>
              </div>
              <div className="flex justify-between border-b border-border/60 pb-2">
                <span className="text-muted-foreground">Campaign:</span>
                <strong className="text-foreground">{selectedEvent.campaign_subject || "—"}</strong>
              </div>
              <div className="flex justify-between border-b border-border/60 pb-2">
                <span className="text-muted-foreground">Timestamp:</span>
                <span className="font-mono text-muted-foreground">
                  {new Date(selectedEvent.created_at).toLocaleString()}
                </span>
              </div>
              {selectedEvent.reason && (
                <div className="space-y-1">
                  <span className="text-muted-foreground font-semibold">Reason / Server Response:</span>
                  <div className="rounded-md bg-muted p-2.5 font-mono text-[11px] text-foreground">
                    {selectedEvent.reason}
                  </div>
                </div>
              )}
              {selectedEvent.send_id && (
                <div className="flex justify-between text-[11px] text-muted-foreground pt-1">
                  <span>Send ID:</span>
                  <code className="font-mono">{selectedEvent.send_id}</code>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
