import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  ContentEpisode,
  ContentPlatform,
  ContentStats,
  EpisodeStatus,
  ManusPackageManifest,
  ManusResult,
} from "./types.js";
import { listSeries } from "./series.js";

const CONTENT_DIR = path.join(process.cwd(), "data", "content");
const EPISODES_DIR = path.join(CONTENT_DIR, "episodes");
const PACKAGES_DIR = path.join(CONTENT_DIR, "manus-packages");
const ASSETS_DIR = path.join(CONTENT_DIR, "assets");

const IN_FLIGHT: EpisodeStatus[] = ["planned", "scripted", "manus_queued", "rendering"];

async function ensureDirs(): Promise<void> {
  await fs.mkdir(EPISODES_DIR, { recursive: true });
  await fs.mkdir(PACKAGES_DIR, { recursive: true });
  await fs.mkdir(ASSETS_DIR, { recursive: true });
}

function episodePath(id: string): string {
  return path.join(EPISODES_DIR, `${id}.json`);
}

function packageDir(episodeId: string): string {
  return path.join(PACKAGES_DIR, episodeId);
}

export function getPackageDir(episodeId: string): string {
  return packageDir(episodeId);
}

export function getAssetsDir(episodeId: string): string {
  return path.join(ASSETS_DIR, episodeId);
}

export async function createEpisode(
  seriesId: string,
  title: string,
): Promise<ContentEpisode> {
  await ensureDirs();
  const now = new Date().toISOString();
  const episode: ContentEpisode = {
    id: randomUUID(),
    seriesId,
    title,
    status: "planned",
    platformsPosted: [],
    createdAt: now,
    updatedAt: now,
  };
  await saveEpisode(episode);
  return episode;
}

export async function saveEpisode(episode: ContentEpisode): Promise<void> {
  await ensureDirs();
  episode.updatedAt = new Date().toISOString();
  await fs.writeFile(episodePath(episode.id), JSON.stringify(episode, null, 2), "utf8");
}

export async function getEpisode(id: string): Promise<ContentEpisode | null> {
  try {
    const raw = await fs.readFile(episodePath(id), "utf8");
    return JSON.parse(raw) as ContentEpisode;
  } catch {
    return null;
  }
}

export async function listEpisodes(options?: {
  status?: EpisodeStatus;
  limit?: number;
}): Promise<ContentEpisode[]> {
  await ensureDirs();
  let names: string[];
  try {
    names = await fs.readdir(EPISODES_DIR);
  } catch {
    return [];
  }

  const episodes: ContentEpisode[] = [];
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    try {
      const raw = await fs.readFile(path.join(EPISODES_DIR, name), "utf8");
      episodes.push(JSON.parse(raw) as ContentEpisode);
    } catch {
      // skip corrupt
    }
  }

  episodes.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  let filtered = episodes;
  if (options?.status) {
    filtered = episodes.filter((e) => e.status === options.status);
  }
  if (options?.limit && options.limit > 0) {
    filtered = filtered.slice(0, options.limit);
  }
  return filtered;
}

export async function updateEpisodeStatus(
  id: string,
  status: EpisodeStatus,
  patch?: Partial<ContentEpisode>,
): Promise<ContentEpisode | null> {
  const episode = await getEpisode(id);
  if (!episode) return null;
  Object.assign(episode, patch ?? {});
  episode.status = status;
  if (status === "failed" && patch?.error) {
    episode.error = patch.error;
  }
  if (status !== "failed") {
    delete episode.error;
  }
  await saveEpisode(episode);
  return episode;
}

export async function markEpisodePosted(
  id: string,
  platforms: ContentPlatform[],
): Promise<ContentEpisode | null> {
  const episode = await getEpisode(id);
  if (!episode) return null;
  const merged = new Set([...episode.platformsPosted, ...platforms]);
  episode.platformsPosted = [...merged];
  episode.status = "posted";
  episode.postedAt = new Date().toISOString();
  await saveEpisode(episode);
  return episode;
}

