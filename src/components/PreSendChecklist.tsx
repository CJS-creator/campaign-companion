import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ShieldCheck,
  Clock,
  Mail,
  Users,
  FileText,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export interface ChecklistItem {
  id: string;
  label: string;
  passed: boolean;
  message: string;
  warning?: boolean;
}

export function PreSendChecklist({
  recipientCount,
  dailyCap,
  monthlyCap,
  senderConfigured,
  senderVerified = false,
  linkVerified,
  hasPlainText,
  hasSubject = true,
  hasBody = true,
  scheduledTime,
}: {
  recipientCount: number;
  dailyCap: number;
  monthlyCap: number;
  senderConfigured: boolean;
  senderVerified?: boolean;
  linkVerified: boolean;
  hasPlainText: boolean;
  hasSubject?: boolean;
  hasBody?: boolean;
  scheduledTime?: string | undefined;
}) {
  const capExceeded = recipientCount > dailyCap;
  const monthlyExceeded = recipientCount > monthlyCap;
  const items: ChecklistItem[] = [
    {
      id: "content",
      label: "Subject & Body",
      passed: hasSubject && hasBody,
      message:
        hasSubject && hasBody
          ? "Subject line and email body present"
          : !hasSubject
            ? "Subject line is required"
            : "Email body is empty",
    },
    {
      id: "recipients",
      label: "Recipient Count & Cap Impact",
      passed: recipientCount > 0 && !capExceeded && !monthlyExceeded,
      message: monthlyExceeded
        ? `Recipient count (${recipientCount}) exceeds monthly cap (${monthlyCap})`
        : capExceeded
          ? `Recipient count (${recipientCount}) exceeds daily cap (${dailyCap})`
          : recipientCount > 0
            ? `${recipientCount} subscribed lead(s) within daily cap (${dailyCap})`
            : "No subscribed leads available to send to",
    },
    {
      id: "senderaddress",
      label: "Verified Sender Address",
      passed: senderVerified,
      message: senderVerified
        ? "Sender address on a verified domain is configured"
        : "No verified sender address set — add one in Settings before sending",
    },
    {
      id: "sender",
      label: "Business Identity for Footer",
      passed: senderConfigured,
      message: senderConfigured
        ? "Registered business name & postal address ready"
        : "Missing business name or postal address in Settings",
    },
    {
      id: "unsubscribe",
      label: "Unsubscribe & Headers",
      passed: senderConfigured,
      message: senderConfigured
        ? "One-click List-Unsubscribe header and footer link are added to every send"
        : "Unsubscribe footer needs a business name and postal address in Settings",
    },
    {
      id: "plaintext",
      label: "Plain-Text Fallback (body_text)",
      passed: hasBody,
      message: hasPlainText
        ? "Custom plain-text fallback present"
        : hasBody
          ? "Plain-text part will be generated from the HTML body"
          : "No body content to generate a plain-text part from",
    },
    {
      id: "linksafety",
      label: "Link Safety Verification",
      passed: linkVerified,
      message: linkVerified
        ? "All URLs inspected & verified safe"
        : "Offer link must be verified before sending",
    },
    {
      id: "schedule",
      label: "Send Time",
      passed: true,
      message: scheduledTime
        ? `Scheduled for ${new Date(scheduledTime).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} (IST)`
        : "Send immediately upon approval",
    },
  ];


  const allPassed = items.every((i) => i.passed);

  return (
    <Card className="p-5 space-y-4 border-primary/20 bg-muted/10">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-base flex items-center gap-2">
          <ShieldCheck className="size-5 text-primary" /> Pre-Send Release Checklist
        </h3>
        <Badge variant={allPassed ? "default" : "destructive"}>
          {allPassed ? "Passed — Ready to Send" : "Checklist Issues Pending"}
        </Badge>
      </div>

      <ul className="space-y-2.5 text-sm">
        {items.map((item) => (
          <li key={item.id} className="flex items-start gap-2.5">
            {item.passed ? (
              <CheckCircle2 className="size-4 text-emerald-600 mt-0.5 shrink-0" />
            ) : item.warning ? (
              <AlertTriangle className="size-4 text-amber-500 mt-0.5 shrink-0" />
            ) : (
              <XCircle className="size-4 text-destructive mt-0.5 shrink-0" />
            )}
            <div>
              <span className="font-medium">{item.label}: </span>
              <span
                className={item.passed ? "text-muted-foreground" : "text-destructive font-medium"}
              >
                {item.message}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
