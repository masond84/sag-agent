"use client";

import { useCallback, useEffect, useState } from "react";
import type { ContentEpisode, ContentPlatform } from "@/lib/types";
import { fetchContentEpisodes, markContentPosted } from "@/lib/worker";

export function ContentDashboard() {
  const [episodes, setEpisodes] = useState<ContentEpisode[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const list = await fetchContentEpisodes(20);
    setEpisodes(list);
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      void refresh();
    }, 30_000);
    return () => clearInterval(timer);
  }, [refresh]);

  const drafts = episodes.filter((e) => e.status === "draft_ready");
  const inFlight = episodes.filter((e) =>
    ["planned", "scripted", "manus_queued", "rendering"].includes(e.status),
  );

  async function handleMarkPosted(episode: ContentEpisode) {
    setBusyId(episode.id);
    const platforms: ContentPlatform[] = ["youtube", "tiktok", "reels"];
    await markContentPosted(episode.id, platforms);
    await refresh();
    setBusyId(null);
  }

  return (
    <section className="space-y-4 rounded-lg border border-sag-border bg-white/[0.02] p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[11px] font-medium uppercase tracking-wider text-sag-muted">
          Content
        </h2>
        <span className="text-[10px] uppercase tracking-wide text-sag-muted">
          {drafts.length} draft{drafts.length === 1 ? "" : "s"} · {inFlight.length} in flight
        </span>
      </div>

      {episodes.length === 0 && (
        <p className="text-xs text-sag-muted">
          No episodes yet. Content engine will plan scripts on the next schedule tick.
        </p>
      )}

      {drafts.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-wide text-sag-muted">Draft ready</p>
          <ul className="space-y-2">
            {drafts.slice(0, 5).map((episode) => (
              <EpisodeRow
                key={episode.id}
                episode={episode}
                expanded={expandedId === episode.id}
                busy={busyId === episode.id}
                onToggle={() =>
                  setExpandedId((current) => (current === episode.id ? null : episode.id))
                }
                onMarkPosted={() => void handleMarkPosted(episode)}
              />
            ))}
          </ul>
        </div>
      )}

      {inFlight.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-wide text-sag-muted">In flight</p>
          <ul className="space-y-1.5">
            {inFlight.slice(0, 4).map((episode) => (
              <li
                key={episode.id}
                className="rounded-md border border-sag-border bg-white/[0.02] px-2.5 py-1.5"
              >
                <p className="truncate text-xs text-sag-text/90">{episode.title}</p>
                <p className="mt-0.5 text-[10px] uppercase tracking-wide text-sag-muted">
                  {episode.status.replace(/_/g, " ")}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {episodes.filter((e) => e.status === "posted").length > 0 && (
        <p className="text-xs text-sag-muted">
          Posted this list: {episodes.filter((e) => e.status === "posted").length}
        </p>
      )}
    </section>
  );
}

function EpisodeRow({
  episode,
  expanded,
  busy,
  onToggle,
  onMarkPosted,
}: {
  episode: ContentEpisode;
  expanded: boolean;
  busy: boolean;
  onToggle: () => void;
  onMarkPosted: () => void;
}) {
  return (
    <li className="rounded-md border border-sag-border bg-white/[0.02]">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start justify-between gap-2 px-2.5 py-2 text-left"
      >
        <span className="text-xs text-sag-text/90">{episode.title}</span>
        <span className="shrink-0 text-[10px] uppercase tracking-wide text-sag-muted">
          {expanded ? "Hide" : "Open"}
        </span>
      </button>
      {expanded && (
        <div className="space-y-2 border-t border-sag-border px-2.5 py-2">
          {episode.captions && (
            <CopyBlock label="YouTube caption" text={episode.captions.youtube} />
          )}
          {episode.captions && (
            <CopyBlock label="TikTok caption" text={episode.captions.tiktok} />
          )}
          {episode.captions && (
            <CopyBlock label="Reels caption" text={episode.captions.reels} />
          )}
          {episode.script && (
            <CopyBlock label="Script" text={episode.script} />
          )}
          {episode.assets?.videoUrl && (
            <p className="break-all text-[11px] text-sag-muted">Video: {episode.assets.videoUrl}</p>
          )}
          {episode.assets?.videoPath && (
            <p className="break-all text-[11px] text-sag-muted">Video path: {episode.assets.videoPath}</p>
          )}
          {episode.manusPackagePath && (
            <p className="break-all text-[11px] text-sag-muted">
              Manus package: {episode.manusPackagePath}
            </p>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={onMarkPosted}
            className="rounded-md border border-sag-border bg-white/[0.04] px-2.5 py-1.5 text-[11px] font-medium text-sag-text transition hover:bg-white/[0.08] disabled:opacity-50"
          >
            {busy ? "Saving…" : "Mark posted"}
          </button>
        </div>
      )}
    </li>
  );
}

function CopyBlock({ label, text }: { label: string; text: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] uppercase tracking-wide text-sag-muted">{label}</p>
        <button
          type="button"
          className="text-[10px] uppercase tracking-wide text-sag-muted hover:text-sag-text"
          onClick={() => void navigator.clipboard.writeText(text)}
        >
          Copy
        </button>
      </div>
      <pre className="max-h-28 overflow-auto whitespace-pre-wrap rounded border border-sag-border bg-black/20 px-2 py-1.5 text-[11px] leading-relaxed text-sag-text/85">
        {text}
      </pre>
    </div>
  );
}
