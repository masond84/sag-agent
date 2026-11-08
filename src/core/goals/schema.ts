/**
 * Typed schema for goals in the growing-brain system.
 * Each goal is a separate file in z-sync/goals/ with typed validation.
 */

export type GoalOwner = "sag" | "devin" | "z";

export type GoalStatus = "active" | "proposed" | "paused" | "done";

export interface GoalTarget {
  type: "number" | "date" | "milestone";
  value?: number | string;
  unit?: string;
  description: string;
}

export interface GoalMeasurement {
  current?: number | string | null;
  measuredAt?: string | null;
  source?: string;
  stale?: boolean;
  missing?: boolean;
}

export interface GoalNextAction {
  description: string;
  ownerOfNextInput: GoalOwner;
}

export interface Goal {
  id: string;
  name: string;
  status: GoalStatus;
  target: GoalTarget;
  measurement: GoalMeasurement;
  nextAction: GoalNextAction;
  loopId: string | null;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  updatedBy: "z" | "sag";
}

export interface GoalValidationError {
  field: string;
  message: string;
}

export function validateGoal(goal: unknown): GoalValidationError[] {
  const errors: GoalValidationError[] = [];

  if (!goal || typeof goal !== "object") {
    errors.push({ field: "root", message: "Goal must be an object" });
    return errors;
  }

  const g = goal as Record<string, unknown>;

  if (!g.id || typeof g.id !== "string" || !/^[a-z0-9-]+$/.test(g.id)) {
    errors.push({ field: "id", message: "id must be a lowercase kebab-case string" });
  }

  if (!g.name || typeof g.name !== "string") {
    errors.push({ field: "name", message: "name is required and must be a string" });
  }

  if (!["active", "proposed", "paused", "done"].includes(g.status as string)) {
    errors.push({ field: "status", message: "status must be active|proposed|paused|done" });
  }

  if (!g.target || typeof g.target !== "object") {
    errors.push({ field: "target", message: "target is required" });
  } else {
    const target = g.target as Record<string, unknown>;
    if (!["number", "date", "milestone"].includes(target.type as string)) {
      errors.push({ field: "target.type", message: "target.type must be number|date|milestone" });
    }
    if (!target.description || typeof target.description !== "string") {
      errors.push({ field: "target.description", message: "target.description is required" });
    }
  }

  if (!g.measurement || typeof g.measurement !== "object") {
    errors.push({ field: "measurement", message: "measurement is required" });
  }

  if (!g.nextAction || typeof g.nextAction !== "object") {
    errors.push({ field: "nextAction", message: "nextAction is required" });
  } else {
    const nextAction = g.nextAction as Record<string, unknown>;
    if (!nextAction.description || typeof nextAction.description !== "string") {
      errors.push({ field: "nextAction.description", message: "nextAction.description is required" });
    }
    if (!["sag", "devin", "z"].includes(nextAction.ownerOfNextInput as string)) {
      errors.push({ field: "nextAction.ownerOfNextInput", message: "ownerOfNextInput must be sag|devin|z" });
    }
  }

  if (g.loopId !== null && (typeof g.loopId !== "string" || !/^[a-z0-9-]+$/.test(g.loopId))) {
    errors.push({ field: "loopId", message: "loopId must be null or a lowercase kebab-case string" });
  }

  if (!g.updatedAt || typeof g.updatedAt !== "string") {
    errors.push({ field: "updatedAt", message: "updatedAt is required" });
  }

  if (!["z", "sag"].includes(g.updatedBy as string)) {
    errors.push({ field: "updatedBy", message: "updatedBy must be z|sag" });
  }

  return errors;
}
