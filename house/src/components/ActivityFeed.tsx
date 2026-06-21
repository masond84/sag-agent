"use client";

import type { ActivityEvent, HouseEvent } from "@/lib/types";

interface ActivityFeedProps {
  events: Array<HouseEvent | ActivityEvent>;
}

export function ActivityFeed({ events }: ActivityFeedProps) {
  return (
    <section className="rounded-2xl border border-white/10 bg-sag-panel/60 p-6 backdrop-blur-sm">
      <header className="mb-4">
        <p className="text-xs uppercase tracking-[0.35em] text-sag-glow/70">Live Feed</p>
        <h2 className="font-display text-xl text-sag-star">Recent Activity</h2>
      </header>
      <ul className="max-h-64 space-y-2 overflow-y-auto text-sm">
        {events.length === 0 ? (
          <li className="text-white/40">No activity yet.</li>
        ) : (
          events
            .slice()
            .reverse()
            .slice(0, 20)
            .map((event, index) => (
              <li
                key={"id" in event ? event.id : `${event.at}-${index}`}
                className="rounded-lg border border-white/5 bg-black/20 px-3 py-2"
              >
                <div className="flex items-center justify-between gap-2 text-xs text-white/40">
                  <span>{formatEventType(event)}</span>
                  <time>{new Date(event.at).toLocaleTimeString()}</time>
                </div>
                <p className="mt-1 text-white/75">{formatEventText(event)}</p>
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
