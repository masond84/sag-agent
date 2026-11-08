/**
 * Backward-compatible migration from z-sync/goals.json to z-sync/goals/*.json
 * 
 * Preserves existing history and data while enabling the new schema.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Goal as LegacyGoal, GoalsFile } from "../zsync/store.js";
import type { Goal } from "./schema.js";
import { saveGoal } from "./store.js";

const LEGACY_GOALS_FILE = path.resolve(process.cwd(), "z-sync/goals.json");

interface MigrationResult {
  migrated: number;
  errors: Array<{ goalId: string; message: string }>;
}

function migrateLegacyGoal(legacy: LegacyGoal, meta: { updatedAt: string; updatedBy: "z" | "sag" }): Goal {
  const now = new Date().toISOString();
  
  return {
    id: legacy.id,
    name: legacy.name,
    status: legacy.status,
    target: {
      type: legacy.target !== undefined ? "number" : "milestone",
      value: legacy.target,
      description: legacy.notes || "No description provided",
    },
    measurement: {
      current: null,
      measuredAt: null,
      source: undefined,
      stale: true,
      missing: true,
    },
    nextAction: {
      description: "Pending migration - needs initial action definition",
      ownerOfNextInput: "sag",
    },
    loopId: null,
    notes: legacy.notes,
    createdAt: meta.updatedAt,
    updatedAt: meta.updatedAt,
    updatedBy: meta.updatedBy,
  };
}

export async function migrateGoalsFromLegacy(): Promise<MigrationResult> {
  const result: MigrationResult = {
    migrated: 0,
    errors: [],
  };

  try {
    const raw = await readFile(LEGACY_GOALS_FILE, "utf8");
    const legacyFile = JSON.parse(raw) as GoalsFile;

    for (const legacyGoal of legacyFile.goals) {
      try {
        const newGoal = migrateLegacyGoal(legacyGoal, {
          updatedAt: legacyFile.updatedAt,
          updatedBy: legacyFile.updatedBy,
        });
        await saveGoal(newGoal);
        result.migrated++;
      } catch (error) {
        result.errors.push({
          goalId: legacyGoal.id,
          message: String(error),
        });
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return result;
    }
    throw error;
  }

  return result;
}

export async function hasLegacyGoalsFile(): Promise<boolean> {
  try {
    await readFile(LEGACY_GOALS_FILE, "utf8");
    return true;
  } catch {
    return false;
  }
}
