import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Send, Loader2, MailCheck, Eye, MousePointerClick, CheckCircle2, Clock, Sparkles } from "lucide-react";
import { sendTestEmail } from "@/lib/campaigns.functions";
import { sendsQuery } from "@/lib/data";
import { getSettings } from "@/lib/settings.functions";
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
};

export function SendTestEmailDialog({ campaignId, campaignSubject, trigger }: SendTestEmailDialogProps) {
  const [open, setOpen] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [activeSendId, setActiveSendId] = useState<string | null>(null);
  const qc = useQueryClient();
  const executeSendTest = useServerFn(sendTestEmail);

  // Fetch settings for default email
  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: () => getSettings(),
  });

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
      toast.success(`Test email sent to ${result.recipientEmail}`);
      qc.invalidateQueries({ queryKey: ["sends"] });
      qc.invalidateQueries({ queryKey: ["events"] });
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
      <DialogContent className="max-w-md">
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
          <div className="space-y-1.5">
            <Label htmlFor="testEmailAddress">Recipient Email Address</Label>
            <Input
              id="testEmailAddress"
              type="email"
              placeholder={settings?.support_email || "your-email@example.com"}
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              We'll send a live test message with embedded tracking pixel and link wrappers.
            </p>
          </div>

          <Button
            className="w-full"
            disabled={testMutation.isPending}
            onClick={() => testMutation.mutate()}
          >
            {testMutation.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin mr-2" />
                Sending test email…
              </>
            ) : (
              <>
                <Send className="size-4 mr-2" />
                Send Test Email Now
              </>
            )}
          </Button>

          {/* Real-time Tracking Monitor Card */}
          {activeSendId && (
            <Card className="space-y-3 p-4 bg-muted/40 border-primary/30">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Live Tracking Verification
                </h4>
                <Badge variant="outline" className="text-[10px] bg-background">
                  ID: {activeSendId.slice(0, 8)}
                </Badge>
              </div>

              <div className="space-y-2.5 text-xs">
                {/* Delivery */}
                <div className="flex items-center justify-between p-2 rounded bg-background border">
                  <div className="flex items-center gap-2">
                    <MailCheck className="size-4 text-emerald-600" />
                    <span className="font-medium">Email Delivery</span>
                  </div>
                  <Badge className="bg-emerald-600 text-white">Sent</Badge>
                </div>

                {/* Open Tracking */}
                <div className="flex items-center justify-between p-2 rounded bg-background border">
                  <div className="flex items-center gap-2">
                    <Eye className={`size-4 ${testSendRecord?.opened_at ? "text-purple-600" : "text-muted-foreground"}`} />
                    <span className="font-medium">Open Tracking Pixel</span>
                  </div>
                  {testSendRecord?.opened_at ? (
                    <span className="flex items-center gap-1 font-semibold text-purple-600">
                      <CheckCircle2 className="size-3.5" />
                      Opened {new Date(testSendRecord.opened_at).toLocaleTimeString()}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <Clock className="size-3.5 animate-pulse" />
                      Waiting for open…
                    </span>
                  )}
                </div>

                {/* Click Tracking */}
                <div className="flex items-center justify-between p-2 rounded bg-background border">
                  <div className="flex items-center gap-2">
                    <MousePointerClick className={`size-4 ${testSendRecord?.clicked_at ? "text-amber-600" : "text-muted-foreground"}`} />
                    <span className="font-medium">Click Tracking Link</span>
                  </div>
                  {testSendRecord?.clicked_at ? (
                    <span className="flex items-center gap-1 font-semibold text-amber-600">
                      <CheckCircle2 className="size-3.5" />
                      Clicked {new Date(testSendRecord.clicked_at).toLocaleTimeString()}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <Clock className="size-3.5 animate-pulse" />
                      Waiting for click…
                    </span>
                  )}
                </div>
              </div>
            </Card>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
