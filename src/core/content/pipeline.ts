import { getSeries, pickSeriesForToday } from "./series.js";
import { generateEpisodeContent } from "./script.js";
import { isManusEnabled, queueManusJob, tryIngestManusResult } from "./manus.js";
import {
  countEpisodesCreatedToday,
  countInFlight,
  createEpisode,
  getEpisode,
  getEpisodesPerDay,
  getMaxInFlight,
  isContentEngineEnabled,
  listInFlightEpisodes,
  updateEpisodeStatus,
} from "./store.js";
import type { ContentEpisode, ManusResult } from "./types.js";

export interface PipelineEvent {
  type:
    | "content_planned"
    | "content_scripted"
    | "content_manus_queued"
    | "content_draft_ready"
    | "content_failed"
    | "skipped";
  summary: string;
  episode?: ContentEpisode;
  speak?: boolean;
  notify?: boolean;
}

function applyManusResult(episode: ContentEpisode, result: ManusResult): Partial<ContentEpisode> {
  return {
    assets: {
      videoPath: result.videoPath,
      videoUrl: result.videoUrl,
      voiceoverPath: result.voiceoverPath,
      voiceoverUrl: result.voiceoverUrl,
      thumbnailPath: result.thumbnailPath,
      durationSeconds: result.durationSeconds,
      notes: result.notes,
    },
  };
}

