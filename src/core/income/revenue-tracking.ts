import { promises as fs } from "node:fs";
import path from "node:path";
import type { ServiceUsage, RevenueStats, ServiceStats } from "../../types.js";
import { debitCredits } from "./customers.js";

export {
  addCredits,
  createCustomer,
  debitCredits,
  ensureCustomerApiKey,
  ensureMinimumCredits,
  findCustomerByApiKey,
  generateAPIKey,
  getCustomer,
  grantTestCredits,
  InsufficientCreditsError,
  validateAPIKey,
} from "./customers.js";

const DATA_DIR = path.join(process.cwd(), "data", "income-services");
const USAGE_LOG = path.join(DATA_DIR, "usage.jsonl");

async function ensureDataDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

function shouldDebitCredits(): boolean {
  if (process.env.INCOME_DEBIT_CREDITS === "false") {
    return false;
  }
  if (process.env.INCOME_DEBIT_CREDITS === "true") {
    return true;
  }
  return Boolean(process.env.STRIPE_SECRET_KEY) || process.env.INCOME_API_KEY_REQUIRED === "true";
}

export async function logServiceUsage(usage: ServiceUsage): Promise<void> {
  await ensureDataDir();
  const line = JSON.stringify(usage) + "\n";
  await fs.appendFile(USAGE_LOG, line, "utf-8");

  if (usage.success && usage.customerId && usage.revenue > 0 && shouldDebitCredits()) {
    await debitCredits(usage.customerId, usage.revenue);
  }
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
