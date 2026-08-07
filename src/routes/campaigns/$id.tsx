import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, RefreshCw, AlertCircle, CheckCircle2, Copy } from "lucide-react";
import { campaignQuery, leadsQuery, sendsQuery, type Send } from "@/lib/data";
import { retryFailedSends, retrySingleSend } from "@/lib/campaigns.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";

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

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2">
            <Link to="/"><ArrowLeft className="size-4" /> Dashboard</Link>
          </Button>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">{campaign.subject}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <Badge variant={campaign.status === "sent" ? "default" : isProcessing ? "secondary" : "outline"}>
              {campaign.status}
            </Badge>
            {campaign.sent_at && <span>Completed {new Date(campaign.sent_at).toLocaleString()}</span>}
            {failed > 0 && (
              <span className="flex items-center gap-1 text-destructive text-xs font-medium">
                <AlertCircle className="size-3.5" /> {failed} send{failed === 1 ? "" : "s"} failed
              </span>
            )}
          </div>
        </div>

        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link to="/campaigns/new" search={{ clone: campaign.id }}>
              <Copy className="size-4" /> Duplicate campaign
            </Link>
          </Button>
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
  if (send.status === "sent") return <Badge className="bg-emerald-600 hover:bg-emerald-700"><CheckCircle2 className="size-3 mr-1 inline" /> Sent</Badge>;
  return <Badge variant="outline">Queued</Badge>;
}

