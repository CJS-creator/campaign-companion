import type { ReactNode, ElementType } from "react";
import { ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

export interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  change?: {
    value: string | number;
    trend: "up" | "down" | "neutral";
    label?: string;
  };
  icon?: ElementType;
  badge?: ReactNode;
  sparklineData?: number[];
  className?: string;
  onClick?: () => void;
}

export function StatCard({
  title,
  value,
  subtitle,
  change,
  icon: Icon,
  badge,
  sparklineData,
  className,
  onClick,
}: StatCardProps) {
  const trendConfig = {
    up: {
      icon: ArrowUpRight,
      color: "text-success bg-success/10 border-success/20",
    },
    down: {
      icon: ArrowDownRight,
      color: "text-destructive bg-destructive/10 border-destructive/20",
    },
    neutral: {
      icon: Minus,
      color: "text-muted-foreground bg-muted border-border",
    },
  };

  const TrendIcon = change ? trendConfig[change.trend].icon : null;

  return (
    <div
      onClick={onClick}
      className={cn(
        "glass-panel relative overflow-hidden rounded-xl p-5 transition-all duration-200 hover:shadow-md hover:border-border/80",
        onClick && "cursor-pointer active:scale-[0.99]",
        className
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {title}
          </p>
          <h3 className="font-heading text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {value}
          </h3>
        </div>

        {Icon && (
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/20 shrink-0">
            <Icon className="size-5" />
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between gap-2 flex-wrap text-xs">
        {change && TrendIcon && (
          <div
            className={cn(
              "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-medium",
              trendConfig[change.trend].color
            )}
          >
            <TrendIcon className="size-3.5" />
            <span>{change.value}</span>
            {change.label && (
              <span className="text-muted-foreground ml-0.5">{change.label}</span>
            )}
          </div>
        )}

        {subtitle && !change && (
          <span className="text-muted-foreground">{subtitle}</span>
        )}

        {badge}
      </div>

      {sparklineData && sparklineData.length > 1 && (
        <div className="mt-3 h-8 w-full">
          <svg className="h-full w-full overflow-visible" viewBox="0 0 100 30" preserveAspectRatio="none">
            {(() => {
              const max = Math.max(...sparklineData, 1);
              const min = Math.min(...sparklineData, 0);
              const range = max - min || 1;
              const points = sparklineData
                .map((val, idx) => {
                  const x = (idx / (sparklineData.length - 1)) * 100;
                  const y = 30 - ((val - min) / range) * 26 - 2;
                  return `${x},${y}`;
                })
                .join(" ");
              return (
                <>
                  <polyline
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-primary/70"
                    points={points}
                  />
                </>
              );
            })()}
          </svg>
        </div>
      )}
    </div>
  );
}
