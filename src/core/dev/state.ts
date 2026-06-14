import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DATA_DIR = path.resolve(process.cwd(), "data");
const DEV_STATE_FILE = path.join(DATA_DIR, "dev-runner.json");

export type DevTriggerKind = "post_merge" | "cadence" | "manual";

export interface DevTrigger {
  kind: DevTriggerKind;
  prNumber?: number;
  prTitle?: string;
  task?: string;
  queuedAt: string;
}

export interface DevRunRecord {
  id: string;
  startedAt: string;
  finishedAt: string;
  trigger: DevTrigger;
  brief: string;
  mergedPrs: number[];
  branch?: string;
  filesChanged: string[];
}

interface DevRunnerState {
  lastDevRunAt?: string;
  lastCadenceRunAt?: string;
  runningSince?: string;
  pendingTriggers: DevTrigger[];
  postMergeQueue: Array<{ prNumber: number; mergedAt: string; title?: string }>;
  recentRuns: DevRunRecord[];
}

async function readDevState(): Promise<DevRunnerState> {
  await mkdir(DATA_DIR, { recursive: true });
  try {
    return JSON.parse(await readFile(DEV_STATE_FILE, "utf8")) as DevRunnerState;
  } catch {
    return { pendingTriggers: [], postMergeQueue: [], recentRuns: [] };
  }
}

async function writeDevState(state: DevRunnerState): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(DEV_STATE_FILE, JSON.stringify(state, null, 2));
}

export function isDevRunnerEnabled(): boolean {
  return (process.env.DEV_RUNNER_ENABLED ?? "false").toLowerCase() === "true";
}

export function getDevAuditIntervalMs(): number {
  return Number(process.env.DEV_AUDIT_INTERVAL_MS ?? 21_600_000);
}

export async function isDevRunLocked(): Promise<boolean> {
  const state = await readDevState();
  if (!state.runningSince) {
    return false;
  }
  const elapsed = Date.now() - new Date(state.runningSince).getTime();
  return elapsed <= Number(process.env.DEV_RUN_TIMEOUT_MS ?? 1_800_000);
}

export async function acquireDevLock(): Promise<boolean> {
  const state = await readDevState();
  if (state.runningSince) {
    const elapsed = Date.now() - new Date(state.runningSince).getTime();
    if (elapsed <= Number(process.env.DEV_RUN_TIMEOUT_MS ?? 1_800_000)) {
      return false;
    }
  }
  state.runningSince = new Date().toISOString();
  await writeDevState(state);
  return true;
}

export async function releaseDevLock(): Promise<void> {
  const state = await readDevState();
  delete state.runningSince;
  await writeDevState(state);
}

export async function queueManualDevTask(task: string): Promise<void> {
  const state = await readDevState();
  state.pendingTriggers.push({
    kind: "manual",
    task: task.trim(),
    queuedAt: new Date().toISOString(),
  });
  await writeDevState(state);
}

export async function queuePostMergeScan(prNumber: number, title?: string): Promise<void> {
  const state = await readDevState();
  if (!state.postMergeQueue.some((item) => item.prNumber === prNumber)) {
    state.postMergeQueue.push({ prNumber, mergedAt: new Date().toISOString(), title });
  }
  if (state.pendingTriggers.some((t) => t.kind === "post_merge" && t.prNumber === prNumber)) {
    await writeDevState(state);
    return;
  }
  state.pendingTriggers.push({
    kind: "post_merge",
    prNumber,
    prTitle: title,
    queuedAt: new Date().toISOString(),
  });
  await writeDevState(state);
}

export async function pickNextTrigger(): Promise<DevTrigger | null> {
  const state = await readDevState();
  if (state.pendingTriggers.length > 0) {
    const [next, ...rest] = state.pendingTriggers;
    state.pendingTriggers = rest;
    await writeDevState(state);
    return next;
  }
  const cadenceMs = getDevAuditIntervalMs();
  const lastCadence = state.lastCadenceRunAt ? new Date(state.lastCadenceRunAt).getTime() : 0;
  if (Date.now() - lastCadence >= cadenceMs) {
    state.lastCadenceRunAt = new Date().toISOString();
    await writeDevState(state);
    return { kind: "cadence", queuedAt: new Date().toISOString() };
  }
  return null;
}

export async function recordDevRun(record: DevRunRecord): Promise<void> {
  const state = await readDevState();
  state.lastDevRunAt = record.finishedAt;
  state.recentRuns = [record, ...state.recentRuns].slice(0, 20);
  if (record.mergedPrs.length > 0) {
    state.postMergeQueue = state.postMergeQueue.filter((item) => !record.mergedPrs.includes(item.prNumber));
  }
  await writeDevState(state);
}

export async function getDevRunnerSummary(): Promise<string> {
  const state = await readDevState();
  const lines = [
    `Last dev run: ${state.lastDevRunAt ?? "never"}`,
    `Pending triggers: ${state.pendingTriggers.length}`,
    `Post-merge queue: ${state.postMergeQueue.map((i) => `#${i.prNumber}`).join(", ") || "none"}`,
    `Running: ${state.runningSince ? "yes" : "no"}`,
  ];
  if (state.recentRuns[0]) {
    lines.push("", "Most recent evolution:", state.recentRuns[0].brief.slice(0, 400));
  }
  return lines.join("\n");
}
