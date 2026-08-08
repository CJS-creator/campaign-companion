import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { MessageSquare, Send, Loader2, MailCheck, ShieldCheck } from "lucide-react";
import { submitContactForm } from "@/lib/campaigns.functions";
import { getSettings } from "@/lib/settings.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type ContactFormDialogProps = {
  trigger?: React.ReactNode;
};

export function ContactFormDialog({ trigger }: ContactFormDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  const queryClient = useQueryClient();
  const executeSubmitContact = useServerFn(submitContactForm);

  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: () => getSettings(),
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      const res = await executeSubmitContact({
        data: {
          name: name.trim(),
          email: email.trim(),
          subject: subject.trim(),
          message: message.trim(),
        },
      });
      return res;
    },
    onSuccess: (res) => {
      toast.success(
        `Message sent! Notification dispatched to ${settings?.support_email || "owner"}`,
      );
      setName("");
      setEmail("");
      setSubject("");
      setMessage("");
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["audit-logs"] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to submit message");
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm">
            <MessageSquare className="size-4 mr-1.5 text-primary" />
            Contact Form / Submit Message
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="size-5 text-primary" />
            Submit Contact Message
          </DialogTitle>
          <DialogDescription>
            Send a contact inquiry. A notification email will be dispatched to your support address,
            and an auto-reply sent to the visitor.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitMutation.mutate();
          }}
          className="space-y-4 py-2"
        >
          <div className="space-y-1.5">
            <Label htmlFor="contactName">Your Full Name</Label>
            <Input
              id="contactName"
              placeholder="Sarah Jenkins"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="contactEmail">Your Email Address</Label>
            <Input
              id="contactEmail"
              type="email"
              placeholder="sarah@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="contactSubject">Subject</Label>
            <Input
              id="contactSubject"
              placeholder="Inquiry regarding your services"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="contactMessage">Message Content</Label>
            <Textarea
              id="contactMessage"
              placeholder="Hi team, I would like to learn more about..."
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required
            />
          </div>

          <div className="rounded-md border bg-muted/40 p-3 text-xs space-y-1 text-muted-foreground">
            <div className="flex items-center gap-1.5 font-medium text-foreground">
              <MailCheck className="size-4 text-emerald-600 shrink-0" />
              Notification & Auto-Reply Dispatch
            </div>
            <p>
              Submitting this form triggers a notification email to{" "}
              <strong className="font-mono text-foreground">
                {settings?.support_email || "support@example.com"}
              </strong>{" "}
              and sends an instant confirmation email to the visitor.
            </p>
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={
              submitMutation.isPending ||
              !name.trim() ||
              !email.trim() ||
              !subject.trim() ||
              !message.trim()
            }
          >
            {submitMutation.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin mr-2" />
                Sending notification & auto-reply…
              </>
            ) : (
              <>
                <Send className="size-4 mr-2" />
                Submit Message Now
              </>
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
