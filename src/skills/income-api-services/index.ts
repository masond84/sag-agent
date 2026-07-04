import type { ScheduledSkill, ScheduledSkillResult, AgentHealthContext, IncomeGoalContext } from "../../types.js";
import { getRevenueStats, getServiceStats, getRecentFailures } from "../../core/income/revenue-tracking.js";
import { getEnabledServices } from "../../core/income/service-config.js";
import { logActivity } from "../../core/activity-log.js";
import { getContentStats } from "../../core/content/store.js";
import { getLastIncomeReportAt, markIncomeReported } from "../../core/state.js";

const WEEKLY_GOAL = Number(process.env.INCOME_WEEKLY_GOAL ?? 200);

function getReportIntervalHours(): number {
  const raw = Number(process.env.INCOME_REPORT_INTERVAL_HOURS ?? 24);
  if (!Number.isFinite(raw) || raw <= 0) {
    return 24;
  }
  return raw;
}

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

  if (!process.env.STRIPE_SECRET_KEY?.trim()) {
    developmentPriorities.push({
      task: "Configure Stripe billing keys",
      impact: "high",
      reason: "Billing code is ready but STRIPE_SECRET_KEY is not set",
    });
  } else {
    developmentPriorities.push({
      task: "Expose public HTTPS endpoint for /api/services/* (tunnel or deploy)",
      impact: "high",
      reason: "Stripe checkout is live but services are only reachable on localhost",
    });
  }

  const content = await getContentStats();
  if (content.failed > 0 && content.failed >= content.draftsReady) {
    developmentPriorities.push({
      task: "Fix content-engine Manus ingest or script failures",
      impact: "medium",
      reason: `${content.failed} failed content episode(s) — pipeline needs attention`,
    });
  }

  const contentPostGoal = content.weeklyPostGoal;
  if (content.postedThisWeek < contentPostGoal && new Date().getDay() >= 5) {
    developmentPriorities.push({
      task: "Publish content drafts to YouTube/TikTok/Reels",
      impact: "medium",
      reason: `${content.postedThisWeek}/${contentPostGoal} posts this week — ${content.draftsReady} draft(s) waiting`,
    });
  }
  
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

async function formatIncomeReport(
  context: IncomeGoalContext,
  revenue: Awaited<ReturnType<typeof getRevenueStats>>,
): Promise<string> {
  const parts: string[] = [];
  const content = await getContentStats();
  
  parts.push("DUAL INCOME REPORT");
  parts.push("");
  
  parts.push(`Weekly Goal: $${context.weeklyGoal}`);
  parts.push(`API this week: $${revenue.thisWeek.toFixed(2)} (${revenue.weeklyProgress.toFixed(1)}%)`);
  parts.push(`Gap: $${context.gap.toFixed(2)} (${revenue.daysUntilGoal} days remaining)`);
  parts.push(
    `Content: ${content.draftsReady} drafts ready · ${content.postedThisWeek}/${content.weeklyPostGoal} posted this week · ${content.inFlight} in flight`,
  );
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
  
  async run(_context: AgentHealthContext): Promise<ScheduledSkillResult | null> {
    const incomeContext = await buildIncomeContext();
    const revenue = await getRevenueStats(WEEKLY_GOAL);
    const services = await getEnabledServices();
    const content = await getContentStats();

    await logActivity("income_check", `Income check: $${revenue.thisWeek.toFixed(2)}/$${WEEKLY_GOAL} this week`, {
      weeklyProgress: revenue.weeklyProgress,
      gap: incomeContext.gap,
      activeServices: services.length,
      contentDrafts: content.draftsReady,
      contentInFlight: content.inFlight,
    });

    const lastReportAt = await getLastIncomeReportAt();
    const intervalMs = getReportIntervalHours() * 60 * 60 * 1000;

    // Persist cooldown on first run after upgrade/restart so we don't spam Telegram.
    if (!lastReportAt) {
      await markIncomeReported();
    } else {
      const elapsedMs = Date.now() - new Date(lastReportAt).getTime();
      if (elapsedMs >= intervalMs) {
        await markIncomeReported();
        const report = await formatIncomeReport(incomeContext, revenue);

        return {
          type: "report",
          message: report,
          bypassDryRun: false,
          speak: false,
        };
      }
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
