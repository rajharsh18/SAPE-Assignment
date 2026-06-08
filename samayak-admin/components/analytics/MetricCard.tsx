"use client";

import { cn } from "@/lib/cn";

type MetricTone = "brand" | "success" | "warning" | "danger";

const toneIconClass: Record<MetricTone, string> = {
  brand: "bg-brand-primary/15 text-brand-primary",
  success: "bg-success/15 text-success",
  warning: "bg-warning/15 text-warning",
  danger: "bg-danger/15 text-danger",
};

interface MetricCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  tone?: MetricTone;
  live?: boolean;
}

export function MetricCard({
  icon,
  label,
  value,
  sub,
  tone = "brand",
  live,
}: MetricCardProps) {
  return (
    <div className="card-hover flex items-start gap-4 rounded-2xl border border-border bg-surface-1 p-5">
      <div
        className={cn(
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
          toneIconClass[tone],
        )}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-xs font-medium text-text-secondary">{label}</p>
          {live && (
            <span
              className="h-2 w-2 rounded-full bg-success animate-pulse-glow"
              title="Live"
            />
          )}
        </div>
        <p className="mt-1 text-[28px] font-bold leading-none tracking-tight text-text-primary">
          {value}
        </p>
        <p className="mt-1 text-[11px] text-text-muted">{sub}</p>
      </div>
    </div>
  );
}

interface WelcomeBannerProps {
  title: string;
  subtitle: string;
  actions?: React.ReactNode;
}

export function WelcomeBanner({
  title,
  subtitle,
  actions,
}: WelcomeBannerProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">{title}</h1>
        <p className="mt-1 text-[13px] text-text-secondary">{subtitle}</p>
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      )}
    </div>
  );
}

export function ChartCard({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-surface-1 p-6",
        className,
      )}
    >
      <h3 className="mb-5 text-[15px] font-semibold text-text-primary">
        {title}
      </h3>
      {children}
    </div>
  );
}
