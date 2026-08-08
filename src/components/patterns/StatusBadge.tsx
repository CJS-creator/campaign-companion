import { cn } from "@/lib/utils";

export type StatusVariant =
  | "draft"
  | "scheduled"
  | "sending"
  | "sent"
  | "failed"
  | "active"
  | "suppressed"
  | "delivered"
  | "bounce"
  | "complaint"
  | "open"
  | "click"
  | "warning"
  | "info";

export interface StatusBadgeProps {
  status: StatusVariant | string;
  label?: string;
  className?: string;
  showDot?: boolean;
}

export function StatusBadge({
  status,
  label,
  className,
  showDot = true,
}: StatusBadgeProps) {
  const normalized = status.toLowerCase();

  let styles = "bg-muted/80 text-muted-foreground border-border";
  let dotColor = "bg-muted-foreground";
  let displayLabel = label || status;

  switch (normalized) {
    case "sent":
    case "delivered":
    case "active":
    case "success":
      styles = "bg-success/15 text-success border-success/30 font-semibold";
      dotColor = "bg-success";
      if (!label) displayLabel = normalized === "sent" ? "Sent" : normalized === "delivered" ? "Delivered" : "Active";
      break;
    case "sending":
      styles = "bg-primary/15 text-primary border-primary/30 font-semibold animate-pulse";
      dotColor = "bg-primary animate-ping";
      if (!label) displayLabel = "Sending...";
      break;
    case "scheduled":
    case "info":
    case "open":
    case "click":
      styles = "bg-info/15 text-info border-info/30 font-semibold";
      dotColor = "bg-info";
      if (!label) displayLabel = normalized.charAt(0).toUpperCase() + normalized.slice(1);
      break;
    case "warning":
    case "complaint":
      styles = "bg-warning/20 text-warning-foreground border-warning/40 font-semibold dark:bg-warning/25";
      dotColor = "bg-warning";
      if (!label) displayLabel = normalized === "complaint" ? "Complaint" : "Warning";
      break;
    case "failed":
    case "bounce":
    case "suppressed":
    case "error":
      styles = "bg-destructive/15 text-destructive border-destructive/30 font-semibold";
      dotColor = "bg-destructive";
      if (!label) displayLabel = normalized.charAt(0).toUpperCase() + normalized.slice(1);
      break;
    case "draft":
    default:
      styles = "bg-muted/80 text-muted-foreground border-border/80 font-medium";
      dotColor = "bg-muted-foreground/60";
      if (!label) displayLabel = normalized.charAt(0).toUpperCase() + normalized.slice(1);
      break;
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs transition-colors",
        styles,
        className
      )}
    >
      {showDot && (
        <span className={cn("size-1.5 rounded-full shrink-0", dotColor)} />
      )}
      <span>{displayLabel}</span>
    </span>
  );
}
