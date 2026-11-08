/**
 * Ledger store - monthly AI cost tracking with subscriptions and returns.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { MonthlyLedger, Subscription, LaneCost, AttributableReturn } from "./schema.js";
import { validateSubscription, validateLaneCost } from "./schema.js";

const LEDGER_DIR = path.resolve(process.cwd(), "data/ledger");

export function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function getLedgerPath(month: string): string {
  return path.join(LEDGER_DIR, `${month}.json`);
}

export async function loadLedger(month: string): Promise<MonthlyLedger | null> {
  try {
    const filePath = getLedgerPath(month);
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw) as MonthlyLedger;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export async function saveLedger(ledger: MonthlyLedger): Promise<void> {
  for (const sub of ledger.subscriptions) {
    const errors = validateSubscription(sub);
    if (errors.length > 0) {
      throw new Error(`Subscription ${sub.name} validation failed: ${errors.map(e => e.message).join(", ")}`);
    }
  }

  for (const lane of ledger.laneCosts) {
    const errors = validateLaneCost(lane);
    if (errors.length > 0) {
      throw new Error(`Lane ${lane.laneId} validation failed: ${errors.map(e => e.message).join(", ")}`);
    }
  }

  await mkdir(LEDGER_DIR, { recursive: true });
  const filePath = getLedgerPath(ledger.month);
  await writeFile(filePath, JSON.stringify(ledger, null, 2) + "\n", "utf8");
}

export async function initializeLedgerForMonth(month: string): Promise<MonthlyLedger> {
  const existing = await loadLedger(month);
  if (existing) {
    return existing;
  }

  const ledger: MonthlyLedger = {
    month,
    subscriptions: [],
    laneCosts: [],
    returns: [],
    summary: {
      totalSubscriptionsUsd: 0,
      totalEstimatedApiUsd: 0,
      totalKnownCostUsd: 0,
      totalUnknownCost: false,
      incompleteCoverage: [],
      totalCashReturnUsd: 0,
      timeSavedHours: 0,
      costAvoidedUsd: 0,
      uncategorizedLanes: [],
    },
    generatedAt: new Date().toISOString(),
    updatedBy: "sag",
  };

  return ledger;
}

export function calculateLedgerSummary(ledger: MonthlyLedger): MonthlyLedger["summary"] {
  const totalSubscriptionsUsd = ledger.subscriptions
    .filter(s => s.status === "active")
    .reduce((sum, s) => sum + s.monthlyCostUsd, 0);

  const totalEstimatedApiUsd = ledger.laneCosts
    .filter(l => l.apiUsage)
    .reduce((sum, l) => sum + (l.apiUsage?.estimatedMonthlyUsd || 0), 0);

  const totalKnownCostUsd = ledger.laneCosts
    .filter(l => l.monthlyCostUsd !== null)
    .reduce((sum, l) => sum + (l.monthlyCostUsd || 0), 0);

  const totalUnknownCost = ledger.laneCosts.some(l => l.monthlyCostUsd === null && l.estimatedOnly);

  const incompleteCoverage = ledger.laneCosts
    .filter(l => l.monthlyCostUsd === null || l.estimatedOnly)
    .map(l => l.name);

  const totalCashReturnUsd = ledger.returns
    .filter(r => r.type === "cash-revenue" && r.amountUsd)
    .reduce((sum, r) => sum + (r.amountUsd || 0), 0);

  const timeSavedHours = ledger.returns
    .filter(r => r.type === "time-saved" && r.timeHours)
    .reduce((sum, r) => sum + (r.timeHours || 0), 0);

  const costAvoidedUsd = ledger.returns
    .filter(r => r.type === "cost-avoided" && r.amountUsd)
    .reduce((sum, r) => sum + (r.amountUsd || 0), 0);

  const uncategorizedLanes = ledger.laneCosts
    .filter(l => !l.costType || l.costType === "capped" && !l.hardCapUsd)
    .map(l => l.laneId);

  return {
    totalSubscriptionsUsd,
    totalEstimatedApiUsd,
    totalKnownCostUsd,
    totalUnknownCost,
    incompleteCoverage,
    totalCashReturnUsd,
    timeSavedHours,
    costAvoidedUsd,
    uncategorizedLanes,
  };
}

export async function updateLedgerSummary(month: string): Promise<MonthlyLedger> {
  const ledger = await loadLedger(month);
  if (!ledger) {
    throw new Error(`Ledger for ${month} not found`);
  }

  ledger.summary = calculateLedgerSummary(ledger);
  ledger.generatedAt = new Date().toISOString();
  
  await saveLedger(ledger);
  return ledger;
}
