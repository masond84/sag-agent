"use client";

import { useCallback, useEffect, useState } from "react";
import type { DevStatusPayload } from "@/lib/types";
import { fetchDevStatus } from "@/lib/worker";

export function DevStatusPanel() {
  const [status, setStatus] = useState<DevStatusPayload | null>(null);

  const refresh = useCallback(async () => {
    const payload = await fetchDevStatus();
    setStatus(payload);
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      void refresh();
    }, 30_000);
    return () => clearInterval(timer);
  }, [refresh]);

  if (!status) {
    return (
      <section className="space-y-3 rounded-lg border border-sag-border bg-white/[0.02] p-4">
        <h2 className="text-[11px] font-medium uppercase tracking-wider text-sag-muted">
          Evolution queue
        </h2>
        <p className="text-sm text-sag-muted">Loading dev status…</p>
      </section>
    );
  }

  if (!status.enabled) {
    return (
      <section className="space-y-3 rounded-lg border border-sag-border bg-white/[0.02] p-4">
        <h2 className="text-[11px] font-medium uppercase tracking-wider text-sag-muted">
          Evolution queue
        </h2>
        <p className="text-sm text-sag-muted">Dev runner disabled.</p>
      </section>
    );
  }

  return (
    <section className="space-y-3 rounded-lg border border-sag-border bg-white/[0.02] p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[11px] font-medium uppercase tracking-wider text-sag-muted">
          Evolution queue
        </h2>
        <span className="text-[10px] uppercase tracking-wide text-sag-muted">
          {status.orchestratorMode}
        </span>
      </div>

      <p className="text-sm text-sag-text">
        {status.running
          ? "Dev cycle running…"
          : status.pendingCount > 0
            ? `${status.pendingCount} task(s) queued`
            : "No tasks queued"}
      </p>

      {status.pending.length > 0 && (
        <ul className="space-y-2">
          {status.pending.slice(0, 3).map((item) => (
            <li
              key={`${item.queuedAt}-${item.kind}`}
              className="rounded-md border border-sag-border bg-white/[0.02] px-3 py-2"
            >
              <p className="text-[10px] uppercase tracking-wide text-sag-muted">{item.kind}</p>
              {item.task && (
                <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-sag-text/85">
                  {item.task.split("\n")[0]}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {status.lastMergedPrs.length > 0 && (
        <p className="text-xs text-sag-muted">
          Last merge: PR #{status.lastMergedPrs.join(", #")}
        </p>
      )}
    </section>
  );
}
