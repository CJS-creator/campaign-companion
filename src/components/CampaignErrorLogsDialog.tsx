import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertCircle, RefreshCw, Settings, ShieldAlert, ArrowRight } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { retryFailedSends } from "@/lib/campaigns.functions";
import type { Send } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type CampaignErrorLogsDialogProps = {
  campaignId: string;
  campaignSubject: string;
  failedSends: Send[];
  trigger?: React.ReactNode;
};

export function CampaignErrorLogsDialog({
  campaignId,
  campaignSubject,
  failedSends,
  trigger,
}: CampaignErrorLogsDialogProps) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const executeRetry = useServerFn(retryFailedSends);

  const retryMutation = useMutation({
    mutationFn: async () => {
      return executeRetry({ data: { campaignId } });
    },
    onSuccess: () => {
      toast.success("Queued failed sends for delivery retry!");
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["sends"] });
      setOpen(false);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to retry sends");
    },
  });

  const failureReasons = Array.from(
    new Set(failedSends.map((s) => s.failure_reason).filter(Boolean)),
  ) as string[];

  const has403Error = failureReasons.some(
    (reason) =>
      reason.includes("403") ||
      reason.toLowerCase().includes("forbidden") ||
      reason.toLowerCase().includes("domain"),
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs border-destructive/40 text-destructive bg-destructive/5 hover:bg-destructive/10"
          >
            <AlertCircle className="size-3.5 mr-1 shrink-0" />
            {failedSends.length} Delivery {failedSends.length === 1 ? "Error" : "Errors"}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertCircle className="size-5" />
            Failed Send Error Details — {campaignSubject}
          </DialogTitle>
          <DialogDescription>
            Detailed error logs and response diagnostic details for {failedSends.length} failed
            delivery attempt(s).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 overflow-y-auto flex-1 pr-1">
          {/* Troubleshooting Alert Banner */}
          {has403Error && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3.5 text-xs text-amber-900 space-y-1.5">
              <div className="flex items-center gap-2 font-semibold text-amber-950">
                <ShieldAlert className="size-4 text-amber-600 shrink-0" />
                Resend Sender Domain Validation Error (403 Forbidden)
              </div>
              <p className="leading-relaxed">
                Resend rejected delivery because the configured Sender Address is on an unverified
                domain or the API key does not match the sender domain.
              </p>
              <div className="pt-1 flex items-center gap-2">
                <Button
                  asChild
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs border-amber-500/40 text-amber-900 bg-background hover:bg-amber-100"
                >
                  <Link to="/settings">
                    <Settings className="size-3.5 mr-1" /> Update Settings
                  </Link>
                </Button>
              </div>
            </div>
          )}

          {/* Grouped Unique Failure Reasons */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Error Summary ({failureReasons.length} distinct reason
              {failureReasons.length === 1 ? "" : "s"})
            </h4>
            {failureReasons.map((reason, index) => (
              <Card
                key={index}
                className="p-3 bg-destructive/5 border-destructive/20 space-y-1 text-xs"
              >
                <div className="font-semibold text-destructive flex items-center gap-1.5">
                  <AlertCircle className="size-3.5 shrink-0" /> Error Pattern #{index + 1}
                </div>
                <p className="font-mono text-[11px] bg-background/80 p-2 rounded border border-destructive/20 leading-relaxed text-destructive-foreground break-all">
                  {reason}
                </p>
              </Card>
            ))}
          </div>

          {/* Individual Recipient Failure Log */}
          <div className="space-y-2 pt-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Recipient Error Logs ({failedSends.length})
            </h4>
            <Card className="overflow-hidden p-0 border">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 text-left border-b font-medium text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Lead ID / Recipient</th>
                    <th className="px-3 py-2">Attempts</th>
                    <th className="px-3 py-2">Last Attempt</th>
                    <th className="px-3 py-2">Detailed Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {failedSends.map((send) => (
                    <tr key={send.id} className="hover:bg-muted/20">
                      <td className="px-3 py-2 font-mono text-[11px]">
                        {send.lead_id.slice(0, 8)}…
                      </td>
                      <td className="px-3 py-2">
                        <Badge
                          variant="outline"
                          className="text-[10px] bg-destructive/10 text-destructive border-destructive/30"
                        >
                          {send.attempt_count} attempt{send.attempt_count === 1 ? "" : "s"}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {send.last_attempt_at
                          ? new Date(send.last_attempt_at).toLocaleTimeString()
                          : "—"}
                      </td>
                      <td className="px-3 py-2 font-mono text-[11px] text-destructive max-w-xs truncate">
                        {send.failure_reason || "Unknown error"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>
        </div>

        <div className="flex items-center justify-between pt-3 border-t">
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
            Close
          </Button>
          <div className="flex gap-2">
            <Button asChild size="sm" variant="outline">
              <Link to="/campaigns/$id" params={{ id: campaignId }}>
                View Full Details <ArrowRight className="size-3.5 ml-1" />
              </Link>
            </Button>
            <Button
              size="sm"
              disabled={retryMutation.isPending}
              onClick={() => retryMutation.mutate()}
            >
              <RefreshCw
                className={`size-3.5 mr-1.5 ${retryMutation.isPending ? "animate-spin" : ""}`}
              />
              Retry {failedSends.length} Failed Send{failedSends.length === 1 ? "" : "s"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
