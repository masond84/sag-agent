/**
 * Loop executor - runs loops with proper error handling, dry-run support,
 * idempotency, and state persistence.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadGoal } from "../goals/store.js";
import type { LoopContext, LoopExecution, LoopResult, LoopRunner } from "./types.js";

const STATE_DIR = path.resolve(process.cwd(), "data/loops");

export interface LoopExecutionState {
  executions: LoopExecution[];
  lastSuccessfulRun?: {
    loopId: string;
    executedAt: string;
    result: LoopResult;
  };
}

async function loadLoopState(loopId: string): Promise<LoopExecutionState> {
  try {
    const filePath = path.join(STATE_DIR, `${loopId}.json`);
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw) as LoopExecutionState;
  } catch {
    return { executions: [] };
  }
}

async function saveLoopState(loopId: string, state: LoopExecutionState): Promise<void> {
  await mkdir(STATE_DIR, { recursive: true });
  const filePath = path.join(STATE_DIR, `${loopId}.json`);
  await writeFile(filePath, JSON.stringify(state, null, 2) + "\n", "utf8");
}

export async function executeLoop(
  runner: LoopRunner,
  options: { dryRun: boolean; timeZone?: string }
): Promise<LoopResult> {
  const { dryRun, timeZone = "America/New_York" } = options;
  const startedAt = new Date().toISOString();

  const execution: LoopExecution = {
    loopId: runner.config.id,
    startedAt,
    dryRun,
  };

  try {
    const goalResult = await loadGoal(runner.config.goalId);
    if (!goalResult.goal) {
      throw new Error(
        `Goal ${runner.config.goalId} not found: ${goalResult.errors.map(e => e.message).join(", ")}`
      );
    }

    const context: LoopContext = {
      goal: goalResult.goal,
      dryRun,
      timeZone,
    };

    const result = await runner.run(context);
    result.executedAt = new Date().toISOString();

    execution.completedAt = result.executedAt;
    execution.result = result;

    const state = await loadLoopState(runner.config.id);
    state.executions.push(execution);
    
    if (result.success && !dryRun) {
      state.lastSuccessfulRun = {
        loopId: runner.config.id,
        executedAt: result.executedAt,
        result,
      };
    }

    if (state.executions.length > 100) {
      state.executions = state.executions.slice(-100);
    }

    await saveLoopState(runner.config.id, state);

    return result;
  } catch (error) {
    const errorResult: LoopResult = {
      loopId: runner.config.id,
      goalId: runner.config.goalId,
      success: false,
      error: String(error),
      executedAt: new Date().toISOString(),
    };

    execution.completedAt = errorResult.executedAt;
    execution.result = errorResult;

    const state = await loadLoopState(runner.config.id);
    state.executions.push(execution);
    await saveLoopState(runner.config.id, state);

    return errorResult;
  }
}

export async function getLastSuccessfulRun(loopId: string): Promise<LoopResult | null> {
  const state = await loadLoopState(loopId);
  return state.lastSuccessfulRun?.result ?? null;
}

export async function getLoopExecutionHistory(
  loopId: string,
  limit = 10
): Promise<LoopExecution[]> {
  const state = await loadLoopState(loopId);
  return state.executions.slice(-limit);
}
