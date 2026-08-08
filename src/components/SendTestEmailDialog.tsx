import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Send,
  Loader2,
  MailCheck,
  Eye,
  MousePointerClick,
  CheckCircle2,
  Clock,
  Sparkles,
  ShieldCheck,
  ShieldAlert,
  AlertCircle,
  ExternalLink,
  AtSign,
} from "lucide-react";
import { sendTestEmail } from "@/lib/campaigns.functions";
import { sendsQuery } from "@/lib/data";
import { getSettings } from "@/lib/settings.functions";
import { validateSenderAddress } from "@/lib/sender";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type SendTestEmailDialogProps = {
  campaignId: string;
  campaignSubject: string;
  trigger?: React.ReactNode;
  senderVerified?: boolean;
};

interface TestResultState {
  success: boolean;
  sendId: string;
  recipientEmail: string;
  fromAddress: string;
  status: "sent" | "failed";
  failureReason: string | null;
  providerMessageId: string | null;
  pixelUrl: string;
  clickUrl: string;
}

export function SendTestEmailDialog({
  campaignId,
  campaignSubject,
  trigger,
  senderVerified: propSenderVerified,
}: SendTestEmailDialogProps) {
  const [open, setOpen] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [activeSendId, setActiveSendId] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<TestResultState | null>(null);

  const qc = useQueryClient();
  const executeSendTest = useServerFn(sendTestEmail);

  // Fetch settings for sender address & default email
  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: () => getSettings(),
  });

  const fromAddress = (settings?.from_address ?? "").trim();
  const senderValidation = validateSenderAddress(fromAddress, settings?.sender_domain);
  const isVerified =
    propSenderVerified !== undefined ? propSenderVerified : senderValidation.isValid;

  // Query sends to monitor real-time open and click tracking on the test email
  const { data: sends = [] } = useQuery({
    ...sendsQuery,
    enabled: Boolean(activeSendId) && open,
    refetchInterval: activeSendId ? 1000 : false, // poll every 1s for instant tracking update
  });

  const testSendRecord = sends.find((s) => s.id === activeSendId);

  const testMutation = useMutation({
    mutationFn: async () => {
      const emailToSend = testEmail.trim() || settings?.support_email || "test@example.com";
      const result = await executeSendTest({
        data: { campaignId, testEmail: emailToSend },
      });
      return result;
    },
    onSuccess: (result) => {
      setActiveSendId(result.sendId);
      setLastResult(result as TestResultState);
      qc.invalidateQueries({ queryKey: ["sends"] });
      qc.invalidateQueries({ queryKey: ["events"] });

      if (result.success) {
        toast.success(`Test email delivered to ${result.recipientEmail}`);
      } else {
        toast.error(result.failureReason || "Test email delivery failed");
      }
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to send test email");
    },
  });

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen && !testEmail && settings?.support_email) {
      setTestEmail(settings.support_email);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm">
            <Send className="size-4 mr-1.5" />
            Send test email
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-5 text-primary" />
            Send Test Email
          </DialogTitle>
          <DialogDescription>
            Verify delivery, open tracking pixel, and click tracking links for "{campaignSubject}".
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Configured Sender Address Display */}
          <div className="rounded-md border bg-muted/40 p-3 text-xs space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-muted-foreground uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                <AtSign className="size-3.5" /> Configured Sender Address
              </span>
              {isVerified ? (
                <Badge className="bg-emerald-600 text-white text-[10px]">
                  <ShieldCheck className="size-3 mr-1 inline" /> Verified
                </Badge>
              ) : (
                <Badge variant="destructive" className="text-[10px]">
                  <ShieldAlert className="size-3 mr-1 inline" /> Unverified
                </Badge>
              )}
            </div>
            <p className="font-mono font-medium text-sm">
              {fromAddress || "(No sender address configured)"}
            </p>
            {!isVerified && (
              <p className="text-amber-600 font-medium pt-0.5">
                {senderValidation.message ||
                  "Sending stays disabled until a verified sender address is set in Settings."}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="testEmailAddress">Recipient Test Email Address</Label>
            <Input
              id="testEmailAddress"
              type="email"
              placeholder={settings?.support_email || "your-email@example.com"}
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              We'll send a live test message from{" "}
              <code className="font-mono font-semibold">{fromAddress || "your domain"}</code> with
              embedded open tracking pixel and click tracking links.
            </p>
          </div>

          <Button
            className="w-full"
            disabled={testMutation.isPending || !isVerified}
            onClick={() => testMutation.mutate()}
          >
            {testMutation.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin mr-2" />
                Sending test email via Resend…
              </>
            ) : (
              <>
                <Send className="size-4 mr-2" />
                Send Test Email Now
              </>
            )}
          </Button>

          {/* Immediate Delivery Result & Tracking Status Monitor */}
          {(lastResult || activeSendId) && (
            <Card className="space-y-3 p-4 bg-muted/30 border-primary/30">
              <div className="flex items-center justify-between border-b pb-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Delivery Result & Tracking Status
                </h4>
                {activeSendId && (
                  <Badge variant="outline" className="text-[10px] bg-background font-mono">
                    ID: {activeSendId.slice(0, 8)}
                  </Badge>
                )}
              </div>

              {/* Immediate Delivery Status */}
              <div className="space-y-2 text-xs">
                {lastResult?.status === "sent" || testSendRecord?.status === "sent" ? (
                  <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-emerald-800 flex items-center gap-1.5">
                        <MailCheck className="size-4 text-emerald-600" /> Immediate Delivery Result:
                        SENT
                      </span>
                      <Badge className="bg-emerald-600 text-white">Delivered</Badge>
                    </div>
                    <p className="text-emerald-900 text-[11px]">
                      Sent to <strong>{lastResult?.recipientEmail || testEmail}</strong> from{" "}
                      <strong>{fromAddress}</strong>.
                    </p>
                    {lastResult?.providerMessageId && (
                      <p className="text-[11px] font-mono text-emerald-700">
                        Provider Message ID: {lastResult.providerMessageId}
                      </p>
                    )}
                  </div>
                ) : lastResult?.status === "failed" || testSendRecord?.status === "failed" ? (
                  <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 space-y-1 text-destructive">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold flex items-center gap-1.5">
                        <AlertCircle className="size-4" /> Immediate Delivery Result: FAILED
                      </span>
                      <Badge variant="destructive">Failed</Badge>
                    </div>
                    <p className="font-mono text-[11px] pt-1 leading-relaxed bg-background/80 p-2 rounded border border-destructive/20">
                      {lastResult?.failureReason ||
                        testSendRecord?.failure_reason ||
                        "Resend API call failed"}
                    </p>
                    {((lastResult?.failureReason || testSendRecord?.failure_reason) ?? "").includes(
                      "403",
                    ) && (
                      <p className="text-[11px] text-amber-700 dark:text-amber-400 font-medium pt-1">
                        Domain Verification Required: Make sure your Sender Address domain is added
                        & verified in your Resend Dashboard.
                      </p>
                    )}
                  </div>
                ) : null}

                {/* Real-time Tracking Pixel & Link Verification */}
                <div className="space-y-2 pt-1">
                  <h5 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                    Live Tracking Pixel & Link Monitor
                  </h5>

                  {/* Open Tracking */}
                  <div className="flex items-center justify-between p-2.5 rounded-md bg-background border">
                    <div className="flex items-center gap-2">
                      <Eye
                        className={`size-4 ${testSendRecord?.opened_at ? "text-purple-600" : "text-muted-foreground"}`}
                      />
                      <div>
                        <span className="font-medium block">Open Tracking Pixel</span>
                        <span className="text-[10px] text-muted-foreground">
                          Monitors when recipient opens email
                        </span>
                      </div>
                    </div>
                    {testSendRecord?.opened_at ? (
                      <span className="flex items-center gap-1 font-semibold text-purple-600">
                        <CheckCircle2 className="size-3.5" />
                        Opened {new Date(testSendRecord.opened_at).toLocaleTimeString()}
                      </span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="flex items-center gap-1 text-muted-foreground text-[11px]">
                          <Clock className="size-3.5 animate-pulse" />
                          Waiting…
                        </span>
                        {lastResult?.pixelUrl && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 text-[10px] px-2 border"
                            onClick={() => {
                              const img = new Image();
                              img.src = `${lastResult.pixelUrl}&t=${Date.now()}`;
                              toast.info("Simulated email open tracking pixel request");
                            }}
                          >
                            Simulate Open
                          </Button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Click Tracking */}
                  <div className="flex items-center justify-between p-2.5 rounded-md bg-background border">
                    <div className="flex items-center gap-2">
                      <MousePointerClick
                        className={`size-4 ${testSendRecord?.clicked_at ? "text-amber-600" : "text-muted-foreground"}`}
                      />
                      <div>
                        <span className="font-medium block">Click Tracking Link</span>
                        <span className="text-[10px] text-muted-foreground">
                          Monitors when recipient clicks offer link
                        </span>
                      </div>
                    </div>
                    {testSendRecord?.clicked_at ? (
                      <span className="flex items-center gap-1 font-semibold text-amber-600">
                        <CheckCircle2 className="size-3.5" />
                        Clicked {new Date(testSendRecord.clicked_at).toLocaleTimeString()}
                      </span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="flex items-center gap-1 text-muted-foreground text-[11px]">
                          <Clock className="size-3.5 animate-pulse" />
                          Waiting…
                        </span>
                        {lastResult?.clickUrl && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 text-[10px] px-2 border"
                            onClick={() => {
                              window.open(lastResult.clickUrl, "_blank");
                            }}
                          >
                            <ExternalLink className="size-3 mr-1" />
                            Test Link Click
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
