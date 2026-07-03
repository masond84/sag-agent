"use client";

import { useCallback, useEffect, useState } from "react";
import type { IncomeStatsPayload } from "@/lib/types";
import { fetchIncomeStats } from "@/lib/worker";

function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

export function IncomeDashboard() {
  const [stats, setStats] = useState<IncomeStatsPayload | null>(null);

  const refresh = useCallback(async () => {
    const payload = await fetchIncomeStats();
    setStats(payload);
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      void refresh();
    }, 60_000);
    return () => clearInterval(timer);
  }, [refresh]);

  if (!stats) {
    return (
      <section className="space-y-3 rounded-lg border border-sag-border bg-white/[0.02] p-4">
        <h2 className="text-[11px] font-medium uppercase tracking-wider text-sag-muted">
          API business
        </h2>
        <p className="text-sm text-sag-muted">Loading income stats…</p>
      </section>
    );
  }

  const { revenue, services, recentFailures, enabledServices, streams } = stats;
  const gap = Math.max(0, revenue.weeklyGoal - revenue.thisWeek);
  const onTrack = revenue.weeklyProgress >= 100;
  const progressWidth = Math.min(100, revenue.weeklyProgress);
  const streamLabel = streams
    ? `API $${streams.api.thisWeek.toFixed(0)} · Content ${streams.content.draftsReady} drafts / ${streams.content.postedThisWeek} posted`
    : `${enabledServices.length} services live`;

  return (
    <section className="space-y-4 rounded-lg border border-sag-border bg-white/[0.02] p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[11px] font-medium uppercase tracking-wider text-sag-muted">
          API business
        </h2>
        <span className="max-w-[58%] text-right text-[10px] uppercase tracking-wide text-sag-muted">
          {streamLabel}
        </span>
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-2xl font-medium tabular-nums text-sag-text">
            {formatCurrency(revenue.thisWeek)}
          </p>
          <p className="text-xs text-sag-muted">
            of {formatCurrency(revenue.weeklyGoal)} / week
          </p>
        </div>

        <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className={`h-full rounded-full transition-all ${
              onTrack ? "bg-emerald-500/70" : "bg-sag-accent/70"
            }`}
            style={{ width: `${progressWidth}%` }}
          />
        </div>

        <p className="text-xs text-sag-muted">
          {onTrack
            ? "Weekly goal reached."
            : `${formatCurrency(gap)} to go · ${revenue.daysUntilGoal} day(s) left in week`}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <StatCell label="Today" value={formatCurrency(revenue.today)} />
        <StatCell label="All time" value={formatCurrency(revenue.allTime)} />
      </div>

      {services.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-wide text-sag-muted">Top services</p>
          <ul className="space-y-1.5">
            {services.slice(0, 3).map((svc) => (
              <li
                key={svc.serviceId}
                className="flex items-center justify-between gap-2 rounded-md border border-sag-border bg-white/[0.02] px-2.5 py-1.5"
              >
                <span className="truncate text-xs text-sag-text/90">{svc.serviceId}</span>
                <span className="shrink-0 tabular-nums text-xs text-sag-muted">
                  {formatCurrency(svc.totalProfit)} · {svc.successfulCalls} calls
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {recentFailures.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] uppercase tracking-wide text-amber-200/70">
            Recent failures ({recentFailures.length})
          </p>
          <ul className="space-y-1">
            {recentFailures.slice(0, 2).map((failure, index) => (
              <li key={`${failure.timestamp}-${index}`} className="text-xs text-amber-100/80">
                {failure.serviceId}: {failure.errorMessage ?? "Unknown error"}
              </li>
            ))}
          </ul>
        </div>
      )}

      {services.length === 0 && enabledServices.length > 0 && (
        <p className="text-xs text-sag-muted">
          No revenue yet. {enabledServices.length} service(s) ready for requests.
        </p>
      )}
    </section>
  );
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-sag-border bg-white/[0.02] px-2.5 py-2">
      <p className="text-[10px] uppercase tracking-wide text-sag-muted">{label}</p>
      <p className="mt-0.5 tabular-nums text-sag-text">{value}</p>
    </div>
  );
}
