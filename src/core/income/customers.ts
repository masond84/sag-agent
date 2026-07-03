import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { CustomerRecord } from "../../types.js";

const DATA_DIR = path.join(process.cwd(), "data", "income-services");
const CUSTOMERS_FILE = path.join(DATA_DIR, "customers.json");

export class InsufficientCreditsError extends Error {
  constructor(required: number, available: number) {
    super(`Insufficient credits: need $${required.toFixed(2)}, have $${available.toFixed(2)}`);
    this.name = "InsufficientCreditsError";
  }
}

export class CustomerNotFoundError extends Error {
  constructor(customerId: string) {
    super(`Customer not found: ${customerId}`);
    this.name = "CustomerNotFoundError";
  }
}

async function ensureDataDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function loadCustomers(): Promise<Record<string, CustomerRecord>> {
  await ensureDataDir();
  try {
    const content = await fs.readFile(CUSTOMERS_FILE, "utf-8");
    const parsed = JSON.parse(content) as Record<string, Partial<CustomerRecord>>;
    const normalized: Record<string, CustomerRecord> = {};
    for (const [customerId, record] of Object.entries(parsed)) {
      normalized[customerId] = normalizeCustomerRecord(record);
    }
    return normalized;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {};
    }
    throw error;
  }
}

async function saveCustomers(customers: Record<string, CustomerRecord>): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(CUSTOMERS_FILE, JSON.stringify(customers, null, 2));
}

function normalizeCustomerRecord(record: Partial<CustomerRecord>): CustomerRecord {
  return {
    apiKey: record.apiKey ?? "",
    createdAt: record.createdAt ?? new Date().toISOString(),
    enabled: record.enabled ?? true,
    email: record.email,
    creditsBalance: roundCredits(record.creditsBalance ?? 0),
    totalPurchased: roundCredits(record.totalPurchased ?? 0),
    stripeCustomerId: record.stripeCustomerId,
    lastPurchaseAt: record.lastPurchaseAt,
  };
}

function roundCredits(amount: number): number {
  return Math.round(amount * 100) / 100;
}

export function createCustomerId(): string {
  return `cust_${Date.now()}_${randomBytes(4).toString("hex")}`;
}

export function generateApiKeyValue(): string {
  return `sag_${Date.now()}_${randomBytes(12).toString("hex")}`;
}

export async function createCustomer(options?: {
  customerId?: string;
  email?: string;
  stripeCustomerId?: string;
  withApiKey?: boolean;
}): Promise<{ customerId: string; apiKey: string; customer: CustomerRecord }> {
  const customers = await loadCustomers();
  const customerId = options?.customerId ?? createCustomerId();
  if (customers[customerId]) {
    throw new Error(`Customer already exists: ${customerId}`);
  }
  const apiKey = options?.withApiKey === false ? "" : generateApiKeyValue();
  const customer: CustomerRecord = {
    apiKey,
    createdAt: new Date().toISOString(),
    enabled: true,
    email: options?.email,
    creditsBalance: 0,
    totalPurchased: 0,
    stripeCustomerId: options?.stripeCustomerId,
  };
  customers[customerId] = customer;
  await saveCustomers(customers);
  return { customerId, apiKey, customer };
}

export async function getCustomer(customerId: string): Promise<CustomerRecord | null> {
  const customers = await loadCustomers();
  return customers[customerId] ?? null;
}

export async function findCustomerByApiKey(apiKey: string): Promise<{ customerId: string; customer: CustomerRecord } | null> {
  if (!apiKey) {
    return null;
  }

  const customers = await loadCustomers();
  for (const [customerId, customer] of Object.entries(customers)) {
    if (customer.apiKey === apiKey && customer.enabled) {
      return { customerId, customer };
    }
  }
  return null;
}

export async function validateAPIKey(apiKey: string): Promise<boolean> {
  const match = await findCustomerByApiKey(apiKey);
  return match !== null;
}

export async function generateAPIKey(customerId: string): Promise<string> {
  const customers = await loadCustomers();
  const existing = customers[customerId];
  if (!existing) {
    throw new CustomerNotFoundError(customerId);
  }

  const apiKey = generateApiKeyValue();
  customers[customerId] = {
    ...existing,
    apiKey,
  };
  await saveCustomers(customers);
  return apiKey;
}

export async function ensureCustomerApiKey(customerId: string): Promise<string> {
  const customers = await loadCustomers();
  const existing = customers[customerId];
  if (!existing) {
    throw new CustomerNotFoundError(customerId);
  }

  if (existing.apiKey) {
    return existing.apiKey;
  }

  const apiKey = generateApiKeyValue();
  customers[customerId] = {
    ...existing,
    apiKey,
  };
  await saveCustomers(customers);
  return apiKey;
}

export async function addCredits(
  customerId: string,
  amountUsd: number,
  options?: { stripeCustomerId?: string; email?: string },
): Promise<CustomerRecord> {
  const customers = await loadCustomers();
  const existing = customers[customerId];
  if (!existing) {
    throw new CustomerNotFoundError(customerId);
  }

  const credits = roundCredits(amountUsd);
  const updated: CustomerRecord = {
    ...existing,
    creditsBalance: roundCredits(existing.creditsBalance + credits),
    totalPurchased: roundCredits(existing.totalPurchased + credits),
    lastPurchaseAt: new Date().toISOString(),
    stripeCustomerId: options?.stripeCustomerId ?? existing.stripeCustomerId,
    email: options?.email ?? existing.email,
  };
  customers[customerId] = updated;
  await saveCustomers(customers);
  return updated;
}

export async function debitCredits(customerId: string, amountUsd: number): Promise<CustomerRecord> {
  const customers = await loadCustomers();
  const existing = customers[customerId];
  if (!existing) {
    throw new CustomerNotFoundError(customerId);
  }

  const amount = roundCredits(amountUsd);
  if (existing.creditsBalance < amount) {
    throw new InsufficientCreditsError(amount, existing.creditsBalance);
  }

  const updated: CustomerRecord = {
    ...existing,
    creditsBalance: roundCredits(existing.creditsBalance - amount),
  };
  customers[customerId] = updated;
  await saveCustomers(customers);
  return updated;
}

export async function ensureMinimumCredits(customerId: string, minimumUsd = 0.01): Promise<void> {
  const customer = await getCustomer(customerId);
  if (!customer) {
    throw new CustomerNotFoundError(customerId);
  }
  if (customer.creditsBalance < minimumUsd) {
    throw new InsufficientCreditsError(minimumUsd, customer.creditsBalance);
  }
}

export async function grantTestCredits(
  customerId: string,
  amountUsd: number,
): Promise<CustomerRecord> {
  return addCredits(customerId, amountUsd);
}
