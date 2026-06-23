import { isDevRunnerEnabled, isDevRunLocked } from "../dev/state.js";
import { readDevStateSnapshot } from "../dev/state-snapshot.js";
import { isCursorOrchestratorMode } from "../orchestrator/config.js";

export interface DevStatusPayload {
  enabled: boolean;
  orchestratorMode: "local" | "cursor" | "disabled";
  running: boolean;
  pendingCount: number;
  pending: Array<{
    kind: string;
    task?: string;
    queuedAt: string;
  }>;
  postMergeQueue: Array<{ prNumber: number; mergedAt: string; title?: string }>;
  lastRunAt?: string;
  recentBrief?: string;
  lastMergedPrs: number[];
}

export async function buildDevStatusPayload(): Promise<DevStatusPayload> {
  const enabled = isDevRunnerEnabled();
  if (!enabled) {
    return {
      enabled: false,
      orchestratorMode: "disabled",
      running: false,
      pendingCount: 0,
      pending: [],
      postMergeQueue: [],
      lastMergedPrs: [],
    };
  }

  const state = await readDevStateSnapshot();
  const running = await isDevRunLocked();
  const recent = state.recentRuns[0];

  return {
    enabled: true,
    orchestratorMode: isCursorOrchestratorMode() ? "cursor" : "local",
    running,
    pendingCount: state.pendingTriggers.length,
    pending: state.pendingTriggers.map((trigger) => ({
      kind: trigger.kind,
      task: trigger.task,
      queuedAt: trigger.queuedAt,
    })),
    postMergeQueue: state.postMergeQueue,
    lastRunAt: state.lastDevRunAt,
    recentBrief: recent?.brief?.slice(0, 500),
    lastMergedPrs: recent?.mergedPrs ?? [],
  };
}
