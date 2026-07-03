import { promises as fs } from "node:fs";
import path from "node:path";
import type { BillingBalance, CustomerRecord, RevenueStats, ServiceStats, ServiceUsage } from "../../types.js";

const DATA_DIR = path.join(process.cwd(), "data", "income-services");
const USAGE_LOG = path.join(DATA_DIR, "usage.jsonl");
const REVENUE_FILE = path.join(DATA_DIR, "revenue.json");
const CUSTOMERS_FILE = path.join(DATA_DIR, "customers.json");
const PAYMENTS_FILE = path.join(DATA_DIR, "payments.json");

type CustomersStore = Record<string, CustomerRecord>;
type PaymentsStore = Record<string, { customerId: string; credits: number; processedAt: string }>;

async function ensureDataDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

function normalizeCustomerRecord(record: Partial<CustomerRecord> & { apiKey: string }): CustomerRecord {
  return {
    apiKey: record.apiKey,
    createdAt: record.createdAt ?? new Date().toISOString(),
    enabled: record.enabled ?? true,
    creditsBalance: record.creditsBalance ?? 0,
    stripeCustomerId: record.stripeCustomerId,
    email: record.email,
    lastTopUpAt: record.lastTopUpAt,
  };
}

async function readCustomers(): Promise<CustomersStore> {
  await ensureDataDir();
  try {
    const content = await fs.readFile(CUSTOMERS_FILE, "utf-8");
    const parsed = JSON.parse(content) as Record<string, Partial<CustomerRecord> & { apiKey: string }>;
    const customers: CustomersStore = {};
    for (const [customerId, record] of Object.entries(parsed)) {
      customers[customerId] = normalizeCustomerRecord(record);
    }
    return customers;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {};
    }
    throw error;
  }
}

async function writeCustomers(customers: CustomersStore): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(CUSTOMERS_FILE, JSON.stringify(customers, null, 2));
}

async function readPayments(): Promise<PaymentsStore> {
  await ensureDataDir();
  try {
    const content = await fs.readFile(PAYMENTS_FILE, "utf-8");
    return JSON.parse(content) as PaymentsStore;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {};
    }
    throw error;
  }
}

async function writePayments(payments: PaymentsStore): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(PAYMENTS_FILE, JSON.stringify(payments, null, 2));
}

function createApiKeyValue(): string {
  return `sag_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
}

function createCustomerId(): string {
  return `cust_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
}

export async function logServiceUsage(usage: ServiceUsage): Promise<void> {
  await ensureDataDir();
  const line = JSON.stringify(usage) + "\n";
  await fs.appendFile(USAGE_LOG, line, "utf-8");
}

export async function getRevenueStats(weeklyGoal = 200): Promise<RevenueStats> {
  await ensureDataDir();
  
  try {
    const content = await fs.readFile(USAGE_LOG, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);
    const usages: ServiceUsage[] = lines.map(line => JSON.parse(line));
    
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());
    
    const startOfLastWeek = new Date(startOfWeek);
    startOfLastWeek.setDate(startOfWeek.getDate() - 7);
    
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    
    const todayRevenue = usages
      .filter(u => u.success && new Date(u.timestamp) >= today)
      .reduce((sum, u) => sum + u.revenue, 0);
    
    const yesterdayRevenue = usages
      .filter(u => u.success && new Date(u.timestamp) >= yesterday && new Date(u.timestamp) < today)
      .reduce((sum, u) => sum + u.revenue, 0);
    
    const thisWeekRevenue = usages
      .filter(u => u.success && new Date(u.timestamp) >= startOfWeek)
      .reduce((sum, u) => sum + u.revenue, 0);
    
    const lastWeekRevenue = usages
      .filter(u => u.success && new Date(u.timestamp) >= startOfLastWeek && new Date(u.timestamp) < startOfWeek)
      .reduce((sum, u) => sum + u.revenue, 0);
    
    const thisMonthRevenue = usages
      .filter(u => u.success && new Date(u.timestamp) >= startOfMonth)
      .reduce((sum, u) => sum + u.revenue, 0);
    
    const lastMonthRevenue = usages
      .filter(u => u.success && new Date(u.timestamp) >= startOfLastMonth && new Date(u.timestamp) < startOfMonth)
      .reduce((sum, u) => sum + u.revenue, 0);
    
    const allTimeRevenue = usages
      .filter(u => u.success)
      .reduce((sum, u) => sum + u.revenue, 0);
    
    const daysIntoWeek = now.getDay() || 7;
    const daysRemaining = 7 - daysIntoWeek;
    const weeklyProgress = (thisWeekRevenue / weeklyGoal) * 100;
    
    return {
      today: todayRevenue,
      yesterday: yesterdayRevenue,
      thisWeek: thisWeekRevenue,
      lastWeek: lastWeekRevenue,
      thisMonth: thisMonthRevenue,
      lastMonth: lastMonthRevenue,
      allTime: allTimeRevenue,
      weeklyGoal,
      weeklyProgress,
      daysUntilGoal: daysRemaining,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {
        today: 0,
        yesterday: 0,
        thisWeek: 0,
        lastWeek: 0,
        thisMonth: 0,
        lastMonth: 0,
        allTime: 0,
        weeklyGoal,
        weeklyProgress: 0,
        daysUntilGoal: 7,
      };
    }
    throw error;
  }
}

