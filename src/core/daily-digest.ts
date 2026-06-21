import { summarizeRecentActivity } from "./activity-log.js";
import { compareToPrevious, formatBillSummary, getBillHistory, getLatestBill } from "./bills.js";
import { formatTodayFocusSummary, getTodayFocusDay } from "./focus.js";
import type { InteractiveSkillContext } from "../types.js";

export async function formatDailyDigest(context: InteractiveSkillContext): Promise<string> {
  const [focusDay, activity, latestBill, billHistory] = await Promise.all([
    getTodayFocusDay(),
    summarizeRecentActivity({ sinceHours: 24, limit: 12 }),
    getLatestBill(),
    getBillHistory(2),
  ]);

  const billComparison = latestBill ? compareToPrevious(latestBill, billHistory[1]) : null;
  const skillNames = context.skills.map((skill) => skill.name).join(", ") || "none loaded";

  return [
    "Today with SAG",
    "",
    "Focus",
    formatTodayFocusSummary(focusDay),
    "",
    "Recent activity",
    activity,
    "",
    "Latest utility bill",
    latestBill ? [formatBillSummary(latestBill), billComparison].filter(Boolean).join("\n") : "No utility bills stored yet.",
    "",
    "Active surface area",
    `Skills: ${skillNames}`,
    `Mode: ${context.health.dryRun ? "dry run" : "live notifications"}`,
    `Gmail: ${context.health.gmailConfigured ? "configured" : "not configured"}`,
    `Telegram: ${context.health.telegramConfigured ? "configured" : "not configured"}`,
  ].join("\n");
}
