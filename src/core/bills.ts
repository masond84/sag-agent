import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ConserviceStatement } from "../types.js";

export interface StoredBill {
  savedAt: string;
  messageId: string;
  statement: ConserviceStatement;
}

const DATA_DIR = path.resolve(process.cwd(), "data");
const BILLS_FILE = path.join(DATA_DIR, "bills.json");

async function readBills(): Promise<StoredBill[]> {
  await mkdir(DATA_DIR, { recursive: true });
  try {
    const raw = await readFile(BILLS_FILE, "utf8");
    return JSON.parse(raw) as StoredBill[];
  } catch {
    return [];
  }
}

async function writeBills(bills: StoredBill[]): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(BILLS_FILE, JSON.stringify(bills, null, 2));
}

export async function saveBill(messageId: string, statement: ConserviceStatement): Promise<void> {
  const bills = await readBills();
  if (bills.some((bill) => bill.messageId === messageId)) {
    return;
  }

  bills.unshift({
    savedAt: new Date().toISOString(),
    messageId,
    statement,
  });

  await writeBills(bills.slice(0, 24));
}

export async function getLatestBill(): Promise<StoredBill | undefined> {
  const bills = await readBills();
  return bills[0];
}

export async function getBillHistory(limit = 5): Promise<StoredBill[]> {
  const bills = await readBills();
  return bills.slice(0, limit);
}

export function formatBillSummary(bill: StoredBill): string {
  const { statement } = bill;
  const lines = [
    `Property: ${statement.propertyName ?? "unknown"}`,
    `Due: ${statement.dueDate ?? "unknown"}`,
    `Account: ...${statement.accountSuffix ?? "?"}`,
    `Total: ${statement.totalCharge ?? "unknown"}`,
  ];

  for (const item of statement.lineItems) {
    const parts = [item.serviceType];
    if (item.servicePeriod) {
      parts.push(item.servicePeriod);
    }
    if (item.charge) {
      parts.push(item.charge);
    }
    lines.push(`- ${parts.join(" | ")}`);
  }

  return lines.join("\n");
}

export function compareToPrevious(current: StoredBill, previous?: StoredBill): string | null {
  if (!previous?.statement.totalCharge || !current.statement.totalCharge) {
    return null;
  }

  const parseTotal = (value: string) => Number(value.replace(/[^0-9.]/g, ""));
  const currentTotal = parseTotal(current.statement.totalCharge);
  const previousTotal = parseTotal(previous.statement.totalCharge);

  if (Number.isNaN(currentTotal) || Number.isNaN(previousTotal)) {
    return null;
  }

  const diff = currentTotal - previousTotal;
  const sign = diff > 0 ? "+" : "";
  return `Total changed ${sign}$${diff.toFixed(2)} vs previous bill (${previous.statement.totalCharge} → ${current.statement.totalCharge}).`;
}
