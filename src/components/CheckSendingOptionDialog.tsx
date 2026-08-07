import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Wrench, RefreshCw, AlertCircle, CheckCircle2, Mail, ShieldAlert, Zap, Play, OctagonX } from "lucide-react";
import { checkAndRepairQueue, retryFailedSends, stopCampaignSending } from "@/lib/campaigns.functions";
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

type CheckSendingOptionDialogProps = {
  campaignId?: string;
  trigger?: React.ReactNode;
};

export function CheckSendingOptionDialog({ campaignId, trigger }: CheckSendingOptionDialogProps) {
  const [open, setOpen] = useState(false);
  const [report, setReport] = useState<{
    apiKeyConfigured: boolean;
    resetStuckCount: number;
    queuedCount: number;
    sendingCount: number;
    sentCount: number;
    failedCount: number;
    message: string;
  } | null>(null);

  const queryClient = useQueryClient();
  const executeCheckAndRepair = useServerFn(checkAndRepairQueue);
  const executeRetryFailed = useServerFn(retryFailedSends);
  const executeStopSending = useServerFn(stopCampaignSending);

  const checkMutation = useMutation({
    mutationFn: async () => {
      const result = await executeCheckAndRepair({ data: { campaignId } });
      return result;
    },
    onSuccess: (result) => {
      setReport(result);
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["sends"] });
      queryClient.invalidateQueries({ queryKey: ["diagnostics"] });
      if (result.resetStuckCount > 0) {
        toast.success(`Recovered ${result.resetStuckCount} stuck send(s) and restarted worker!`);
      } else {
        toast.info(result.message);
      }
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Queue diagnostic check failed");
    },
  });

  const stopMutation = useMutation({
    mutationFn: async () => {
      if (!campaignId) throw new Error("No campaign selected to stop");
      return executeStopSending({ data: { campaignId } });
    },
    onSuccess: (res) => {
      toast.success(`Campaign queue stopped! Skipped ${res.skippedCount} unsent emails.`);
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["sends"] });
      checkMutation.mutate();
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to stop campaign sending");
    },
  });

  const retryMutation = useMutation({
    mutationFn: async () => {
      if (!campaignId) throw new Error("Select a campaign to retry failed sends");
      return executeRetryFailed({ data: { campaignId } });
    },
    onSuccess: () => {
      toast.success("Queued failed sends for delivery retry!");
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["sends"] });
      checkMutation.mutate();
    },
  });

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen) {
      checkMutation.mutate();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm">
            <Wrench className="size-4 mr-1.5 text-amber-500" />
            Check Sending Options
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="size-5 text-amber-500" />
            Sending Options & Queue Diagnostics
          </DialogTitle>
          <DialogDescription>
            Inspect deliverability options, detect stuck worker loops, and repair queued emails.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {checkMutation.isPending && !report ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground gap-2">
              <RefreshCw className="size-6 animate-spin text-primary" />
              <p className="text-sm">Inspecting delivery queue & resetting stuck worker locks…</p>
            </div>
          ) : report ? (
            <div className="space-y-4">
              {/* API Key Status Notice */}
              {!report.apiKeyConfigured && (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs flex items-start gap-2.5">
                  <ShieldAlert className="size-4 text-destructive shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-destructive">RESEND_API_KEY Missing!</span>
                    <p className="mt-0.5 text-muted-foreground">
                      Emails will remain in queued status because the Resend API key environment variable is not configured.
                    </p>
                  </div>
                </div>
              )}

              {/* Reset Stuck Notice */}
              {report.resetStuckCount > 0 && (
                <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs flex items-start gap-2.5">
                  <CheckCircle2 className="size-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-emerald-700">Queue Loop Repaired!</span>
                    <p className="mt-0.5 text-emerald-800">
                      Found {report.resetStuckCount} send(s) locked in sending status. Automatically reset them to queued and restarted the delivery worker.
                    </p>
                  </div>
                </div>
              )}

              {/* Delivery Queue Stats Grid */}
              <div className="grid gap-3 sm:grid-cols-2">
                <Card className="p-3 space-y-1">
                  <div className="text-xs text-muted-foreground flex items-center justify-between">
                    <span>Queued Emails</span>
                    <Mail className="size-3.5 text-blue-500" />
                  </div>
                  <div className="text-xl font-bold">{report.queuedCount}</div>
                  <p className="text-[11px] text-muted-foreground">Waiting for worker delivery</p>
                </Card>

                <Card className="p-3 space-y-1">
                  <div className="text-xs text-muted-foreground flex items-center justify-between">
                    <span>In-Flight Sending</span>
                    <Zap className="size-3.5 text-amber-500" />
                  </div>
                  <div className="text-xl font-bold">{report.sendingCount}</div>
                  <p className="text-[11px] text-muted-foreground">Currently processing batch</p>
                </Card>

                <Card className="p-3 space-y-1">
                  <div className="text-xs text-muted-foreground flex items-center justify-between">
                    <span>Delivered (Sent)</span>
                    <CheckCircle2 className="size-3.5 text-emerald-500" />
                  </div>
                  <div className="text-xl font-bold text-emerald-600">{report.sentCount}</div>
                  <p className="text-[11px] text-muted-foreground">Successfully sent</p>
                </Card>

                <Card className="p-3 space-y-1">
                  <div className="text-xs text-muted-foreground flex items-center justify-between">
                    <span>Failed / Errored</span>
                    <AlertCircle className="size-3.5 text-destructive" />
                  </div>
                  <div className="text-xl font-bold text-destructive">{report.failedCount}</div>
                  <p className="text-[11px] text-muted-foreground">Delivery failed</p>
                </Card>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap gap-2 pt-2">
                <Button
                  className="flex-1"
                  disabled={checkMutation.isPending}
                  onClick={() => checkMutation.mutate()}
                >
                  <RefreshCw className={`size-4 mr-1.5 ${checkMutation.isPending ? "animate-spin" : ""}`} />
                  Repair & Restart Worker
                </Button>

                {campaignId && (report.queuedCount > 0 || report.sendingCount > 0) && (
                  <Button
                    variant="destructive"
                    disabled={stopMutation.isPending}
                    onClick={() => stopMutation.mutate()}
                  >
                    <OctagonX className="size-4 mr-1.5" />
                    Stop Sending Queue
                  </Button>
                )}

                {campaignId && report.failedCount > 0 && (
                  <Button
                    variant="outline"
                    className="border-destructive/30 text-destructive"
                    disabled={retryMutation.isPending}
                    onClick={() => retryMutation.mutate()}
                  >
                    <Play className="size-4 mr-1.5" />
                    Retry {report.failedCount} Failed
                  </Button>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
