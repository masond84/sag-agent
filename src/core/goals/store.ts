/**
 * Goal store - file-based persistence for individual goals in z-sync/goals/
 */
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Goal } from "./schema.js";
import { validateGoal } from "./schema.js";

export const GOALS_DIR = path.resolve(process.cwd(), "z-sync/goals");

export interface LoadGoalResult {
  goal: Goal | null;
  errors: Array<{ field: string; message: string }>;
}

export async function loadGoal(goalId: string): Promise<LoadGoalResult> {
  try {
    const filePath = path.join(GOALS_DIR, `${goalId}.json`);
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    
    const errors = validateGoal(parsed);
    if (errors.length > 0) {
      return { goal: null, errors };
    }

    return { goal: parsed as Goal, errors: [] };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { goal: null, errors: [{ field: "file", message: `Goal ${goalId} not found` }] };
    }
    return { goal: null, errors: [{ field: "file", message: String(error) }] };
  }
}

export async function loadAllGoals(): Promise<Goal[]> {
  try {
    const files = await readdir(GOALS_DIR);
    const goalFiles = files.filter(f => f.endsWith(".json"));
    
    const results = await Promise.all(
      goalFiles.map(async (file) => {
        const goalId = file.replace(/\.json$/, "");
        const result = await loadGoal(goalId);
        return result.goal;
      })
    );

    return results.filter((g): g is Goal => g !== null);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

export async function saveGoal(goal: Goal): Promise<void> {
  const errors = validateGoal(goal);
  if (errors.length > 0) {
    throw new Error(`Goal validation failed: ${errors.map(e => `${e.field}: ${e.message}`).join(", ")}`);
  }

  await mkdir(GOALS_DIR, { recursive: true });
  const filePath = path.join(GOALS_DIR, `${goal.id}.json`);
  await writeFile(filePath, JSON.stringify(goal, null, 2) + "\n", "utf8");
}

export async function goalExists(goalId: string): Promise<boolean> {
  const result = await loadGoal(goalId);
  return result.goal !== null;
}
