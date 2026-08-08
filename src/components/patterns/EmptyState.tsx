import type { ElementType, ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  icon?: ElementType;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick?: () => void;
    to?: string;
    icon?: ElementType;
  };
  secondaryAction?: {
    label: string;
    onClick?: () => void;
    to?: string;
  };
  children?: ReactNode;
  className?: string;
}

export function EmptyState({
  icon: Icon = FolderOpen,
  title,
  description,
  action,
  secondaryAction,
  children,
  className,
}: EmptyStateProps) {
  const ActionIcon = action?.icon;

  return (
    <div
      className={cn(
        "glass-panel flex flex-col items-center justify-center rounded-xl p-8 sm:p-12 text-center border-dashed border-border/80",
        className
      )}
    >
      <div className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary border border-primary/20 shadow-xs mb-4">
        <Icon className="size-7" />
      </div>

      <h3 className="font-heading text-lg font-bold tracking-tight text-foreground sm:text-xl">
        {title}
      </h3>
      <p className="mt-1.5 text-sm text-muted-foreground max-w-md mx-auto">
        {description}
      </p>

      {children}

      {(action || secondaryAction) && (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {action && action.to ? (
            <Button asChild size="sm" className="gap-2 shadow-xs">
              <Link to={action.to}>
                {ActionIcon && <ActionIcon className="size-4" />}
                {action.label}
              </Link>
            </Button>
          ) : action ? (
            <Button
              size="sm"
              onClick={action.onClick}
              className="gap-2 shadow-xs"
            >
              {ActionIcon && <ActionIcon className="size-4" />}
              {action.label}
            </Button>
          ) : null}

          {secondaryAction && secondaryAction.to ? (
            <Button asChild variant="outline" size="sm">
              <Link to={secondaryAction.to}>{secondaryAction.label}</Link>
            </Button>
          ) : secondaryAction ? (
            <Button variant="outline" size="sm" onClick={secondaryAction.onClick}>
              {secondaryAction.label}
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}
