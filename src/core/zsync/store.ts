/**
 * z-sync store — typed access to the shared Muse<->SAG state in `z-sync/`.
 *
 * These files are committed to git on purpose: git is the sync bus between
 * the two agents. Every write must refresh `updatedAt`/`updatedBy`.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getZonedTimeInfo } from "../schedule.js";

export const ZSYNC_DIR = path.resolve(process.cwd(), "z-sync");

export interface SyncMeta {
  updatedAt: string;
  updatedBy: "z" | "sag";
}

export interface Bill {
  id: string;
  name: string;
  /** USD, or null when unknown (see amountNote). */
  amount: number | null;
  amountNote?: string;
  /** Monthly due day (1-31), or null when not on a fixed monthly schedule. */
  dueDay: number | null;
  /** ISO date of the latest due occurrence covered, or null. */
  paidThrough: string | null;
  verified: boolean;
}

export interface Subscription {
  name: string;
  amount: number;
}

export interface BillsFile extends SyncMeta {
  bills: Bill[];
  subscriptions: Subscription[];
  subscriptionsNote?: string;
}

export interface Goal {
  id: string;
  name: string;
  status: "active" | "proposed" | "paused" | "done";
  target?: number;
  notes?: string;
}

export interface GoalsFile extends SyncMeta {
  goals: Goal[];
}

export interface FinanceAccount {
  name: string;
  balance: number;
  available?: number;
}

export interface FinanceFile extends SyncMeta {
  asOf: string;
  note?: string;
  accounts: FinanceAccount[];
  liabilities?: { name: string; balance: number; note?: string }[];
  totalLinked?: number;
  floor?: {
    target: number;
    total: number;
    accounts: string[];
    note?: string;
  };
}

export interface JobTarget {
  company: string;
  role: string;
  status: "researching" | "drafting" | "contacted" | "interviewing" | "rejected" | "archived";
  pay?: string;
  source?: string;
  contact?: string;
  contactedAt?: string;
  closes?: string;
  notes?: string;
}

export interface JobPipelineFile extends SyncMeta {
  targets: JobTarget[];
  listDepth?: number;
  rules: string[];
}

export interface BdLead {
  company: string;
  contact?: string;
  fitScore?: number;
  status: "new" | "drafted" | "sent" | "replied" | "dead";
  notes?: string;
}

export interface DeftBdFile extends SyncMeta {
  status: string;
  cadence?: string;
  idealClient?: string;
  stack: string[];
  rules: string[];
  leads: BdLead[];
}

export async function loadZSyncFile<T>(name: string): Promise<T | null> {
  try {
    const raw = await readFile(path.join(ZSYNC_DIR, name), "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function saveZSyncFile(name: string, data: unknown): Promise<void> {
  await mkdir(ZSYNC_DIR, { recursive: true });
  await writeFile(path.join(ZSYNC_DIR, name), JSON.stringify(data, null, 2) + "\n", "utf8");
}

export const loadGoals = () => loadZSyncFile<GoalsFile>("goals.json");
export const loadBills = () => loadZSyncFile<BillsFile>("bills.json");
export const loadFinance = () => loadZSyncFile<FinanceFile>("finance.json");
export const loadJobPipeline = () => loadZSyncFile<JobPipelineFile>("job-pipeline.json");
export const loadDeftBd = () => loadZSyncFile<DeftBdFile>("deft-bd.json");

export interface BillOccurrence {
  bill: Bill;
  /** YYYY-MM-DD of the next due occurrence in the given timezone. */
  dueDateKey: string;
  daysUntil: number;
  paid: boolean;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getDate();
}

/**
 * Next due occurrence for a monthly bill, computed in the given timezone.
 * Bills without a dueDay return null (shown in the digest, never alerted).
 */
export function nextBillOccurrence(bill: Bill, timeZone: string): BillOccurrence | null {
  if (!bill.dueDay) {
    return null;
  }
  const now = getZonedTimeInfo(timeZone);
  const [y, m, d] = now.dateKey.split("-").map(Number);

  const clamp = (year: number, month: number) =>
    Math.min(bill.dueDay as number, daysInMonth(year, month));

  let year = y;
  let month = m;
  let day = clamp(year, month);
  if (d >= day) {
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
    day = clamp(year, month);
  }

  const dueDateKey = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const msPerDay = 86_400_000;
  const todayUtc = Date.UTC(y, m - 1, d);
  const dueUtc = Date.UTC(year, month - 1, day);
  const daysUntil = Math.round((dueUtc - todayUtc) / msPerDay);
  const paid = !!bill.paidThrough && bill.paidThrough >= dueDateKey;

  return { bill, dueDateKey, daysUntil, paid };
}

export function formatUsd(value: number | null): string {
  if (value === null || value === undefined) {
    return "amount TBD";
  }
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
