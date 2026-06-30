import { randomUUID } from "node:crypto";
import type { LinearIssueRef } from "../orchestrator/linear-client.js";
import { isCursorOrchestratorMode } from "../orchestrator/config.js";
import { runOrchestratorCycle } from "../orchestrator/runner.js";
import { runDevAgent } from "./agent.js";
import {
  acquireDevLock, isDevRunnerEnabled, isDevRunLocked, pickNextTrigger,
  recordDevRun, releaseDevLock, type DevTrigger,
} from "./state.js";

export interface DevCycleResult {
  brief: string;
  notify: boolean;
  trigger: DevTrigger;
  mergedPrs: number[];
  linearIssue?: LinearIssueRef;
}

export async function runDevCycle(force = false): Promise<DevCycleResult | null> {
  if (!isDevRunnerEnabled()) return null;
  if (!force && (await isDevRunLocked())) return null;

  const trigger = force
    ? (await pickNextTrigger()) ?? { kind: "manual" as const, task: "Autonomous audit.", queuedAt: new Date().toISOString() }
    : await pickNextTrigger();
  if (!trigger) return null;
  if (!(await acquireDevLock())) return null;

  const startedAt = new Date().toISOString();
  try {
    if (isCursorOrchestratorMode()) {
      const result = await runOrchestratorCycle(trigger);
      await recordDevRun({
        id: randomUUID(),
        startedAt,
        finishedAt: new Date().toISOString(),
        trigger,
        brief: result.brief,
        mergedPrs: result.mergedPrs,
        filesChanged: [],
      });
      return {
        brief: result.brief,
        notify: result.notify,
        trigger,
        mergedPrs: result.mergedPrs,
        linearIssue: result.linearIssue,
      };
    }

    const result = await runDevAgent(trigger);
    await recordDevRun({
      id: randomUUID(),
      startedAt,
      finishedAt: new Date().toISOString(),
      trigger,
      brief: result.brief,
      mergedPrs: result.mergedPrs,
      branch: result.branch,
      filesChanged: result.filesChanged,
    });
    return {
      brief: result.brief,
      notify: result.mergedPrs.length > 0 || result.filesChanged.length > 0,
      trigger,
      mergedPrs: result.mergedPrs,
    };
  } finally {
    await releaseDevLock();
  }
}
