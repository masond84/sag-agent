import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getZonedTimeInfo } from "./schedule.js";

export type FocusSlot = string;

export interface FocusTouchpoint {
  sentAt: string;
  reply?: string;
  replyAt?: string;
}

export interface FocusDay {
  dateKey: string;
  focus?: string;
  focusSetAt?: string;
  touchpoints: Record<FocusSlot, FocusTouchpoint>;
}

interface FocusStore {
  pendingReplySlot?: FocusSlot;
  days: FocusDay[];
}

const DATA_DIR = path.resolve(process.cwd(), "data");
const FOCUS_FILE = path.join(DATA_DIR, "focus.json");
const MAX_DAYS = 30;

function getTimeZone(): string {
  return (
    process.env.FOCUS_TIMEZONE?.trim() ||
    process.env.MORNING_BRIEFING_TIMEZONE?.trim() ||
    "America/New_York"
  );
}

async function readStore(): Promise<FocusStore> {
  await mkdir(DATA_DIR, { recursive: true });
  try {
    const raw = await readFile(FOCUS_FILE, "utf8");
    return JSON.parse(raw) as FocusStore;
  } catch {
    return { days: [] };
  }
}

async function writeStore(store: FocusStore): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(FOCUS_FILE, JSON.stringify(store, null, 2));
}

function emptyDay(dateKey: string): FocusDay {
  return { dateKey, touchpoints: {} };
}

export function getFocusTimeZone(): string {
  return getTimeZone();
}

export async function getTodayFocusDay(timeZone = getTimeZone()): Promise<FocusDay> {
  const store = await readStore();
  const { dateKey } = getZonedTimeInfo(timeZone);
  return store.days.find((day) => day.dateKey === dateKey) ?? emptyDay(dateKey);
}

async function upsertTodayDay(mutator: (day: FocusDay) => void, timeZone = getTimeZone()): Promise<FocusDay> {
  const store = await readStore();
  const { dateKey } = getZonedTimeInfo(timeZone);
  let day = store.days.find((entry) => entry.dateKey === dateKey);

  if (!day) {
    day = emptyDay(dateKey);
    store.days.unshift(day);
  }

  mutator(day);
  store.days = store.days.slice(0, MAX_DAYS);
  await writeStore(store);
  return day;
}

export async function setTodayFocus(text: string, timeZone = getTimeZone()): Promise<FocusDay> {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("Focus text cannot be empty.");
  }

  return upsertTodayDay((day) => {
    day.focus = trimmed;
    day.focusSetAt = new Date().toISOString();
  }, timeZone);
}

export async function hasTodayFocus(timeZone = getTimeZone()): Promise<boolean> {
  const day = await getTodayFocusDay(timeZone);
  return Boolean(day.focus?.trim());
}

export async function getTodayFocusText(timeZone = getTimeZone()): Promise<string | undefined> {
  const day = await getTodayFocusDay(timeZone);
  return day.focus?.trim() || undefined;
}

export function hasSentTouchpointToday(day: FocusDay, slot: FocusSlot, dateKey: string): boolean {
  if (day.dateKey !== dateKey) {
    return false;
  }
  return Boolean(day.touchpoints[slot]?.sentAt);
}

export async function markTouchpointSent(slot: FocusSlot, timeZone = getTimeZone()): Promise<FocusDay> {
  return upsertTodayDay((day) => {
    day.touchpoints[slot] = {
      sentAt: new Date().toISOString(),
      reply: day.touchpoints[slot]?.reply,
      replyAt: day.touchpoints[slot]?.replyAt,
    };
  }, timeZone);
}

export async function recordTouchpointReply(
  slot: FocusSlot,
  reply: string,
  timeZone = getTimeZone(),
): Promise<FocusDay> {
  const trimmed = reply.trim();
  return upsertTodayDay((day) => {
    const existing = day.touchpoints[slot] ?? { sentAt: new Date().toISOString() };
    day.touchpoints[slot] = {
      ...existing,
      reply: trimmed,
      replyAt: new Date().toISOString(),
    };
  }, timeZone);
}

export async function getPendingReplySlot(): Promise<FocusSlot | undefined> {
  const store = await readStore();
  return store.pendingReplySlot;
}

export async function setPendingReplySlot(slot: FocusSlot): Promise<void> {
  const store = await readStore();
  store.pendingReplySlot = slot;
  await writeStore(store);
}

export async function clearPendingReplySlot(): Promise<void> {
  const store = await readStore();
  delete store.pendingReplySlot;
  await writeStore(store);
}

export function formatTodayFocusSummary(day: FocusDay): string {
  const lines = [`Date: ${day.dateKey}`];

  if (day.focus) {
    lines.push(`Focus: ${day.focus}`);
    if (day.focusSetAt) {
      lines.push(`Set at: ${day.focusSetAt}`);
    }
  } else {
    lines.push("Focus: not set");
  }

  const touchpointEntries = Object.entries(day.touchpoints);
  if (touchpointEntries.length === 0) {
    lines.push("Check-ins: none yet");
    return lines.join("\n");
  }

  lines.push("Check-ins:");
  for (const [slot, touchpoint] of touchpointEntries) {
    const parts = [`  - ${slot}: sent ${touchpoint.sentAt.slice(11, 16)}`];
    if (touchpoint.reply) {
      parts.push(`reply "${touchpoint.reply}"`);
    }
    lines.push(parts.join(", "));
  }

  return lines.join("\n");
}

export function getRecentCheckInReplies(day: FocusDay, limit = 3): string[] {
  return Object.entries(day.touchpoints)
    .filter(([, touchpoint]) => touchpoint.reply)
    .sort(([, a], [, b]) => (a.replyAt ?? a.sentAt).localeCompare(b.replyAt ?? b.sentAt))
    .slice(-limit)
    .map(([, touchpoint]) => touchpoint.reply as string);
}
