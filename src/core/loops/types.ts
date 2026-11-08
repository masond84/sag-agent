/**
 * Loop types for the growing-brain system.
 * 
 * Each loop reads state, compares against target, performs reversible prep,
 * surfaces ONE owned next action, and updates the scoreboard.
 */
import type { Goal } from "../goals/schema.js";

export type LoopStatus = "pending" | "active" | "paused" | "error";

export interface LoopConfig {
  id: string;
  name: string;
  description: string;
  goalId: string;
  status: LoopStatus;
  schedule?: string;
  enabled: boolean;
}

export interface LoopContext {
  goal: Goal;
  dryRun: boolean;
  timeZone: string;
}

export interface LoopAction {
  description: string;
  type: "report" | "draft" | "prepare" | "alert";
  ownerOfNextInput: "sag" | "devin" | "z";
  payload?: Record<string, unknown>;
}

export interface LoopResult {
  loopId: string;
  goalId: string;
  success: boolean;
  action?: LoopAction;
  error?: string;
  measurements?: Record<string, unknown>;
  staleData?: string[];
  missingData?: string[];
  executedAt: string;
}

export interface LoopExecution {
  loopId: string;
  startedAt: string;
  completedAt?: string;
  result?: LoopResult;
  dryRun: boolean;
}

export interface LoopRunner {
  config: LoopConfig;
  run(context: LoopContext): Promise<LoopResult>;
}
