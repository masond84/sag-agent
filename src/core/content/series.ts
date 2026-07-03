import { promises as fs } from "node:fs";
import path from "node:path";
import type { ContentSeries } from "./types.js";

const CONTENT_DIR = path.join(process.cwd(), "data", "content");
const SERIES_FILE = path.join(CONTENT_DIR, "series.json");

const DEFAULT_SERIES: ContentSeries[] = [
  {
    id: "sleep-stories",
    name: "Sleep Stories",
    tone: "calm, soothing, gentle bedtime narration for falling asleep",
    lengthMinutes: 8,
    platforms: ["youtube", "tiktok", "reels"],
    cadenceDays: [1, 3],
    enabled: true,
  },
  {
    id: "scary-tales",
    name: "Scary Tales",
    tone: "atmospheric horror storytelling, suspenseful but not graphic",
    lengthMinutes: 7,
    platforms: ["youtube", "tiktok", "reels"],
    cadenceDays: [5],
    enabled: true,
  },
  {
    id: "storytime",
    name: "Storytime",
    tone: "warm narrative storytelling, engaging and cinematic",
    lengthMinutes: 6,
    platforms: ["youtube", "tiktok", "reels"],
    cadenceDays: [0, 6],
    enabled: true,
  },
];

export async function ensureSeriesDefaults(): Promise<ContentSeries[]> {
  await fs.mkdir(CONTENT_DIR, { recursive: true });
  try {
    const raw = await fs.readFile(SERIES_FILE, "utf8");
    const parsed = JSON.parse(raw) as { series?: ContentSeries[] };
    if (Array.isArray(parsed.series) && parsed.series.length > 0) {
      return parsed.series;
    }
  } catch {
    // write defaults
  }
  await fs.writeFile(SERIES_FILE, JSON.stringify({ series: DEFAULT_SERIES }, null, 2), "utf8");
  return DEFAULT_SERIES;
}

export async function listSeries(): Promise<ContentSeries[]> {
  return ensureSeriesDefaults();
}

export async function getSeries(id: string): Promise<ContentSeries | null> {
  const series = await listSeries();
  return series.find((s) => s.id === id) ?? null;
}

export function getEnabledSeriesIds(): string[] {
  const raw = process.env.CONTENT_SERIES?.trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Pick a series for today based on cadence and optional CONTENT_SERIES filter. */
export async function pickSeriesForToday(): Promise<ContentSeries | null> {
  const all = await listSeries();
  const filter = getEnabledSeriesIds();
  const enabled = all.filter((s) => s.enabled && (filter.length === 0 || filter.includes(s.id)));
  if (enabled.length === 0) return null;

  const day = new Date().getDay();
  const matching = enabled.filter((s) => s.cadenceDays.length === 0 || s.cadenceDays.includes(day));
  const pool = matching.length > 0 ? matching : enabled;
  return pool[Math.floor(Math.random() * pool.length)] ?? null;
}
