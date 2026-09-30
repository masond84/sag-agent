/**
 * zsync — the shared-state loop between Muse (Z) and SAG.
 *
 * Reads the committed `z-sync/` files (goals, bills, finance snapshot,
 * job pipeline, Deft Point BD) and surfaces what needs attention:
 *   - bill-due alerts (unpaid bills due within ZSYNC_BILL_ALERT_DAYS)
 *   - a daily digest: floor status, upcoming bills, pipeline, BD, self-funding
 *
 * Runtime dedup state lives in gitignored `data/zsync-state.json`.
 * The `z-sync/` source files themselves are the shared contract — see
 * z-sync/README.md.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { logActivity } from "../../core/activity-log.js";
import { getZonedTimeInfo, hasReachedDailyTime } from "../../core/schedule.js";
import { getSelfFundingStatus } from "../../core/income/self-funding.js";
import {
  formatUsd,
  loadBills,
  loadDeftBd,
  loadFinance,
  loadGoals,
  loadJobPipeline,
  nextBillOccurrence,
  type BillOccurrence,
} from "../../core/zsync/store.js";
import type { AgentHealthContext, ScheduledSkill, ScheduledSkillResult } from "../../types.js";

const STATE_PATH = path.resolve(process.cwd(), "data/zsync-state.json");

interface ZSyncState {
  lastDigestDate?: string;
  alerted: Record<string, string>;
}

function isEnabled(): boolean {
  return (process.env.ZSYNC_ENABLED ?? "true").toLowerCase() === "true";
}

function getTimeZone(): string {
  return process.env.ZSYNC_TIMEZONE?.trim() || "America/New_York";
}

function getDigestTime(): string {
  return process.env.ZSYNC_DIGEST_TIME?.trim() || "08:00";
}

function getBillAlertDays(): number {
  const parsed = Number(process.env.ZSYNC_BILL_ALERT_DAYS ?? "3");
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 3;
}

async function loadState(): Promise<ZSyncState> {
  try {
    return JSON.parse(await readFile(STATE_PATH, "utf8")) as ZSyncState;
  } catch {
    return { alerted: {} };
  }
}

async function saveState(state: ZSyncState): Promise<void> {
  await mkdir(path.dirname(STATE_PATH), { recursive: true });
  await writeFile(STATE_PATH, JSON.stringify(state, null, 2), "utf8");
}

function describeBill(occ: BillOccurrence): string {
  const when =
    occ.daysUntil === 0
      ? "due today"
      : occ.daysUntil === 1
        ? "due tomorrow"
        : `due in ${occ.daysUntil}d (${occ.dueDateKey})`;
  const unverified = occ.bill.verified ? "" : " (amount unverified)";
  return `• ${occ.bill.name}: ${formatUsd(occ.bill.amount)} — ${when}${unverified}`;
}

async function buildBillAlert(
  state: ZSyncState,
  timeZone: string,
): Promise<ScheduledSkillResult | null> {
  const alertDays = getBillAlertDays();
  const billsFile = await loadBills();
  if (!billsFile) {
    return null;
  }

  const now = getZonedTimeInfo(timeZone);
  const due: BillOccurrence[] = [];
  for (const bill of billsFile.bills) {
    const occ = nextBillOccurrence(bill, timeZone);
    if (!occ || occ.paid) {
      continue;
    }
    const key = `${bill.id}:${occ.dueDateKey}`;
    if (occ.daysUntil >= 0 && occ.daysUntil <= alertDays && !state.alerted[key]) {
      state.alerted[key] = now.dateKey;
      due.push(occ);
    }
  }

  if (due.length === 0) {
    return null;
  }

  await saveState(state);
  await logActivity("zsync_bill_alert", `Bill alert: ${due.map((o) => o.bill.name).join(", ")}`);

  return {
    type: "alert",
    bypassDryRun: true,
    message: `Z-SYNC BILL ALERT\n${due.map(describeBill).join("\n")}`,
  };
}

async function buildDigest(timeZone: string): Promise<string> {
  const now = getZonedTimeInfo(timeZone);
  const lines: string[] = [`Z-SYNC DAILY DIGEST — ${now.weekday} ${now.dateKey}`, ""];

  const [finance, billsFile, goalsFile, pipeline, bd] = await Promise.all([
    loadFinance(),
    loadBills(),
    loadGoals(),
    loadJobPipeline(),
    loadDeftBd(),
  ]);

  if (finance?.floor) {
    const pct = Math.round((finance.floor.total / finance.floor.target) * 100);
    lines.push(
      `Floor: ${formatUsd(finance.floor.total)} / ${formatUsd(finance.floor.target)} (${pct}%)`,
    );
  }
  if (finance?.asOf) {
    lines.push(`Balances as of ${finance.asOf}.`);
  }
  lines.push("");

  if (billsFile) {
    const upcoming = billsFile.bills
      .map((b) => nextBillOccurrence(b, timeZone))
      .filter((o): o is BillOccurrence => !!o && !o.paid && o.daysUntil >= 0 && o.daysUntil <= 7)
      .sort((a, b) => a.daysUntil - b.daysUntil);
    lines.push("Bills (next 7d):");
    lines.push(...(upcoming.length ? upcoming.map(describeBill) : ["• none due"]));
    const noSchedule = billsFile.bills.filter((b) => !b.dueDay);
    for (const b of noSchedule) {
      lines.push(`• ${b.name}: ${formatUsd(b.amount)} — no fixed due day`);
    }
    lines.push("");
  }

  if (pipeline) {
    const active = pipeline.targets.filter((t) => !["rejected", "archived"].includes(t.status));
    lines.push(`Job pipeline: ${active.length} active${pipeline.listDepth ? ` (list depth ${pipeline.listDepth})` : ""}`);
    for (const t of active.slice(0, 4)) {
      lines.push(`• ${t.company} — ${t.role} [${t.status}]`);
    }
    lines.push("");
  }

  if (bd) {
    const openLeads = bd.leads.filter((l) => !["sent", "replied", "dead"].includes(l.status));
    lines.push(`Deft Point BD: ${bd.status}${openLeads.length ? ` — ${openLeads.length} open leads` : " — no leads yet"}`);
    lines.push("");
  }

  if (goalsFile) {
    const active = goalsFile.goals.filter((g) => g.status === "active");
    lines.push(`Goals active: ${active.map((g) => g.name).join(" · ")}`);
    lines.push("");
  }

  try {
    const funding = await getSelfFundingStatus();
    lines.push(
      `Self-funding: ${formatUsd(funding.revenueThisWeek)} API revenue this week vs ${formatUsd(funding.weeklyCostUsd)} weekly cost — ${funding.covered ? `covered (${formatUsd(funding.surplus)} surplus)` : `${formatUsd(-funding.surplus)} short`}`,
    );
  } catch {
    // self-funding figures are best-effort in the digest
  }

  return lines.join("\n");
}

async function runZSync(_context: AgentHealthContext): Promise<ScheduledSkillResult | null> {
  if (!isEnabled()) {
    return null;
  }

  const timeZone = getTimeZone();
  const state = await loadState();

  const alert = await buildBillAlert(state, timeZone);
  if (alert) {
    return alert;
  }

  const now = getZonedTimeInfo(timeZone);
  if (!hasReachedDailyTime(timeZone, getDigestTime(), state.lastDigestDate)) {
    return null;
  }

  state.lastDigestDate = now.dateKey;
  await saveState(state);
  await logActivity("zsync_digest", `Daily z-sync digest sent (${now.dateKey})`);

  return {
    type: "briefing",
    bypassDryRun: true,
    message: await buildDigest(timeZone),
  };
}

export const zsyncSkill: ScheduledSkill = {
  kind: "scheduled",
  config: {
    id: "zsync",
    name: "Z-Sync",
    enabled: true,
    kind: "scheduled",
  },
  run: runZSync,
};

export { buildDigest, nextBillOccurrence };
