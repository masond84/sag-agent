import type { ScheduledSkill, ScheduledSkillResult, AgentHealthContext, IncomeGoalContext } from "../../types.js";
import { getRevenueStats, getServiceStats, getRecentFailures } from "../../core/income/revenue-tracking.js";
import { getEnabledServices } from "../../core/income/service-config.js";
import { logActivity } from "../../core/activity-log.js";

const WEEKLY_GOAL = Number(process.env.INCOME_WEEKLY_GOAL ?? 200);
const REPORT_INTERVAL_HOURS = Number(process.env.INCOME_REPORT_INTERVAL_HOURS ?? 24);

let lastReportAt = 0;

async function buildIncomeContext(): Promise<IncomeGoalContext> {
  const revenue = await getRevenueStats(WEEKLY_GOAL);
  const serviceStats = await getServiceStats();
  const recentFailures = await getRecentFailures(5);
  
  const topServices = serviceStats.slice(0, 5);
  
  const marketingNeeds: string[] = [];
  const developmentPriorities: Array<{
    task: string;
    impact: "high" | "medium" | "low";
    reason: string;
  }> = [];
  
  if (revenue.thisWeek < WEEKLY_GOAL * 0.5 && new Date().getDay() >= 4) {
    developmentPriorities.push({
      task: "Launch new high-margin service (translation or transcription API)",
      impact: "high",
      reason: `Behind pace: $${revenue.thisWeek.toFixed(2)}/$${WEEKLY_GOAL} this week`,
    });
    marketingNeeds.push("ProductHunt launch for new service");
  }
  
  if (topServices.length > 0) {
    const topService = topServices[0];
    if (topService.failedCalls > topService.successfulCalls * 0.1) {
      developmentPriorities.push({
        task: `Fix reliability issues in ${topService.serviceId}`,
        impact: "high",
        reason: `${topService.failedCalls} failures (${((topService.failedCalls / topService.totalCalls) * 100).toFixed(1)}% failure rate)`,
      });
    }
  }
  
  if (revenue.thisWeek > 0 && revenue.thisWeek < 20) {
    marketingNeeds.push("SEO content: Write 'Best Free PDF Tools 2026' article");
    marketingNeeds.push("Reddit post in r/sideproject about PDF service");
  }
  
  if (serviceStats.length < 3) {
    developmentPriorities.push({
      task: "Launch translation API (high-margin service)",
      impact: "high",
      reason: "Need more high-margin offerings to reach weekly goal",
    });
  }

  developmentPriorities.push({
    task: "Add Stripe payment flow for API credits",
    impact: "medium",
    reason: "Enable paid customers to purchase API usage",
  });
  
  if (marketingNeeds.length === 0) {
    marketingNeeds.push("Continue SEO content generation (1 article/week)");
  }
  
  return {
    weeklyGoal: WEEKLY_GOAL,
    currentWeekRevenue: revenue.thisWeek,
    gap: WEEKLY_GOAL - revenue.thisWeek,
    topServices,
    recentFailures,
    marketingNeeds,
    developmentPriorities,
  };
}

function formatIncomeReport(context: IncomeGoalContext, revenue: Awaited<ReturnType<typeof getRevenueStats>>): string {
  const parts: string[] = [];
  
  parts.push("API SERVICE BUSINESS REPORT");
  parts.push("");
  
  parts.push(`Weekly Goal: $${context.weeklyGoal}`);
  parts.push(`Current Week: $${revenue.thisWeek.toFixed(2)} (${revenue.weeklyProgress.toFixed(1)}%)`);
  parts.push(`Gap: $${context.gap.toFixed(2)} (${revenue.daysUntilGoal} days remaining)`);
  parts.push("");
  
  if (revenue.today > 0) {
    parts.push(`Today: $${revenue.today.toFixed(2)}`);
  }
  if (revenue.yesterday > 0) {
    parts.push(`Yesterday: $${revenue.yesterday.toFixed(2)}`);
  }
  parts.push(`All-time: $${revenue.allTime.toFixed(2)}`);
  parts.push("");
  
  if (context.topServices.length > 0) {
    parts.push("TOP SERVICES:");
    for (const svc of context.topServices.slice(0, 3)) {
      parts.push(
        `  ${svc.serviceId}: ${svc.successfulCalls} calls, $${svc.totalProfit.toFixed(2)} profit (avg $${svc.averageProfit.toFixed(2)}/call)`
      );
    }
    parts.push("");
  }
  
  if (context.recentFailures.length > 0) {
    parts.push(`RECENT FAILURES: ${context.recentFailures.length}`);
    for (const failure of context.recentFailures.slice(0, 2)) {
      parts.push(`  ${failure.serviceId}: ${failure.errorMessage || "Unknown error"}`);
    }
    parts.push("");
  }
  
  if (context.developmentPriorities.length > 0) {
    parts.push("DEV PRIORITIES:");
    for (const priority of context.developmentPriorities.slice(0, 3)) {
      parts.push(`  [${priority.impact.toUpperCase()}] ${priority.task}`);
      parts.push(`    Reason: ${priority.reason}`);
    }
    parts.push("");
  }
  
  if (context.marketingNeeds.length > 0) {
    parts.push("MARKETING TASKS:");
    for (const task of context.marketingNeeds) {
      parts.push(`  - ${task}`);
    }
  }
  
  return parts.join("\n");
}

export const incomeApiServicesSkill: ScheduledSkill = {
  kind: "scheduled",
  config: {
    id: "income-api-services",
    name: "API Service Business Operator",
    enabled: true,
    kind: "scheduled",
  },
  
  async run(context: AgentHealthContext): Promise<ScheduledSkillResult | null> {
    const now = Date.now();
    const hoursSinceLastReport = (now - lastReportAt) / (1000 * 60 * 60);
    
    const incomeContext = await buildIncomeContext();
    const revenue = await getRevenueStats(WEEKLY_GOAL);
    const services = await getEnabledServices();
    
    await logActivity("income_check", `Income check: $${revenue.thisWeek.toFixed(2)}/$${WEEKLY_GOAL} this week`, {
      weeklyProgress: revenue.weeklyProgress,
      gap: incomeContext.gap,
      activeServices: services.length,
    });
    
    if (hoursSinceLastReport >= REPORT_INTERVAL_HOURS) {
      lastReportAt = now;
      
      const report = formatIncomeReport(incomeContext, revenue);
      
      return {
        type: "report",
        message: report,
        bypassDryRun: false,
        speak: false,
      };
    }
    
    if (incomeContext.recentFailures.length >= 5) {
      return {
        type: "alert",
        message: `INCOME SERVICE ALERT: ${incomeContext.recentFailures.length} recent failures detected. Check service health.`,
        bypassDryRun: true,
        speak: false,
      };
    }
    
    return null;
  },
};