/** Resume episodes stuck in `planned` (e.g. after a restart mid-tick). */
async function advancePlannedEpisodes(): Promise<PipelineEvent[]> {
  const events: PipelineEvent[] = [];
  const planned = (await listInFlightEpisodes()).filter((e) => e.status === "planned");

  for (const episode of planned) {
    const series = await getSeries(episode.seriesId);
    if (!series) {
      await updateEpisodeStatus(episode.id, "failed", { error: `Unknown series ${episode.seriesId}` });
      continue;
    }
    try {
      const generated = await generateEpisodeContent(series);
      const updated = await updateEpisodeStatus(episode.id, "scripted", {
        title: generated.title,
        script: generated.script,
        voiceoverNotes: generated.voiceoverNotes,
        captions: generated.captions,
      });
      events.push({
        type: "content_scripted",
        summary: `Scripted: ${updated?.title ?? episode.title}`,
        episode: updated ?? episode,
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      const failed = await updateEpisodeStatus(episode.id, "failed", { error: detail });
      events.push({
        type: "content_failed",
        summary: `Script failed: ${detail.slice(0, 120)}`,
        episode: failed ?? episode,
        notify: true,
      });
    }
  }

  return events;
}

/** Advance in-flight episodes (ingest Manus results). Returns events for notifications. */
export async function advanceInFlightEpisodes(): Promise<PipelineEvent[]> {
  const events: PipelineEvent[] = [];
  const inFlight = await listInFlightEpisodes();

  for (const episode of inFlight) {
    if (episode.status !== "manus_queued" && episode.status !== "rendering") {
      continue;
    }

    try {
      const result = await tryIngestManusResult(episode);
      if (!result) {
        continue;
      }

      await updateEpisodeStatus(episode.id, "rendering");
      const updated = await updateEpisodeStatus(episode.id, "draft_ready", applyManusResult(episode, result));
      if (updated) {
        events.push({
          type: "content_draft_ready",
          summary: `Draft ready: ${updated.title} — open Home Base → Content`,
          episode: updated,
          speak: true,
          notify: true,
        });
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      const failed = await updateEpisodeStatus(episode.id, "failed", { error: detail });
      events.push({
        type: "content_failed",
        summary: `Content failed: ${episode.title} — ${detail.slice(0, 120)}`,
        episode: failed ?? episode,
        notify: true,
      });
    }
  }

  return events;
}

/**
 * Promote scripted episodes that have no video yet to draft_ready when Manus is skipped,
 * or queue Manus for scripted episodes.
 */
export async function advanceScriptedEpisodes(): Promise<PipelineEvent[]> {
  const events: PipelineEvent[] = [];
  const inFlight = await listInFlightEpisodes();
  const scripted = inFlight.filter((e) => e.status === "scripted");

  for (const episode of scripted) {
    const series = await getSeries(episode.seriesId);
    if (!series) {
      await updateEpisodeStatus(episode.id, "failed", { error: `Unknown series ${episode.seriesId}` });
      continue;
    }

    // Manus disabled: ship script + captions as draft (no video).
    if (!isManusEnabled()) {
      const updated = await updateEpisodeStatus(episode.id, "draft_ready", {
        assets: { notes: "Script-only draft (MANUS_ENABLED=false)." },
      });
      events.push({
        type: "content_draft_ready",
        summary: `Draft ready: ${episode.title} — open Home Base → Content`,
        episode: updated ?? episode,
        speak: true,
        notify: true,
      });
      continue;
    }

    try {
      const outcome = await queueManusJob(episode, series);
      const updated = await getEpisode(episode.id);
      events.push({
        type: "content_manus_queued",
        summary: outcome.message,
        episode: updated ?? episode,
        notify: outcome.mode === "package",
        speak: false,
      });
    } catch (error) {
      // Package/API failed — still ship script+captions as draft so pipeline isn't blocked
      const detail = error instanceof Error ? error.message : String(error);
      const updated = await updateEpisodeStatus(episode.id, "draft_ready", {
        assets: { notes: `Manus queue failed (${detail}); script-only draft.` },
      });
      events.push({
        type: "content_draft_ready",
        summary: `Draft ready (script only): ${episode.title} — open Home Base → Content`,
        episode: updated ?? episode,
        speak: true,
        notify: true,
      });
    }
  }

  return events;
}

/** Plan and script a new episode if under daily / in-flight caps. */
export async function planAndScriptNewEpisode(): Promise<PipelineEvent[]> {
  if (!isContentEngineEnabled()) {
    return [{ type: "skipped", summary: "Content engine disabled" }];
  }

  const perDay = getEpisodesPerDay();
  const createdToday = await countEpisodesCreatedToday();
  if (createdToday >= perDay) {
    return [{ type: "skipped", summary: `Daily content cap reached (${createdToday}/${perDay})` }];
  }

  const inFlight = await countInFlight();
  if (inFlight >= getMaxInFlight()) {
    return [{ type: "skipped", summary: `Max in-flight content jobs (${inFlight})` }];
  }

  const series = await pickSeriesForToday();
  if (!series) {
    return [{ type: "skipped", summary: "No enabled content series" }];
  }

  const events: PipelineEvent[] = [];
  const placeholderTitle = `${series.name} draft`;
  let episode = await createEpisode(series.id, placeholderTitle);
  events.push({
    type: "content_planned",
    summary: `Planned episode for ${series.name}`,
    episode,
  });

  try {
    const generated = await generateEpisodeContent(series);
    episode = (await updateEpisodeStatus(episode.id, "scripted", {
      title: generated.title,
      script: generated.script,
      voiceoverNotes: generated.voiceoverNotes,
      captions: generated.captions,
    }))!;
    events.push({
      type: "content_scripted",
      summary: `Scripted: ${episode.title}`,
      episode,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    episode = (await updateEpisodeStatus(episode.id, "failed", { error: detail }))!;
    events.push({
      type: "content_failed",
      summary: `Script failed: ${detail.slice(0, 120)}`,
      episode,
      notify: true,
    });
  }

  return events;
}

/** Full tick: ingest → advance scripted → maybe plan new. */
export async function runContentPipelineTick(): Promise<PipelineEvent[]> {
  if (!isContentEngineEnabled()) {
    return [{ type: "skipped", summary: "Content engine disabled" }];
  }

  const events: PipelineEvent[] = [];
  events.push(...(await advanceInFlightEpisodes()));
  events.push(...(await advancePlannedEpisodes()));
  events.push(...(await advanceScriptedEpisodes()));
  events.push(...(await planAndScriptNewEpisode()));
  return events;
}

/** Manual ingest of Manus result metadata for an episode. */
export async function ingestEpisodeResult(
  episodeId: string,
  result: ManusResult,
): Promise<ContentEpisode | null> {
  const episode = await getEpisode(episodeId);
  if (!episode) return null;

  const { writeManusResult } = await import("./store.js");
  await writeManusResult(episodeId, result);
  return updateEpisodeStatus(episodeId, "draft_ready", applyManusResult(episode, result));
}
