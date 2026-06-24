import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DATA_DIR = path.resolve(process.cwd(), "data");
const STATE_FILE = path.join(DATA_DIR, "processed-messages.json");
const DEFAULT_PROCESSED_MESSAGE_ID_LIMIT = 1_000;

function getProcessedMessageIdLimit(): number {
  const raw = process.env.PROCESSED_MESSAGE_ID_LIMIT;
  if (!raw) {
    return DEFAULT_PROCESSED_MESSAGE_ID_LIMIT;
  }

  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_PROCESSED_MESSAGE_ID_LIMIT;
}

export const PROCESSED_MESSAGE_ID_LIMIT = getProcessedMessageIdLimit();

interface AgentState {
  messageIds: string[];
  lastRunAt?: string;
  lastHeartbeatReportAt?: string;
  lastWatchdogAlertAt?: string;
  lastMorningBriefingDate?: string;
  lastReflectionAt?: string;
}

async function ensureDataDir(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
}

function normalizeMessageIds(messageIds: string[]): string[] {
  const seen = new Set<string>();
  const recentUniqueIds: string[] = [];

  for (let index = messageIds.length - 1; index >= 0; index -= 1) {
    const messageId = messageIds[index];
    if (!messageId || seen.has(messageId)) {
      continue;
    }

    seen.add(messageId);
    recentUniqueIds.push(messageId);
    if (recentUniqueIds.length >= PROCESSED_MESSAGE_ID_LIMIT) {
      break;
    }
  }

  return recentUniqueIds.reverse();
}

function normalizeState(state: AgentState): AgentState {
  return {
    ...state,
    messageIds: normalizeMessageIds(Array.isArray(state.messageIds) ? state.messageIds : []),
  };
}

async function readState(): Promise<AgentState> {
  await ensureDataDir();
  try {
    const raw = await readFile(STATE_FILE, "utf8");
    return normalizeState(JSON.parse(raw) as AgentState);
  } catch {
    return { messageIds: [] };
  }
}

async function writeState(state: AgentState): Promise<void> {
  await ensureDataDir();
  await writeFile(STATE_FILE, JSON.stringify(normalizeState(state), null, 2));
}

export async function hasProcessed(messageId: string): Promise<boolean> {
  const state = await readState();
  return state.messageIds.includes(messageId);
}

export async function markProcessed(messageId: string): Promise<void> {
  const state = await readState();
  if (!state.messageIds.includes(messageId)) {
    state.messageIds.push(messageId);
  }
  state.lastRunAt = new Date().toISOString();
  await writeState(state);
}

export async function touchWorkerRun(): Promise<void> {
  const state = await readState();
  state.lastRunAt = new Date().toISOString();
  await writeState(state);
}

export async function getLastRunAt(): Promise<string | undefined> {
  const state = await readState();
  return state.lastRunAt;
}

export async function getProcessedMessageCount(): Promise<number> {
  const state = await readState();
  return state.messageIds.length;
}

export async function getLastHeartbeatReportAt(): Promise<string | undefined> {
  const state = await readState();
  return state.lastHeartbeatReportAt;
}

export async function markHeartbeatReported(): Promise<void> {
  const state = await readState();
  state.lastHeartbeatReportAt = new Date().toISOString();
  await writeState(state);
}

export async function getLastWatchdogAlertAt(): Promise<string | undefined> {
  const state = await readState();
  return state.lastWatchdogAlertAt;
}

export async function markWatchdogAlerted(): Promise<void> {
  const state = await readState();
  state.lastWatchdogAlertAt = new Date().toISOString();
  await writeState(state);
}

export async function getLastMorningBriefingDate(): Promise<string | undefined> {
  const state = await readState();
  return state.lastMorningBriefingDate;
}

export async function markMorningBriefingSent(dateKey: string): Promise<void> {
  const state = await readState();
  state.lastMorningBriefingDate = dateKey;
  await writeState(state);
}

export async function getLastReflectionAt(): Promise<string | undefined> {
  const state = await readState();
  return state.lastReflectionAt;
}

export async function markReflectionCompleted(slotKey: string): Promise<void> {
  const state = await readState();
  state.lastReflectionAt = slotKey;
  await writeState(state);
}
