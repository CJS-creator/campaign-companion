import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ShieldCheck,
} from "lucide-react";
import { StatusBadge } from "@/components/patterns";
import { cn } from "@/lib/utils";

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
  className,
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
  className?: string;
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
      label: "Recipients & Daily/Monthly Cap",
      passed: recipientCount > 0 && !capExceeded && !monthlyExceeded,
      message: monthlyExceeded
        ? `Recipient count (${recipientCount}) exceeds monthly cap (${monthlyCap})`
        : capExceeded
          ? `Recipient count (${recipientCount}) exceeds daily cap (${dailyCap})`
          : recipientCount > 0
            ? `${recipientCount} subscribed lead(s) within caps`
            : "No subscribed leads available to send to",
    },
    {
      id: "senderaddress",
      label: "Verified Sender Address",
      passed: senderVerified,
      message: senderVerified
        ? "Sender address on verified domain ready"
        : "No verified sender address set — add one in Settings",
    },
    {
      id: "sender",
      label: "Business Identity Footer",
      passed: senderConfigured,
      message: senderConfigured
        ? "Business address & footer ready"
        : "Missing business address in Settings",
    },
    {
      id: "unsubscribe",
      label: "One-Click Unsubscribe",
      passed: senderConfigured,
      message: senderConfigured
        ? "RFC 8058 List-Unsubscribe enabled"
        : "Footer requires business address in Settings",
    },
    {
      id: "plaintext",
      label: "Plain-Text Fallback",
      passed: hasBody,
      message: hasPlainText
        ? "Custom plain-text fallback present"
        : hasBody
          ? "Auto-generated fallback active"
          : "No body content for plain-text fallback",
    },
    {
      id: "linksafety",
      label: "Link Safety Verification",
      passed: linkVerified,
      message: linkVerified
        ? "All URLs inspected & safe"
        : "Offer link safety check required",
    },
    {
      id: "schedule",
      label: "Delivery Timing",
      passed: true,
      message: scheduledTime
        ? `Scheduled for ${new Date(scheduledTime).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`
        : "Immediate send upon approval",
    },
  ];

  const allPassed = items.every((i) => i.passed);

  return (
    <div className={cn("glass-panel rounded-xl p-5 border-border/80 space-y-4 shadow-xs", className)}>
      <div className="flex items-center justify-between gap-2 border-b border-border/60 pb-3">
        <h3 className="font-heading font-bold text-sm flex items-center gap-2 text-foreground">
          <ShieldCheck className="size-4.5 text-primary" /> Pre-Send Checklist
        </h3>
        <StatusBadge
          status={allPassed ? "sent" : "bounce"}
          label={allPassed ? "Ready to Send" : "Issues Pending"}
        />
      </div>

      <ul className="space-y-3 text-xs">
        {items.map((item) => (
          <li key={item.id} className="flex items-start gap-2.5">
            {item.passed ? (
              <CheckCircle2 className="size-4 text-success mt-0.5 shrink-0" />
            ) : item.warning ? (
              <AlertTriangle className="size-4 text-warning mt-0.5 shrink-0" />
            ) : (
              <XCircle className="size-4 text-destructive mt-0.5 shrink-0" />
            )}
            <div className="space-y-0.5">
              <span className="font-semibold text-foreground">{item.label}</span>
              <p
                className={cn(
                  "text-[11px] leading-tight",
                  item.passed ? "text-muted-foreground" : "text-destructive font-medium"
                )}
              >
                {item.message}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
