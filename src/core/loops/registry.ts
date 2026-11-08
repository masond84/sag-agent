/**
 * Loop registry - manages all goal loops and their execution.
 */
import type { LoopConfig, LoopRunner } from "./types.js";

const loops = new Map<string, LoopRunner>();

export function registerLoop(runner: LoopRunner): void {
  if (loops.has(runner.config.id)) {
    throw new Error(`Loop ${runner.config.id} is already registered`);
  }
  loops.set(runner.config.id, runner);
}

export function getLoop(loopId: string): LoopRunner | undefined {
  return loops.get(loopId);
}

export function getAllLoops(): LoopRunner[] {
  return Array.from(loops.values());
}

export function getActiveLoops(): LoopRunner[] {
  return Array.from(loops.values()).filter(
    runner => runner.config.enabled && runner.config.status === "active"
  );
}

export function getLoopForGoal(goalId: string): LoopRunner | undefined {
  return Array.from(loops.values()).find(
    runner => runner.config.goalId === goalId
  );
}

export function clearRegistry(): void {
  loops.clear();
}
