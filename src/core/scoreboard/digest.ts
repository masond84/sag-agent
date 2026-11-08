/**
 * Delta-based scoreboard digest.
 * 
 * Shows changes since the last successful digest run rather than
 * activity summaries. Includes missing/stale measurements and single
 * owned next action per goal.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadAllGoals } from "../goals/store.js";
import { loadLedger, getCurrentMonth } from "../ledger/store.js";
import { loadBills, type BillOccurrence, nextBillOccurrence, formatUsd } from "../zsync/store.js";
import { getZonedTimeInfo } from "../schedule.js";
import type { Goal } from "../goals/schema.js";

const SCOREBOARD_STATE_PATH = path.resolve(process.cwd(), "data/scoreboard-state.json");

interface ScoreboardSnapshot {
  goals: Record<string, {
    status: string;
    currentValue?: string | number | null;
    measuredAt?: string | null;
    stale?: boolean;
    missing?: boolean;
    nextAction: string;
    owner: string;
  }>;
  bills: {
    nextDue?: string;
    unpaidCount: number;
  };
  ledger?: {
    month: string;
    totalKnownCostUsd: number;
    totalCashReturnUsd: number;
    incompleteCoverage: number;
  };
}

interface ScoreboardState {
  lastDigestDate?: string;
  lastSuccessfulSnapshot?: ScoreboardSnapshot;
  updatedAt: string;
}

async function loadScoreboardState(): Promise<ScoreboardState> {
  try {
    const raw = await readFile(SCOREBOARD_STATE_PATH, "utf8");
    return JSON.parse(raw) as ScoreboardState;
  } catch {
    return {
      updatedAt: new Date().toISOString(),
    };
  }
}

async function saveScoreboardState(state: ScoreboardState): Promise<void> {
  await mkdir(path.dirname(SCOREBOARD_STATE_PATH), { recursive: true });
  state.updatedAt = new Date().toISOString();
  await writeFile(SCOREBOARD_STATE_PATH, JSON.stringify(state, null, 2) + "\n", "utf8");
}

function captureGoalSnapshot(goal: Goal): ScoreboardSnapshot["goals"][string] {
  return {
    status: goal.status,
    currentValue: goal.measurement.current,
    measuredAt: goal.measurement.measuredAt,
    stale: goal.measurement.stale,
    missing: goal.measurement.missing,
    nextAction: goal.nextAction.description,
    owner: goal.nextAction.ownerOfNextInput,
  };
}

function describeGoalDelta(
  goalId: string,
  current: ScoreboardSnapshot["goals"][string],
  previous?: ScoreboardSnapshot["goals"][string]
): string[] {
  const lines: string[] = [];

  if (!previous) {
    lines.push(`NEW: ${current.nextAction} [${current.owner}]`);
    if (current.stale) {
      lines.push("  (measurement is stale)");
    }
    if (current.missing) {
      lines.push("  (measurement missing - needs data collection)");
    }
    return lines;
  }

  if (current.status !== previous.status) {
    lines.push(`Status changed: ${previous.status} -> ${current.status}`);
  }

  if (current.currentValue !== previous.currentValue) {
    lines.push(`Value changed: ${previous.currentValue || "none"} -> ${current.currentValue || "none"}`);
  }

  if (current.nextAction !== previous.nextAction) {
    lines.push(`Next: ${current.nextAction} [${current.owner}]`);
  }

  if (!lines.length) {
    lines.push(`No change - ${current.nextAction} [${current.owner}]`);
  }

  if (current.stale && !previous.stale) {
    lines.push("  (measurement now stale)");
  }

  if (current.missing && !previous.missing) {
    lines.push("  (measurement now missing)");
  }

  return lines;
}

export async function buildDeltaDigest(timeZone: string): Promise<string> {
  const now = getZonedTimeInfo(timeZone);
  const state = await loadScoreboardState();
  const previous = state.lastSuccessfulSnapshot;

  const lines: string[] = [
    "SCOREBOARD DELTA DIGEST",
    `${now.weekday} ${now.dateKey}`,
    "",
  ];

  const goals = await loadAllGoals();
  const currentSnapshot: ScoreboardSnapshot = {
    goals: {},
    bills: { unpaidCount: 0 },
  };

  if (goals.length === 0) {
    lines.push("Goals: No goals loaded yet");
  } else {
    lines.push(`Goals (${goals.length} tracked):`);
    lines.push("");

    for (const goal of goals.filter(g => g.status === "active")) {
      const snapshot = captureGoalSnapshot(goal);
      currentSnapshot.goals[goal.id] = snapshot;

      const prevSnapshot = previous?.goals[goal.id];
      const delta = describeGoalDelta(goal.id, snapshot, prevSnapshot);

      lines.push(`${goal.name}:`);
      for (const line of delta) {
        lines.push(`  ${line}`);
      }
      lines.push("");
    }
  }

  const bills = await loadBills();
  if (bills) {
    const unpaid = bills.bills.filter(b => !b.paidThrough);
    currentSnapshot.bills.unpaidCount = unpaid.length;

    const upcoming = bills.bills
      .map((b) => nextBillOccurrence(b, timeZone))
      .filter((o): o is BillOccurrence => !!o && !o.paid && o.daysUntil >= 0 && o.daysUntil <= 7)
      .sort((a, b) => a.daysUntil - b.daysUntil);

    if (upcoming.length > 0) {
      currentSnapshot.bills.nextDue = upcoming[0].dueDateKey;
    }

    lines.push("Bills:");
    if (previous?.bills) {
      const unpaidDelta = currentSnapshot.bills.unpaidCount - previous.bills.unpaidCount;
      if (unpaidDelta > 0) {
        lines.push(`  ${unpaidDelta} more bills unpaid (now ${currentSnapshot.bills.unpaidCount})`);
      } else if (unpaidDelta < 0) {
        lines.push(`  ${Math.abs(unpaidDelta)} bills paid (${currentSnapshot.bills.unpaidCount} remain unpaid)`);
      } else {
        lines.push(`  ${currentSnapshot.bills.unpaidCount} bills unpaid (no change)`);
      }
    } else {
      lines.push(`  ${currentSnapshot.bills.unpaidCount} bills currently unpaid`);
    }

    if (upcoming.length > 0) {
      lines.push(`  Next due: ${upcoming[0].bill.name} on ${upcoming[0].dueDateKey}`);
    }
    lines.push("");
  }

  const month = getCurrentMonth();
  const ledger = await loadLedger(month);
  if (ledger) {
    currentSnapshot.ledger = {
      month: ledger.month,
      totalKnownCostUsd: ledger.summary.totalKnownCostUsd,
      totalCashReturnUsd: ledger.summary.totalCashReturnUsd,
      incompleteCoverage: ledger.summary.incompleteCoverage.length,
    };

    lines.push(`Ledger (${ledger.month}):`);
    if (previous?.ledger && previous.ledger.month === month) {
      const costDelta = currentSnapshot.ledger.totalKnownCostUsd - previous.ledger.totalKnownCostUsd;
      const returnDelta = currentSnapshot.ledger.totalCashReturnUsd - previous.ledger.totalCashReturnUsd;
      
      if (costDelta !== 0) {
        lines.push(`  Known costs ${costDelta > 0 ? "increased" : "decreased"} by ${formatUsd(Math.abs(costDelta))}`);
      }
      if (returnDelta !== 0) {
        lines.push(`  Cash returns ${returnDelta > 0 ? "increased" : "decreased"} by ${formatUsd(Math.abs(returnDelta))}`);
      }
      if (costDelta === 0 && returnDelta === 0) {
        lines.push("  No financial changes since last digest");
      }
    } else {
      lines.push(`  Known costs: ${formatUsd(currentSnapshot.ledger.totalKnownCostUsd)}`);
      lines.push(`  Cash returns: ${formatUsd(currentSnapshot.ledger.totalCashReturnUsd)}`);
    }

    if (currentSnapshot.ledger.incompleteCoverage > 0) {
      lines.push(`  ${currentSnapshot.ledger.incompleteCoverage} lanes with incomplete cost coverage`);
    }
    lines.push("");
  }

  if (!previous) {
    lines.push("(First digest - no previous baseline for comparison)");
  }

  state.lastSuccessfulSnapshot = currentSnapshot;
  await saveScoreboardState(state);

  return lines.join("\n");
}

export async function shouldSendDigest(timeZone: string, digestTime: string): Promise<boolean> {
  const state = await loadScoreboardState();
  const now = getZonedTimeInfo(timeZone);
  
  if (state.lastDigestDate === now.dateKey) {
    return false;
  }

  const [targetHour, targetMinute] = digestTime.split(":").map(Number);
  const targetMinutes = targetHour * 60 + targetMinute;

  return now.minutesSinceMidnight >= targetMinutes;
}

export async function markDigestSent(timeZone: string): Promise<void> {
  const state = await loadScoreboardState();
  const now = getZonedTimeInfo(timeZone);
  state.lastDigestDate = now.dateKey;
  await saveScoreboardState(state);
}
