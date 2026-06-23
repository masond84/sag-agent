import { readFile } from "node:fs/promises";
import path from "node:path";
import type { DevRunRecord, DevTrigger } from "./state.js";

export interface DevStateSnapshot {
  lastDevRunAt?: string;
  lastCadenceRunAt?: string;
  runningSince?: string;
  pendingTriggers: DevTrigger[];
  postMergeQueue: Array<{ prNumber: number; mergedAt: string; title?: string }>;
  recentRuns: DevRunRecord[];
}

const DEV_STATE_FILE = path.resolve(process.cwd(), "data/dev-runner.json");

export async function readDevStateSnapshot(): Promise<DevStateSnapshot> {
  try {
    return JSON.parse(await readFile(DEV_STATE_FILE, "utf8")) as DevStateSnapshot;
  } catch {
    return { pendingTriggers: [], postMergeQueue: [], recentRuns: [] };
  }
}
