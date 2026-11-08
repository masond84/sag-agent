/**
 * Seed initial ledger with known subscriptions from bills.json and
 * current AGENT_WEEKLY_COST_USD budget.
 */
import { loadBills } from "../zsync/store.js";
import { getWeeklyCostUsd } from "../income/self-funding.js";
import type { MonthlyLedger, Subscription, LaneCost } from "./schema.js";
import { initializeLedgerForMonth, saveLedger, calculateLedgerSummary } from "./store.js";

export async function seedCurrentMonthLedger(): Promise<MonthlyLedger> {
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  
  const ledger = await initializeLedgerForMonth(month);
  
  const bills = await loadBills();
  const subscriptions: Subscription[] = [];
  
  if (bills?.subscriptions) {
    for (const sub of bills.subscriptions) {
      if (["ChatGPT", "Cursor"].some(name => sub.name.includes(name))) {
        subscriptions.push({
          name: sub.name,
          monthlyCostUsd: sub.amount,
          provider: sub.name.includes("ChatGPT") ? "OpenAI" : "Cursor",
          category: sub.name.includes("ChatGPT") ? "llm-api" : "tools",
          status: "active",
          startedAt: "2026-01-01T00:00:00Z",
          notes: "Seeded from bills.json subscriptions list",
        });
      }
    }
  }

  subscriptions.push({
    name: "OpenAI API usage",
    monthlyCostUsd: 0,
    provider: "OpenAI",
    category: "llm-api",
    status: "active",
    startedAt: now.toISOString(),
    notes: "Estimated monthly usage - actual spend tracked separately; placeholder for structure",
  });

  const weeklyCostUsd = getWeeklyCostUsd();
  const estimatedMonthlyFromBudget = (weeklyCostUsd * 52) / 12;

  const laneCosts: LaneCost[] = [
    {
      laneId: "coordination",
      botId: "emi-grok-coordinator",
      name: "Emi coordination lane",
      costType: "saving",
      monthlyCostUsd: null,
      estimatedOnly: true,
      notes: "Cursor Cloud agent usage - actual cost TBD after observation period",
    },
    {
      laneId: "api-arbitrage",
      name: "API arbitrage revenue lane",
      costType: "earning",
      monthlyCostUsd: null,
      estimatedOnly: true,
      apiUsage: {
        estimatedMonthlyUsd: 0,
        provider: "Mixed (DeepL, Whisper, email verification)",
        model: "various",
      },
      notes: "Translation 3x, transcription 2x, email verification 5x markup - earning lane but $0 made so far due to missing keys/deployment",
    },
    {
      laneId: "weekly-budget",
      name: "Weekly agent cost budget allocation",
      costType: "capped",
      monthlyCostUsd: estimatedMonthlyFromBudget,
      hardCapUsd: estimatedMonthlyFromBudget,
      capSetBy: "devin",
      estimatedOnly: true,
      notes: `AGENT_WEEKLY_COST_USD default $${weeklyCostUsd}/week = ~$${estimatedMonthlyFromBudget.toFixed(2)}/month budget; actual vs budget tracked separately`,
    },
  ];

  ledger.subscriptions = subscriptions;
  ledger.laneCosts = laneCosts;
  ledger.returns = [];
  ledger.summary = calculateLedgerSummary(ledger);
  ledger.generatedAt = new Date().toISOString();
  ledger.updatedBy = "sag";

  await saveLedger(ledger);
  return ledger;
}