export async function getServiceStats(): Promise<ServiceStats[]> {
  await ensureDataDir();
  
  try {
    const content = await fs.readFile(USAGE_LOG, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);
    const usages: ServiceUsage[] = lines.map(line => JSON.parse(line));
    
    const statsByService = new Map<string, ServiceStats>();
    
    for (const usage of usages) {
      const existing = statsByService.get(usage.serviceId) || {
        serviceId: usage.serviceId,
        totalCalls: 0,
        successfulCalls: 0,
        failedCalls: 0,
        totalRevenue: 0,
        totalCost: 0,
        totalProfit: 0,
        averageProfit: 0,
      };
      
      existing.totalCalls += 1;
      if (usage.success) {
        existing.successfulCalls += 1;
        existing.totalRevenue += usage.revenue;
        existing.totalCost += usage.cost;
        existing.totalProfit += usage.profit;
      } else {
        existing.failedCalls += 1;
      }
      existing.lastUsed = usage.timestamp;
      existing.averageProfit = existing.successfulCalls > 0 
        ? existing.totalProfit / existing.successfulCalls 
        : 0;
      
      statsByService.set(usage.serviceId, existing);
    }
    
    return Array.from(statsByService.values()).sort((a, b) => b.totalProfit - a.totalProfit);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

export async function getRecentFailures(limit = 10): Promise<ServiceUsage[]> {
  await ensureDataDir();
  
  try {
    const content = await fs.readFile(USAGE_LOG, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);
    const usages: ServiceUsage[] = lines.map(line => JSON.parse(line));
    
    return usages
      .filter(u => !u.success)
      .slice(-limit)
      .reverse();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

export async function createCustomer(email?: string): Promise<string> {
  const customers = await readCustomers();
  const customerId = createCustomerId();
  customers[customerId] = {
    apiKey: createApiKeyValue(),
    createdAt: new Date().toISOString(),
    enabled: true,
    creditsBalance: 0,
    email,
  };
  await writeCustomers(customers);
  return customerId;
}

export async function ensureCustomer(customerId: string, email?: string): Promise<string> {
  const customers = await readCustomers();
  if (!customers[customerId]) {
    customers[customerId] = {
      apiKey: createApiKeyValue(),
      createdAt: new Date().toISOString(),
      enabled: true,
      creditsBalance: 0,
      email,
    };
    await writeCustomers(customers);
  } else if (email && !customers[customerId].email) {
    customers[customerId].email = email;
    await writeCustomers(customers);
  }
  return customerId;
}

export async function getCustomer(customerId: string): Promise<CustomerRecord | undefined> {
  const customers = await readCustomers();
  return customers[customerId];
}

export async function getCustomerBalance(customerId: string): Promise<BillingBalance | undefined> {
  const customer = await getCustomer(customerId);
  if (!customer) {
    return undefined;
  }

  return {
    customerId,
    creditsBalance: customer.creditsBalance,
    enabled: customer.enabled,
    createdAt: customer.createdAt,
    lastTopUpAt: customer.lastTopUpAt,
  };
}

export async function generateAPIKey(customerId: string): Promise<string> {
  const customers = await readCustomers();
  const existing = customers[customerId];
  const key = createApiKeyValue();

  customers[customerId] = normalizeCustomerRecord({
    ...existing,
    apiKey: key,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    enabled: true,
    creditsBalance: existing?.creditsBalance ?? 0,
    stripeCustomerId: existing?.stripeCustomerId,
    email: existing?.email,
    lastTopUpAt: existing?.lastTopUpAt,
  });

  await writeCustomers(customers);
  return key;
}

export async function getCustomerByApiKey(
  key: string,
): Promise<{ customerId: string; record: CustomerRecord } | undefined> {
  const customers = await readCustomers();

  for (const [customerId, customer] of Object.entries(customers)) {
    if (customer.apiKey === key && customer.enabled) {
      return { customerId, record: customer };
    }
  }

  return undefined;
}

export async function validateAPIKey(key: string): Promise<boolean> {
  const customer = await getCustomerByApiKey(key);
  return Boolean(customer);
}

export async function hasSufficientCredits(customerId: string, amount: number): Promise<boolean> {
  const customer = await getCustomer(customerId);
  if (!customer || !customer.enabled) {
    return false;
  }
  return customer.creditsBalance >= amount;
}

export async function deductCredits(customerId: string, amount: number): Promise<number> {
  if (amount <= 0) {
    const customer = await getCustomer(customerId);
    return customer?.creditsBalance ?? 0;
  }

  const customers = await readCustomers();
  const customer = customers[customerId];
  if (!customer || !customer.enabled) {
    throw new Error("Customer not found or disabled");
  }

  customer.creditsBalance = Math.max(0, customer.creditsBalance - amount);
  customers[customerId] = customer;
  await writeCustomers(customers);
  return customer.creditsBalance;
}

export async function addCredits(
  customerId: string,
  amount: number,
  paymentId: string,
  options?: { stripeCustomerId?: string; email?: string },
): Promise<{ creditsBalance: number; alreadyProcessed: boolean }> {
  const payments = await readPayments();
  if (payments[paymentId]) {
    const customer = await getCustomer(customerId);
    return {
      creditsBalance: customer?.creditsBalance ?? 0,
      alreadyProcessed: true,
    };
  }

  const customers = await readCustomers();
  let customer = customers[customerId];
  if (!customer) {
    customer = {
      apiKey: createApiKeyValue(),
      createdAt: new Date().toISOString(),
      enabled: true,
      creditsBalance: 0,
      email: options?.email,
    };
    customers[customerId] = customer;
  }

  customer.creditsBalance += amount;
  customer.lastTopUpAt = new Date().toISOString();
  if (options?.stripeCustomerId) {
    customer.stripeCustomerId = options.stripeCustomerId;
  }
  if (options?.email) {
    customer.email = options.email;
  }

  customers[customerId] = customer;
  payments[paymentId] = {
    customerId,
    credits: amount,
    processedAt: new Date().toISOString(),
  };

  await writeCustomers(customers);
  await writePayments(payments);

  return {
    creditsBalance: customer.creditsBalance,
    alreadyProcessed: false,
  };
}

export async function chargeCustomerForUsage(customerId: string, amount: number): Promise<void> {
  if (amount <= 0) {
    return;
  }
  await deductCredits(customerId, amount);
}

function isBillingActive(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
}

export async function logAndChargeServiceUsage(usage: ServiceUsage): Promise<void> {
  await logServiceUsage(usage);
  if (usage.success && usage.customerId && usage.revenue > 0 && isBillingActive()) {
    await chargeCustomerForUsage(usage.customerId, usage.revenue);
  }
}
