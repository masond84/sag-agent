import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DATA_DIR = path.resolve(process.cwd(), "data");
const LIFE_STATE_FILE = path.join(DATA_DIR, "companion-life.json");

export interface LifeSlot {
  hour: number;
  minute: number;
  sent: boolean;
}

interface LifeCompanionState {
  dateKey: string;
  slots: LifeSlot[];
  lifeCount: number;
  lastLifeSentAt?: string;
}

function getDailyCap(): number {
  return Math.min(Math.max(Number(process.env.LIFE_COMPANION_DAILY_CAP ?? 5) || 5, 1), 10);
}

function getMinGapMinutes(): number {
  return Math.min(Math.max(Number(process.env.LIFE_COMPANION_MIN_GAP_MINUTES ?? 90) || 90, 30), 240);
}

function getWindowStartHour(): number {
  return Number(process.env.LIFE_COMPANION_WINDOW_START ?? 8);
}

function getWindowEndHour(): number {
  return Number(process.env.LIFE_COMPANION_WINDOW_END ?? 22);
}

function minutesFromHourMinute(hour: number, minute: number): number {
  return hour * 60 + minute;
}

function generateEvenlySpacedSlots(cap: number, startHour: number, endHour: number, minGap: number): LifeSlot[] {
  const startMin = startHour * 60;
  const endMin = endHour * 60;
  const span = endMin - startMin;
  const step = Math.max(minGap, Math.floor(span / cap));

  const slots: LifeSlot[] = [];
  for (let index = 0; index < cap; index += 1) {
    const totalMin = Math.min(startMin + step * index + 17, endMin - 1);
    slots.push({
      hour: Math.floor(totalMin / 60),
      minute: totalMin % 60,
      sent: false,
    });
  }

  return slots;
}

function generateRandomSlots(cap: number, startHour: number, endHour: number, minGap: number): LifeSlot[] {
  const startMin = startHour * 60;
  const endMin = endHour * 60;

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const picks: number[] = [];
    while (picks.length < cap) {
      picks.push(startMin + Math.floor(Math.random() * (endMin - startMin)));
    }
    picks.sort((a, b) => a - b);

    let valid = true;
    for (let index = 1; index < picks.length; index += 1) {
      if (picks[index]! - picks[index - 1]! < minGap) {
        valid = false;
        break;
      }
    }

    if (valid && picks[0]! - startMin >= 0 && endMin - picks[picks.length - 1]! >= 0) {
      return picks.map((totalMin) => ({
        hour: Math.floor(totalMin / 60),
        minute: totalMin % 60,
        sent: false,
      }));
    }
  }

  return generateEvenlySpacedSlots(cap, startHour, endHour, minGap);
}

async function readState(): Promise<LifeCompanionState | null> {
  try {
    const raw = await readFile(LIFE_STATE_FILE, "utf8");
    return JSON.parse(raw) as LifeCompanionState;
  } catch {
    return null;
  }
}

async function writeState(state: LifeCompanionState): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(LIFE_STATE_FILE, JSON.stringify(state, null, 2));
}

export async function ensureLifeSlotsForDay(dateKey: string): Promise<LifeCompanionState> {
  const existing = await readState();
  if (existing?.dateKey === dateKey && existing.slots.length > 0) {
    return existing;
  }

  const cap = getDailyCap();
  const slots = generateRandomSlots(cap, getWindowStartHour(), getWindowEndHour(), getMinGapMinutes());
  const state: LifeCompanionState = { dateKey, slots, lifeCount: 0 };
  await writeState(state);
  return state;
}

export async function getDueLifeSlot(
  dateKey: string,
  hour: number,
  minute: number,
): Promise<LifeSlot | null> {
  const state = await ensureLifeSlotsForDay(dateKey);
  const currentMin = minutesFromHourMinute(hour, minute);

  for (const slot of state.slots) {
    if (slot.sent) {
      continue;
    }

    const slotMin = minutesFromHourMinute(slot.hour, slot.minute);
    if (slotMin === currentMin) {
      return slot;
    }
  }

  return null;
}

export async function markLifeSlotSent(dateKey: string, slot: LifeSlot): Promise<void> {
  const state = await ensureLifeSlotsForDay(dateKey);
  const match = state.slots.find(
    (entry) => entry.hour === slot.hour && entry.minute === slot.minute,
  );

  if (match) {
    match.sent = true;
  }

  state.lifeCount += 1;
  state.lastLifeSentAt = new Date().toISOString();
  await writeState(state);
}

export async function getLifeCompanionPreview(dateKey: string): Promise<LifeCompanionState> {
  return ensureLifeSlotsForDay(dateKey);
}
