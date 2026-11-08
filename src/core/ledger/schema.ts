/**
 * Ledger schema for tracking AI costs, subscriptions, and returns.
 * 
 * Extends existing self-funding tracker to monthly all-AI costs per bot/lane
 * with earning/saving/capped classification.
 */

export type LaneCostType = "earning" | "saving" | "capped";

export interface Subscription {
  name: string;
  monthlyCostUsd: number;
  annualCostUsd?: number;
  provider: string;
  category: "llm-api" | "memory" | "infrastructure" | "tools" | "other";
  status: "active" | "cancelled" | "pending";
  startedAt: string;
  renewsAt?: string;
  notes?: string;
}

export interface LaneCost {
  laneId: string;
  botId?: string;
  name: string;
  costType: LaneCostType;
  monthlyCostUsd: number | null;
  hardCapUsd?: number;
  capSetBy?: "devin" | "z" | "sag";
  estimatedOnly: boolean;
  subscriptions?: string[];
  apiUsage?: {
    estimatedMonthlyUsd: number;
    provider: string;
    model?: string;
  };
  notes?: string;
}

export interface AttributableReturn {
  laneId: string;
  type: "cash-revenue" | "time-saved" | "cost-avoided";
  amountUsd?: number;
  timeHours?: number;
  description: string;
  proof?: string;
  measuredAt: string;
}

export interface MonthlyLedger {
  month: string;
  subscriptions: Subscription[];
  laneCosts: LaneCost[];
  returns: AttributableReturn[];
  summary: {
    totalSubscriptionsUsd: number;
    totalEstimatedApiUsd: number;
    totalKnownCostUsd: number;
    totalUnknownCost: boolean;
    incompleteCoverage: string[];
    totalCashReturnUsd: number;
    timeSavedHours: number;
    costAvoidedUsd: number;
    uncategorizedLanes: string[];
  };
  generatedAt: string;
  updatedBy: "z" | "sag";
}

export interface LedgerValidationError {
  field: string;
  message: string;
}

export function validateSubscription(sub: unknown): LedgerValidationError[] {
  const errors: LedgerValidationError[] = [];
  
  if (!sub || typeof sub !== "object") {
    errors.push({ field: "root", message: "Subscription must be an object" });
    return errors;
  }

  const s = sub as Record<string, unknown>;

  if (!s.name || typeof s.name !== "string") {
    errors.push({ field: "name", message: "name is required" });
  }

  if (typeof s.monthlyCostUsd !== "number" || s.monthlyCostUsd < 0) {
    errors.push({ field: "monthlyCostUsd", message: "monthlyCostUsd must be a non-negative number" });
  }

  if (!s.provider || typeof s.provider !== "string") {
    errors.push({ field: "provider", message: "provider is required" });
  }

  if (!["llm-api", "memory", "infrastructure", "tools", "other"].includes(s.category as string)) {
    errors.push({ field: "category", message: "category must be llm-api|memory|infrastructure|tools|other" });
  }

  if (!["active", "cancelled", "pending"].includes(s.status as string)) {
    errors.push({ field: "status", message: "status must be active|cancelled|pending" });
  }

  return errors;
}

export function validateLaneCost(lane: unknown): LedgerValidationError[] {
  const errors: LedgerValidationError[] = [];

  if (!lane || typeof lane !== "object") {
    errors.push({ field: "root", message: "LaneCost must be an object" });
    return errors;
  }

  const l = lane as Record<string, unknown>;

  if (!l.laneId || typeof l.laneId !== "string") {
    errors.push({ field: "laneId", message: "laneId is required" });
  }

  if (!l.name || typeof l.name !== "string") {
    errors.push({ field: "name", message: "name is required" });
  }

  if (!["earning", "saving", "capped"].includes(l.costType as string)) {
    errors.push({ field: "costType", message: "costType must be earning|saving|capped" });
  }

  if (l.monthlyCostUsd !== null && typeof l.monthlyCostUsd !== "number") {
    errors.push({ field: "monthlyCostUsd", message: "monthlyCostUsd must be a number or null" });
  }

  if (typeof l.estimatedOnly !== "boolean") {
    errors.push({ field: "estimatedOnly", message: "estimatedOnly must be a boolean" });
  }

  return errors;
}
