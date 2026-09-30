import { getRevenueStats } from "./revenue-tracking.js";

/**
 * Self-funding tracker: does this week's API revenue cover the agent's own
 * estimated weekly operating cost (LLM API, memory, misc)? The goal is for the
 * agent to pay for its own existence before chasing the larger weekly goal.
 */

export interface SelfFundingStatus {
  weeklyCostUsd: number;
  revenueThisWeek: number;
  covered: boolean;
  /** Positive when covered (surplus), negative when short (deficit). */
  surplus: number;
}

export function getWeeklyCostUsd(): number {
  const raw = Number(process.env.AGENT_WEEKLY_COST_USD ?? 25);
  if (!Number.isFinite(raw) || raw < 0) {
    return 25;
  }
  return raw;
}

export async function getSelfFundingStatus(): Promise<SelfFundingStatus> {
  const weeklyCostUsd = getWeeklyCostUsd();
  const revenue = await getRevenueStats();
  const surplus = revenue.thisWeek - weeklyCostUsd;
  return {
    weeklyCostUsd,
    revenueThisWeek: revenue.thisWeek,
    covered: surplus >= 0,
    surplus,
  };
}
