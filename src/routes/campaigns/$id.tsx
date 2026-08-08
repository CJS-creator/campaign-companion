import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  RefreshCw,
  AlertCircle,
  Copy,
  Calendar,
  Play,
  XCircle,
  OctagonX,
  Clock,
  Eye,
  MousePointerClick,
  Mail,
} from "lucide-react";
import { campaignQuery, leadsQuery, sendsQuery } from "@/lib/data";
import {
  retryFailedSends,
  retrySingleSend,
  sendScheduledNow,
  cancelScheduledCampaign,
  stopCampaignSending,
  resumeCampaignSending,
  rescheduleCampaign,
} from "@/lib/campaigns.functions";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSettings } from "@/lib/settings.functions";
import { isVerifiedSenderAddress } from "@/lib/sender";
import { SendTestEmailDialog } from "@/components/SendTestEmailDialog";
import { CheckSendingOptionDialog } from "@/components/CheckSendingOptionDialog";
import { CampaignErrorLogsDialog } from "@/components/CampaignErrorLogsDialog";
import { PageHeader, StatusBadge, StatCard, DataTable, type Column } from "@/components/patterns";

export const Route = createFileRoute("/campaigns/$id")({
  head: () => ({
    meta: [
      { title: "Campaign detail — Postmark Studio" },
      { name: "description", content: "See who opened and clicked this email campaign." },
    ],
  }),
  component: CampaignDetail,
});

interface SendRowItem {
  id: string;
  lead_id: string;
  lead_email: string;
  status: string;
  sent_at?: string | null;
  opened_at?: string | null;
  clicked_at?: string | null;
  failure_reason?: string | null;
  attempt_count: number;
}

