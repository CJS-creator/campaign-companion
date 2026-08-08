import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Copy,
  Calendar,
  Play,
  XCircle,
  OctagonX,
  Clock,
} from "lucide-react";
import { campaignQuery, leadsQuery, sendsQuery, type Send } from "@/lib/data";
import {
  retryFailedSends,
  retrySingleSend,
  sendScheduledNow,
  cancelScheduledCampaign,
  stopCampaignSending,
  resumeCampaignSending,
  rescheduleCampaign,
} from "@/lib/campaigns.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSettings } from "@/lib/settings.functions";
import { isVerifiedSenderAddress } from "@/lib/sender";
import { SendTestEmailDialog } from "@/components/SendTestEmailDialog";
import { CheckSendingOptionDialog } from "@/components/CheckSendingOptionDialog";

export const Route = createFileRoute("/campaigns/$id")({
  head: () => ({
    meta: [
      { title: "Campaign detail — Postmark Studio" },
      { name: "description", content: "See who opened and clicked this email campaign." },
      { property: "og:title", content: "Campaign detail — Postmark Studio" },
      { property: "og:description", content: "See who opened and clicked this email campaign." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CampaignDetail,
});

function CampaignDetail() {
  const { id } = Route.useParams();
  const queryClient = useQueryClient();

  const [isRescheduleOpen, setIsRescheduleOpen] = useState(false);
  const [newScheduleTime, setNewScheduleTime] = useState("");

  const { data: campaign, isLoading } = useQuery({
    ...campaignQuery(id),
    refetchInterval: (query) =>
      query.state.data?.status === "queued" || query.state.data?.status === "sending" ? 1500 : false,
  });

  const { data: sends = [] } = useQuery({
    ...sendsQuery,
    refetchInterval:
      campaign?.status === "queued" || campaign?.status === "sending" ? 1500 : false,
  });

  const { data: leads = [] } = useQuery(leadsQuery);
  const { data: ownerSettings } = useQuery({ queryKey: ["settings"], queryFn: () => getSettings() });
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
    mutationFn: () => rescheduleCampaign({ data: { campaignId: id, scheduledFor: newScheduleTime } }),
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
  const completed = delivered + failed;
  const progress = rows.length ? Math.round((completed / rows.length) * 100) : 0;

  if (isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (!campaign) return <p className="text-muted-foreground">Campaign not found.</p>;

  const isProcessing = campaign.status === "queued" || campaign.status === "sending";
  const isScheduled = campaign.status === "scheduled";

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2">
            <Link to="/"><ArrowLeft className="size-4" /> Dashboard</Link>
          </Button>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">{campaign.subject}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <Badge variant={campaign.status === "sent" ? "default" : isProcessing ? "secondary" : isScheduled ? "outline" : "outline"} className={isScheduled ? "bg-purple-500/10 text-purple-700 border-purple-500/30 font-semibold" : campaign.status === "cancelled" ? "bg-destructive/10 text-destructive border-destructive/30" : ""}>
              {isScheduled ? "Scheduled" : campaign.status}
            </Badge>
            {campaign.sent_at && <span>Completed {new Date(campaign.sent_at).toLocaleString()}</span>}
            {campaign.scheduled_for && isScheduled && (
              <span className="text-purple-600 font-medium">Scheduled for {new Date(campaign.scheduled_for).toLocaleString()}</span>
            )}
            {failed > 0 && (
              <span className="flex items-center gap-1 text-destructive text-xs font-medium">
                <AlertCircle className="size-3.5" /> {failed} send{failed === 1 ? "" : "s"} failed
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {!senderVerified && (
            <div className="w-full rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700">
              No verified sender address is configured, so sending is disabled.{" "}
              <Link to="/settings" className="font-medium underline underline-offset-2">
                Add it in Settings
              </Link>
              .
            </div>
          )}
          <CheckSendingOptionDialog campaignId={campaign.id} />
          <SendTestEmailDialog
            campaignId={campaign.id}
            campaignSubject={campaign.subject}
            senderVerified={senderVerified}
          />

          <Button asChild variant="outline">
            <Link to="/campaigns/new" search={{ clone: campaign.id }}>
              <Copy className="size-4" /> Duplicate campaign
            </Link>
          </Button>

          {isProcessing && (
            <Button
              type="button"
              variant="destructive"
              onClick={() => stopSendingMutation.mutate()}
              disabled={stopSendingMutation.isPending}
            >
              <OctagonX className="size-4 mr-1" /> Stop Sending
            </Button>
          )}

          {campaign.status === "cancelled" && (
            <Button
              type="button"
              variant="default"
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={() => resumeSendingMutation.mutate()}
              disabled={resumeSendingMutation.isPending}
            >
              <Play className="size-4 mr-1" /> Resume Sending
            </Button>
          )}

          {failed > 0 && !isProcessing && (
            <Button
              type="button"
              variant="outline"
              className="border-destructive/30 text-destructive hover:bg-destructive/10"
              onClick={() => retryAllMutation.mutate()}
              disabled={retryAllMutation.isPending}
            >
              <RefreshCw className={`size-4 ${retryAllMutation.isPending ? "animate-spin" : ""}`} />
              Retry all failed ({failed})
            </Button>
          )}
        </div>
      </div>

      {isScheduled && (
        <Card className="space-y-4 p-5 border-purple-500/30 bg-purple-500/5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <h2 className="font-semibold text-purple-900 flex items-center gap-2">
                <Calendar className="size-5 text-purple-600" />
                Scheduled Send Queue
              </h2>
              <p className="text-sm text-purple-700">
                This campaign is scheduled to be automatically delivered on{" "}
                <strong>{new Date(campaign.scheduled_for!).toLocaleString()}</strong> to {campaign.recipient_count} recipients.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                className="border-purple-300 text-purple-800 hover:bg-purple-100"
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
                className="border-purple-300 text-purple-800 hover:bg-purple-100"
                onClick={() => sendNowMutation.mutate()}
                disabled={sendNowMutation.isPending || !senderVerified}
              >
                <Play className="size-3.5 mr-1" /> Send Immediately
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-destructive/30 text-destructive hover:bg-destructive/10"
                onClick={() => cancelScheduleMutation.mutate()}
                disabled={cancelScheduleMutation.isPending}
              >
                <XCircle className="size-3.5 mr-1" /> Cancel Schedule
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Reschedule Dialog */}
      <Dialog open={isRescheduleOpen} onOpenChange={setIsRescheduleOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="size-5 text-purple-600" />
              Reschedule Campaign
            </DialogTitle>
            <DialogDescription>
              Select a new date and time for this campaign to automatically send.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="rescheduleTime" className="text-xs font-medium">New Send Date & Time (IST)</Label>
              <Input
                id="rescheduleTime"
                type="datetime-local"
                value={newScheduleTime}
                onChange={(e) => setNewScheduleTime(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setIsRescheduleOpen(false)}>Cancel</Button>
              <Button
                disabled={rescheduleMutation.isPending || !newScheduleTime}
                onClick={() => rescheduleMutation.mutate()}
              >
                {rescheduleMutation.isPending ? "Rescheduling…" : "Save New Schedule"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Card className="p-5">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">Preview</h2>
        <div className="prose-editor text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: campaign.body_html }} />
      </Card>

      {isProcessing && (
        <Card className="space-y-3 p-5 border-primary/20 bg-muted/20" aria-live="polite">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h2 className="font-medium flex items-center gap-2">
                <RefreshCw className="size-4 animate-spin text-primary" />
                Delivery queue processing
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {rows.length === 0
                  ? "Preparing recipient queue…"
                  : `${completed} of ${rows.length} processed · ${delivered} sent · ${sending + queued} pending${failed ? ` · ${failed} failed` : ""}`}
              </p>
            </div>
            <span className="text-sm font-medium tabular-nums">{progress}%</span>
          </div>
          <Progress value={progress} aria-label={`Campaign send progress: ${progress}%`} />
          <p className="text-xs text-muted-foreground">This view refreshes automatically while delivery runs in the background queue.</p>
        </Card>
      )}

      <Card className="overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-5 py-3 font-medium">Recipient</th>
              <th className="px-5 py-3 font-medium">Delivery</th>
              <th className="px-5 py-3 font-medium">Sent</th>
              <th className="px-5 py-3 font-medium">Opened</th>
              <th className="px-5 py-3 font-medium">Clicked</th>
              <th className="px-5 py-3 font-medium">Failure reason</th>
              <th className="px-5 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={7} className="px-5 py-10 text-center text-muted-foreground">Nothing sent yet.</td></tr>
            )}
            {rows.map((send) => (
              <tr key={send.id} className="border-b border-border last:border-0">
                <td className="px-5 py-3 font-medium">{leadById.get(send.lead_id)?.email ?? "Unknown"}</td>
                <td className="px-5 py-3"><SendStatusBadge send={send} /></td>
                <td className="px-5 py-3 text-muted-foreground">{send.sent_at ? new Date(send.sent_at).toLocaleString() : "—"}</td>
                <td className="px-5 py-3 text-muted-foreground">{send.opened_at ? new Date(send.opened_at).toLocaleString() : "—"}</td>
                <td className="px-5 py-3 text-muted-foreground">{send.clicked_at ? new Date(send.clicked_at).toLocaleString() : "—"}</td>
                <td className="max-w-64 px-5 py-3 text-muted-foreground font-mono text-xs">{send.failure_reason ?? "—"}</td>
                <td className="px-5 py-3 text-right">
                  {send.status === "failed" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 text-xs"
                      onClick={() => retrySingleMutation.mutate(send.id)}
                      disabled={retrySingleMutation.isPending}
                    >
                      <RefreshCw className={`size-3.5 ${retrySingleMutation.isPending ? "animate-spin" : ""}`} />
                      Retry
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function SendStatusBadge({ send }: { send: Send }) {
  if (send.status === "failed") return <Badge variant="destructive">Failed (Attempt {send.attempt_count})</Badge>;
  if (send.status === "sending") return <Badge variant="secondary">Sending (Attempt {send.attempt_count})</Badge>;
  if (send.status === "skipped") return <Badge variant="outline" className="text-muted-foreground">Skipped</Badge>;
  if (send.status === "sent") return <Badge className="bg-emerald-600 hover:bg-emerald-700"><CheckCircle2 className="size-3 mr-1 inline" /> Sent</Badge>;
  return <Badge variant="outline">Queued</Badge>;
}
