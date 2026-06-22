"use client";

import type { ActivityEvent, HouseEvent } from "@/lib/types";

interface ActivityFeedProps {
  events: Array<HouseEvent | ActivityEvent>;
}

export function ActivityFeed({ events }: ActivityFeedProps) {
  return (
    <section className="space-y-5">
      <header className="space-y-1">
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-sag-muted">
          Live feed
        </p>
        <h2 className="text-lg font-medium tracking-tight text-sag-text">Recent activity</h2>
      </header>
      <ul className="max-h-72 space-y-2 overflow-y-auto pr-1 text-sm">
        {events.length === 0 ? (
          <li className="text-sag-muted">No activity yet.</li>
        ) : (
          events
            .slice()
            .reverse()
            .slice(0, 20)
            .map((event, index) => (
              <li
                key={"id" in event ? event.id : `${event.at}-${index}`}
                className="rounded-lg border border-sag-border bg-white/[0.02] px-4 py-3"
              >
                <div className="flex items-center justify-between gap-3 text-[11px] text-sag-muted">
                  <span className="uppercase tracking-wide">{formatEventType(event)}</span>
                  <time className="shrink-0 tabular-nums">
                    {new Date(event.at).toLocaleTimeString(undefined, {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </time>
                </div>
                <p className="mt-2 leading-relaxed text-sag-text/85">{formatEventText(event)}</p>
              </li>
            ))
        )}
      </ul>
    </section>
  );
}

function formatEventType(event: HouseEvent | ActivityEvent): string {
  if ("kind" in event) {
    return event.kind;
  }
  return event.type;
}

function formatEventText(event: HouseEvent | ActivityEvent): string {
  if ("kind" in event) {
    return event.speech ?? event.text ?? "";
  }
  return event.summary;
}