function CampaignDetail() {
  const { id } = Route.useParams();
  const queryClient = useQueryClient();

  const [isRescheduleOpen, setIsRescheduleOpen] = useState(false);
  const [newScheduleTime, setNewScheduleTime] = useState("");

  const { data: campaign, isLoading } = useQuery({
    ...campaignQuery(id),
    refetchInterval: (query) =>
      query.state.data?.status === "queued" || query.state.data?.status === "sending"
        ? 1500
        : false,
  });

  const { data: sends = [] } = useQuery({
    ...sendsQuery,
    refetchInterval: campaign?.status === "queued" || campaign?.status === "sending" ? 1500 : false,
  });

  const { data: leads = [] } = useQuery(leadsQuery);
  const { data: ownerSettings } = useQuery({
    queryKey: ["settings"],
    queryFn: () => getSettings(),
  });
  const senderVerified = isVerifiedSenderAddress(ownerSettings?.from_address ?? "");

  const retryAllMutation = useMutation({
    mutationFn: () => retryFailedSends({ data: { campaignId: id } }),
    onSuccess: () => {
      toast.success("Queued all failed sends for retry");
      queryClient.invalidateQueries({ queryKey: ["campaign", id] });
      queryClient.invalidateQueries({ queryKey: ["sends"] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to retry sends");
    },
  });

  const retrySingleMutation = useMutation({
    mutationFn: (sendId: string) => retrySingleSend({ data: { sendId } }),
    onSuccess: () => {
      toast.success("Queued single email for retry");
      queryClient.invalidateQueries({ queryKey: ["campaign", id] });
      queryClient.invalidateQueries({ queryKey: ["sends"] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to retry send");
    },
  });

  const sendNowMutation = useMutation({
    mutationFn: () => sendScheduledNow({ data: { campaignId: id } }),
    onSuccess: () => {
      toast.success("Campaign queue started now!");
      queryClient.invalidateQueries({ queryKey: ["campaign", id] });
      queryClient.invalidateQueries({ queryKey: ["sends"] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to start sending");
    },
  });

  const cancelScheduleMutation = useMutation({
    mutationFn: () => cancelScheduledCampaign({ data: { campaignId: id } }),
    onSuccess: () => {
      toast.success("Scheduled campaign reverted to draft");
      queryClient.invalidateQueries({ queryKey: ["campaign", id] });
      queryClient.invalidateQueries({ queryKey: ["sends"] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to cancel schedule");
    },
  });

  const rescheduleMutation = useMutation({
    mutationFn: () =>
      rescheduleCampaign({ data: { campaignId: id, scheduledFor: newScheduleTime } }),
    onSuccess: () => {
      toast.success("Campaign rescheduled successfully!");
      setIsRescheduleOpen(false);
      queryClient.invalidateQueries({ queryKey: ["campaign", id] });
      queryClient.invalidateQueries({ queryKey: ["sends"] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to reschedule campaign");
    },
  });

  const stopSendingMutation = useMutation({
    mutationFn: () => stopCampaignSending({ data: { campaignId: id } }),
    onSuccess: (res) => {
      toast.success(`Stopped campaign sending. Skipped ${res.skippedCount} unsent email(s).`);
      queryClient.invalidateQueries({ queryKey: ["campaign", id] });
      queryClient.invalidateQueries({ queryKey: ["sends"] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to stop campaign sending");
    },
  });

  const resumeSendingMutation = useMutation({
    mutationFn: () => resumeCampaignSending({ data: { campaignId: id } }),
    onSuccess: () => {
      toast.success("Resumed campaign delivery worker!");
      queryClient.invalidateQueries({ queryKey: ["campaign", id] });
      queryClient.invalidateQueries({ queryKey: ["sends"] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to resume campaign sending");
    },
  });

  const rows = sends.filter((send) => send.campaign_id === id);
  const leadById = new Map(leads.map((lead) => [lead.id, lead]));
  const delivered = rows.filter((send) => send.status === "sent").length;
  const failed = rows.filter((send) => send.status === "failed").length;
  const sending = rows.filter((send) => send.status === "sending").length;
  const queued = rows.filter((send) => send.status === "queued").length;
  const openedCount = rows.filter((send) => send.opened_at).length;
  const clickedCount = rows.filter((send) => send.clicked_at).length;
  const completed = delivered + failed;
  const progress = rows.length ? Math.round((completed / rows.length) * 100) : 0;

  if (isLoading) return <p className="text-muted-foreground p-6">Loading campaign details…</p>;
  if (!campaign) return <p className="text-muted-foreground p-6">Campaign not found.</p>;

  const isProcessing = campaign.status === "queued" || campaign.status === "sending";
  const isScheduled = campaign.status === "scheduled";

  const sendTableData: SendRowItem[] = rows.map((s) => ({
    id: s.id,
    lead_id: s.lead_id,
    lead_email: leadById.get(s.lead_id)?.email ?? "Unknown",
    status: s.status,
    sent_at: s.sent_at,
    opened_at: s.opened_at,
    clicked_at: s.clicked_at,
    failure_reason: s.failure_reason,
    attempt_count: s.attempt_count,
  }));

  const columns: Column<SendRowItem>[] = [
    {
      key: "lead_email",
      header: "Recipient",
      cell: (row) => <span className="font-semibold text-foreground">{row.lead_email}</span>,
    },
    {
      key: "status",
      header: "Delivery Status",
      cell: (row) => (
        <StatusBadge
          status={row.status}
          label={row.status === "failed" ? `Failed (Attempt ${row.attempt_count})` : undefined}
        />
      ),
    },
    {
      key: "sent_at",
      header: "Sent At",
      cell: (row) => <span className="text-muted-foreground text-xs">{row.sent_at ? new Date(row.sent_at).toLocaleString() : "—"}</span>,
    },
    {
      key: "opened_at",
      header: "Opened At",
      cell: (row) => <span className="text-muted-foreground text-xs">{row.opened_at ? new Date(row.opened_at).toLocaleString() : "—"}</span>,
    },
    {
      key: "clicked_at",
      header: "Clicked At",
      cell: (row) => <span className="text-muted-foreground text-xs">{row.clicked_at ? new Date(row.clicked_at).toLocaleString() : "—"}</span>,
    },
    {
      key: "failure_reason",
      header: "Failure Reason",
      cell: (row) => (
        <span className="font-mono text-xs text-destructive max-w-xs truncate block">
          {row.failure_reason || "—"}
        </span>
      ),
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      className: "text-right w-24",
      cell: (row) =>
        row.status === "failed" ? (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-xs"
            onClick={() => retrySingleMutation.mutate(row.id)}
            disabled={retrySingleMutation.isPending}
            aria-label={`Retry send to ${row.lead_email}`}
          >
            <RefreshCw className={`size-3.5 mr-1 ${retrySingleMutation.isPending ? "animate-spin" : ""}`} />
            Retry
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={campaign.subject}
        description={
          isScheduled && campaign.scheduled_for
            ? `Scheduled for ${new Date(campaign.scheduled_for).toLocaleString()}`
            : campaign.sent_at
              ? `Completed on ${new Date(campaign.sent_at).toLocaleString()}`
              : "Campaign performance and recipient delivery log."
        }
        badge={{
          label: isScheduled ? "Scheduled" : campaign.status,
          variant: campaign.status === "sent" ? "success" : isScheduled ? "info" : "outline",
        }}
        backLink={{ to: "/", label: "Back to Dashboard" }}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <CheckSendingOptionDialog campaignId={campaign.id} />
            <SendTestEmailDialog
              campaignId={campaign.id}
              campaignSubject={campaign.subject}
              senderVerified={senderVerified}
            />

            <Button asChild variant="outline" size="sm" className="h-9 text-xs" aria-label="Duplicate campaign">
              <Link to="/campaigns/new" search={{ clone: campaign.id }}>
                <Copy className="size-3.5 mr-1.5" /> Duplicate
              </Link>
            </Button>

            {isProcessing && (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => stopSendingMutation.mutate()}
                disabled={stopSendingMutation.isPending}
                className="h-9 text-xs"
                aria-label="Stop sending campaign"
              >
                <OctagonX className="size-3.5 mr-1.5" /> Stop Sending
              </Button>
            )}

            {failed > 0 && !isProcessing && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
                onClick={() => retryAllMutation.mutate()}
                disabled={retryAllMutation.isPending}
                aria-label="Retry all failed sends"
              >
                <RefreshCw className={`size-3.5 mr-1.5 ${retryAllMutation.isPending ? "animate-spin" : ""}`} />
                Retry Failed ({failed})
              </Button>
            )}
          </div>
        }
      />

      {/* Top Stat Cards Row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Mail}
          title="Delivered"
          value={delivered}
          change={{ value: `${rows.length} total`, trend: "neutral" }}
        />
        <StatCard
          icon={Eye}
          title="Opens"
          value={openedCount}
          change={{ value: delivered ? `${Math.round((openedCount / delivered) * 100)}%` : "0%", trend: "up" }}
        />
        <StatCard
          icon={MousePointerClick}
          title="Clicks"
          value={clickedCount}
          change={{ value: delivered ? `${Math.round((clickedCount / delivered) * 100)}%` : "0%", trend: "up" }}
        />
        <StatCard
          icon={AlertCircle}
          title="Failed / Bounces"
          value={failed}
          change={{ value: failed ? "Requires retry" : "Zero errors", trend: failed ? "down" : "neutral" }}
        />
      </div>

      {isScheduled && (
        <div className="glass-panel rounded-xl p-5 border border-info/40 bg-info/5 space-y-3 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <h2 className="font-bold text-sm text-foreground flex items-center gap-2 font-heading">
                <Calendar className="size-4.5 text-info" /> Scheduled Send Queue
              </h2>
              <p className="text-xs text-muted-foreground">
                This campaign is scheduled for automatic delivery on{" "}
                <strong className="text-foreground">{new Date(campaign.scheduled_for!).toLocaleString()}</strong> to{" "}
                {campaign.recipient_count} recipients.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs font-semibold"
                onClick={() => {
                  if (campaign.scheduled_for) {
                    setNewScheduleTime(new Date(campaign.scheduled_for).toISOString().slice(0, 16));
                  }
                  setIsRescheduleOpen(true);
                }}
              >
                <Clock className="size-3.5 mr-1" /> Reschedule
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs font-semibold"
                onClick={() => sendNowMutation.mutate()}
                disabled={sendNowMutation.isPending || !senderVerified}
              >
                <Play className="size-3.5 mr-1" /> Send Immediately
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs font-semibold text-destructive hover:bg-destructive/10"
                onClick={() => cancelScheduleMutation.mutate()}
                disabled={cancelScheduleMutation.isPending}
              >
                <XCircle className="size-3.5 mr-1" /> Cancel Schedule
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Reschedule Dialog */}
      <Dialog open={isRescheduleOpen} onOpenChange={setIsRescheduleOpen}>
        <DialogContent className="max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              <Clock className="size-4.5 text-primary" /> Reschedule Campaign
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Select a new date and time for this campaign to automatically send.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="rescheduleTime" className="text-xs font-semibold">
                New Send Date & Time (IST)
              </Label>
              <Input
                id="rescheduleTime"
                type="datetime-local"
                value={newScheduleTime}
                onChange={(e) => setNewScheduleTime(e.target.value)}
                className="h-10 text-sm"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setIsRescheduleOpen(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={rescheduleMutation.isPending || !newScheduleTime}
                onClick={() => rescheduleMutation.mutate()}
              >
                {rescheduleMutation.isPending ? "Rescheduling…" : "Save New Schedule"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Email Body Preview */}
      <div className="glass-panel rounded-xl p-5 border border-border/80 space-y-3 shadow-xs">
        <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Campaign Body Preview
        </h2>
        <div
          className="prose-editor text-sm leading-relaxed rounded-lg border border-border/60 bg-card p-4"
          dangerouslySetInnerHTML={{ __html: campaign.body_html }}
        />
      </div>

      {isProcessing && (
        <div className="glass-panel rounded-xl p-5 border border-primary/30 bg-primary/5 space-y-3 shadow-xs" aria-live="polite">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h2 className="font-bold text-sm text-foreground flex items-center gap-2">
                <RefreshCw className="size-4 animate-spin text-primary" /> Delivery Queue Processing
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {rows.length === 0
                  ? "Preparing recipient queue…"
                  : `${completed} of ${rows.length} processed · ${delivered} sent · ${sending + queued} pending${failed ? ` · ${failed} failed` : ""}`}
              </p>
            </div>
            <span className="text-sm font-bold text-primary tabular-nums">{progress}%</span>
          </div>
          <Progress value={progress} aria-label={`Campaign send progress: ${progress}%`} />
        </div>
      )}

      {/* Recipient Deliveries Table */}
      <DataTable
        data={sendTableData}
        columns={columns}
        keyExtractor={(item) => item.id}
        searchPlaceholder="Search recipient email..."
        emptyTitle="No Recipient Deliveries Recorded"
        emptyDescription="This campaign has not queued any recipient sends yet."
      />
    </div>
  );
}
