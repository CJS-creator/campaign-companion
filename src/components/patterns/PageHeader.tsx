import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PageHeaderProps {
  title: string;
  description?: string;
  badge?: {
    label: string;
    variant?: "default" | "success" | "warning" | "info" | "outline";
  };
  actions?: ReactNode;
  backLink?: {
    to: string;
    label: string;
  };
  className?: string;
}

export function PageHeader({
  title,
  description,
  badge,
  actions,
  backLink,
  className,
}: PageHeaderProps) {
  const badgeStyles = {
    default: "bg-primary/10 text-primary border-primary/20",
    success: "bg-success/10 text-success border-success/20",
    warning: "bg-warning/10 text-warning border-warning/20",
    info: "bg-info/10 text-info border-info/20",
    outline: "bg-background text-muted-foreground border-border",
  };

  return (
    <div
      className={cn(
        "mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border/60 pb-5",
        className
      )}
    >
      <div className="space-y-1">
        {backLink && (
          <Link
            to={backLink.to}
            className="mb-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            {backLink.label}
          </Link>
        )}
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {title}
          </h1>
          {badge && (
            <span
              className={cn(
                "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors",
                badgeStyles[badge.variant || "default"]
              )}
            >
              {badge.label}
            </span>
          )}
        </div>
        {description && (
          <p className="text-sm text-muted-foreground max-w-2xl">
            {description}
          </p>
        )}
      </div>

      {actions && (
        <div className="flex items-center gap-2.5 shrink-0 sm:self-end">
          {actions}
        </div>
      )}
    </div>
  );
}
