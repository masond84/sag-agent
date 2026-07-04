"use client";

import { useCallback, useEffect, useState } from "react";
import type { IncomeStatsPayload } from "@/lib/types";
import { fetchIncomeStats } from "@/lib/worker";

function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

export function IncomeDashboard() {
  const [stats, setStats] = useState<IncomeStatsPayload | null>(null);
  const [loadError, setLoadError] = useState(false);

  const refresh = useCallback(async () => {
    const payload = await fetchIncomeStats();
    if (payload) {
      setStats(payload);
      setLoadError(false);
    } else {
      setStats((current) => {
        if (current === null) setLoadError(true);
        return current;
      });
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      void refresh();
    }, 60_000);
    return () => clearInterval(timer);
  }, [refresh]);

  if (loadError && !stats) {
    return (
      <section className="space-y-3 rounded-lg border border-sag-border bg-white/[0.02] p-4">
        <h2 className="text-[11px] font-medium uppercase tracking-wider text-sag-muted">
          Dual income
        </h2>
        <p className="text-xs text-amber-200/80">
          Worker offline — start SAG with HOUSE_SERVER_ENABLED=true.
        </p>
      </section>
    );
  }

  if (!stats) {
    return (
      <section className="space-y-3 rounded-lg border border-sag-border bg-white/[0.02] p-4">
        <h2 className="text-[11px] font-medium uppercase tracking-wider text-sag-muted">
          Dual income
        </h2>
        <p className="text-sm text-sag-muted">Loading income stats…</p>
      </section>
    );
  }

  const { revenue, services, recentFailures, enabledServices, streams, publicToolsUrl } = stats;
  const gap = Math.max(0, revenue.weeklyGoal - revenue.thisWeek);
  const onTrack = revenue.weeklyProgress >= 100;
  const progressWidth = Math.min(100, revenue.weeklyProgress);
  const toolsUrl = streams?.api.publicToolsUrl ?? publicToolsUrl;
  const stripeOn = streams?.api.stripeConfigured ?? false;
  const webhookOn = streams?.api.stripeWebhookConfigured ?? false;
  const lastWeek = streams?.api.lastWeek ?? revenue.lastWeek;

  const serviceNameById = new Map(enabledServices.map((s) => [s.id, s.name]));

  const contentStream = streams?.content;
  const contentOnTrack = contentStream ? contentStream.weeklyProgress >= 100 : false;
  const contentProgressWidth = contentStream
    ? Math.min(100, contentStream.weeklyProgress)
    : 0;

  return (
    <section className="space-y-4 rounded-lg border border-sag-border bg-white/[0.02] p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[11px] font-medium uppercase tracking-wider text-sag-muted">
          Dual income
        </h2>
        <span className="text-[10px] uppercase tracking-wide text-sag-muted">
          {stripeOn ? "Stripe on" : "Stripe off"}
          {stripeOn && !webhookOn ? " · webhook off" : ""}
          {" · "}
          {streams?.api.servicesLive ?? enabledServices.length} API service
          {(streams?.api.servicesLive ?? enabledServices.length) === 1 ? "" : "s"}
        </span>
      </div>

      <div className="space-y-2">
        <p className="text-[10px] uppercase tracking-wide text-sag-muted">API revenue</p>
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
            ? "Weekly API goal reached."
            : `${formatCurrency(gap)} to go · ${revenue.daysUntilGoal} day(s) left in week`}
        </p>
      </div>

      {contentStream && (
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-wide text-sag-muted">Content posts</p>
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-lg font-medium tabular-nums text-sag-text">
              {contentStream.postedThisWeek}
            </p>
            <p className="text-xs text-sag-muted">
              of {contentStream.weeklyPostGoal} / week
            </p>
          </div>

          <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className={`h-full rounded-full transition-all ${
                contentOnTrack ? "bg-emerald-500/60" : "bg-teal-500/60"
              }`}
              style={{ width: `${contentProgressWidth}%` }}
            />
          </div>

          <p className="text-xs text-sag-muted">
            {contentStream.draftsReady} draft{contentStream.draftsReady === 1 ? "" : "s"} ready
            {contentStream.failed > 0 ? ` · ${contentStream.failed} failed` : ""}
            {contentStream.inFlight > 0 ? ` · ${contentStream.inFlight} in flight` : ""}
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 text-xs">
        <StatCell label="Today" value={formatCurrency(revenue.today)} />
        <StatCell label="Last week" value={formatCurrency(lastWeek)} />
        <StatCell label="All time" value={formatCurrency(revenue.allTime)} />
        {toolsUrl && (
          <div className="col-span-2 rounded-md border border-sag-border bg-white/[0.02] px-2.5 py-2">
            <p className="text-[10px] uppercase tracking-wide text-sag-muted">Public tools</p>
            <a
              href={toolsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-0.5 block truncate text-xs text-sag-accent hover:underline"
            >
              {toolsUrl}
            </a>
            {!stripeOn && (
              <p className="mt-1 text-[11px] text-sag-muted">
                Set STRIPE_SECRET_KEY to accept paid API credits.
              </p>
            )}
            {stripeOn && !webhookOn && (
              <p className="mt-1 text-[11px] text-amber-100/70">
                Stripe checkout works; set STRIPE_WEBHOOK_SECRET for automatic credit top-ups.
              </p>
            )}
          </div>
        )}
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
                <span className="truncate text-xs text-sag-text/90">
                  {serviceNameById.get(svc.serviceId) ?? svc.serviceId}
                </span>
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
                {serviceNameById.get(failure.serviceId) ?? failure.serviceId}:{" "}
                {failure.errorMessage ?? "Unknown error"}
              </li>
            ))}
          </ul>
        </div>
      )}

      {services.length === 0 && enabledServices.length > 0 && (
        <p className="text-xs text-sag-muted">
          No revenue yet. {enabledServices.length} service(s) ready for requests.
          {!stripeOn && " Configure Stripe to accept payments."}
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