export async function writeManusPackage(
  episode: ContentEpisode,
  manifest: ManusPackageManifest,
  promptMarkdown: string,
): Promise<string> {
  const dir = packageDir(episode.id);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
  await fs.writeFile(path.join(dir, "prompt.md"), promptMarkdown, "utf8");
  if (episode.script) {
    await fs.writeFile(path.join(dir, "script.txt"), episode.script, "utf8");
  }
  return dir;
}

export async function readManusResult(episodeId: string): Promise<ManusResult | null> {
  const resultPath = path.join(packageDir(episodeId), "result.json");
  try {
    const raw = await fs.readFile(resultPath, "utf8");
    return JSON.parse(raw) as ManusResult;
  } catch {
    return null;
  }
}

export async function writeManusResult(episodeId: string, result: ManusResult): Promise<void> {
  const dir = packageDir(episodeId);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, "result.json"),
    JSON.stringify({ ...result, completedAt: result.completedAt ?? new Date().toISOString() }, null, 2),
    "utf8",
  );
}

/** Sunday-start week boundary — matches API revenue stats in revenue-tracking.ts */
function startOfWeek(d: Date): Date {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  copy.setDate(copy.getDate() - copy.getDay());
  return copy;
}

export function getContentWeeklyPostGoal(): number {
  const n = Number(process.env.CONTENT_WEEKLY_POST_GOAL ?? 3);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 3;
}

export async function getContentStats(): Promise<ContentStats> {
  const episodes = await listEpisodes();
  const series = await listSeries();
  const byStatus = {
    planned: 0,
    scripted: 0,
    manus_queued: 0,
    rendering: 0,
    draft_ready: 0,
    posted: 0,
    failed: 0,
  } satisfies Record<EpisodeStatus, number>;

  const weekStart = startOfWeek(new Date()).toISOString();
  let postedThisWeek = 0;

  for (const ep of episodes) {
    byStatus[ep.status] = (byStatus[ep.status] ?? 0) + 1;
    if (ep.status === "posted" && ep.postedAt && ep.postedAt >= weekStart) {
      postedThisWeek += 1;
    }
  }

  const inFlight = IN_FLIGHT.reduce((sum, s) => sum + (byStatus[s] ?? 0), 0);
  const weeklyPostGoal = getContentWeeklyPostGoal();
  const weeklyProgress = weeklyPostGoal > 0 ? (postedThisWeek / weeklyPostGoal) * 100 : 0;

  return {
    byStatus,
    draftsReady: byStatus.draft_ready,
    inFlight,
    postedThisWeek,
    failed: byStatus.failed,
    total: episodes.length,
    seriesCount: series.filter((s) => s.enabled).length,
    weeklyPostGoal,
    weeklyProgress,
  };
}

export async function countEpisodesCreatedToday(): Promise<number> {
  const episodes = await listEpisodes();
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const startIso = start.toISOString();
  return episodes.filter((e) => e.createdAt >= startIso).length;
}

export async function countInFlight(): Promise<number> {
  const episodes = await listEpisodes();
  return episodes.filter((e) => IN_FLIGHT.includes(e.status)).length;
}

export async function listInFlightEpisodes(): Promise<ContentEpisode[]> {
  const episodes = await listEpisodes();
  return episodes.filter((e) => IN_FLIGHT.includes(e.status));
}

export function isContentEngineEnabled(): boolean {
  return (process.env.CONTENT_ENGINE_ENABLED ?? "true").toLowerCase() !== "false";
}

export function getEpisodesPerDay(): number {
  const n = Number(process.env.CONTENT_EPISODES_PER_DAY ?? 1);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
}

export function getMaxInFlight(): number {
  const n = Number(process.env.CONTENT_MAX_IN_FLIGHT ?? 1);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
}
