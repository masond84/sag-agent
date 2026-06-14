import { randomUUID } from "node:crypto";
import { runDevAgent } from "./agent.js";
import { refreshWorkerAfterMerge } from "./restart.js";
import {
  acquireDevLock, isDevRunnerEnabled, isDevRunLocked, pickNextTrigger,
  queueManualDevTask, queuePostMergeScan, recordDevRun, releaseDevLock, type DevTrigger,
} from "./state.js";

export interface DevCycleResult {
  brief: string;
  notify: boolean;
  trigger: DevTrigger;
  mergedPrs: number[];
}

export async function runDevCycle(force = false): Promise<DevCycleResult | null> {
  if (!isDevRunnerEnabled()) return null;
  if (!force && (await isDevRunLocked())) return null;

  const trigger = force ? (await pickNextTrigger()) ?? { kind: "manual" as const, task: "Autonomous audit.", queuedAt: new Date().toISOString() } : await pickNextTrigger();
  if (!trigger) return null;
  if (!(await acquireDevLock())) return null;

  const startedAt = new Date().toISOString();
  try {
    const result = await runDevAgent(trigger);
    for (const n of result.mergedPrs) await queuePostMergeScan(n);
    if (result.mergedPrs.length > 0) await refreshWorkerAfterMerge();
    const brief = result.brief;
    await recordDevRun({ id: randomUUID(), startedAt, finishedAt: new Date().toISOString(), trigger, brief, mergedPrs: result.mergedPrs, branch: result.branch, filesChanged: result.filesChanged });
    return { brief, notify: result.mergedPrs.length > 0 || result.filesChanged.length > 0, trigger, mergedPrs: result.mergedPrs };
  } finally {
    await releaseDevLock();
  }
}

export async function queueAndRunDevTask(task: string): Promise<DevCycleResult | null> {
  await queueManualDevTask(task);
  return runDevCycle(true);
}
