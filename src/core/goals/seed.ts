/**
 * Seed the six user-provided goals with real data from existing z-sync state.
 * 
 * Seeds only if the goal doesn't already exist, preserving any manual updates.
 */
import type { Goal } from "./schema.js";
import { goalExists, saveGoal } from "./store.js";
import { loadFinance, loadBills, loadJobPipeline } from "../zsync/store.js";

async function seedGoalIfNotExists(goal: Goal): Promise<boolean> {
  if (await goalExists(goal.id)) {
    return false;
  }
  await saveGoal(goal);
  return true;
}

export async function seedInitialGoals(): Promise<{ seeded: string[]; skipped: string[] }> {
  const now = new Date().toISOString();
  const seeded: string[] = [];
  const skipped: string[] = [];

  const finance = await loadFinance();
  const bills = await loadBills();
  const pipeline = await loadJobPipeline();

  const goals: Goal[] = [
    {
      id: "job-140k",
      name: "$140k+ AI/startup engineering job",
      status: "active",
      target: {
        type: "milestone",
        description: "Signed offer at $140k+ base, remote-first AI/startup engineering",
      },
      measurement: {
        current: "10 live $140k+ roles tracked; drafts for Marker Learning/Titan; Fieldguide deadline 2026-11-30",
        measuredAt: "2026-11-08",
        source: "job-pipeline.json + user report",
        stale: false,
        missing: false,
      },
      nextAction: {
        description: "Devin to review and send Fieldguide outreach draft (closes 2026-11-30)",
        ownerOfNextInput: "devin",
      },
      loopId: "job-pipeline",
      notes: pipeline ? `Active pipeline depth ${pipeline.listDepth || "unknown"}; rules: ${pipeline.rules.join("; ")}` : undefined,
      createdAt: now,
      updatedAt: now,
      updatedBy: "sag",
    },
    {
      id: "savings-floor-20k",
      name: "Protected savings floor of $20k",
      status: "active",
      target: {
        type: "number",
        value: 20000,
        unit: "USD",
        description: "Total liquid savings in protected accounts (SoFi Savings + Emergency Fund + Public brokerage) never drops below $20k",
      },
      measurement: {
        current: finance?.floor?.total ?? null,
        measuredAt: finance?.asOf ?? null,
        source: finance ? "finance.json (Plaid snapshot)" : undefined,
        stale: finance ? isFinanceStale(finance.asOf) : true,
        missing: !finance?.floor?.total,
      },
      nextAction: {
        description: finance && finance.floor && finance.floor.total < 20000 
          ? `Floor at ${formatUsd(finance.floor.total)} / $20k - next paycheck allocation needed`
          : "Monitor floor on paycheck days; no immediate action",
        ownerOfNextInput: "sag",
      },
      loopId: "floor-watcher",
      notes: finance?.floor?.note,
      createdAt: now,
      updatedAt: now,
      updatedBy: "sag",
    },
    {
      id: "bills-on-time",
      name: "All bills paid on time",
      status: "active",
      target: {
        type: "milestone",
        description: "Rent (1st), Sallie Mae ~$188 (3rd), TECO electricity ~$100-130 (21st), USAA auto $100+ min paid without late fees",
      },
      measurement: {
        current: bills ? describeBillsStatus(bills) : null,
        measuredAt: bills?.updatedAt ?? null,
        source: bills ? "bills.json" : undefined,
        stale: bills ? isBillsStale(bills.updatedAt) : true,
        missing: !bills,
      },
      nextAction: {
        description: bills ? getNextBillAction(bills) : "Load bills.json to check upcoming due dates",
        ownerOfNextInput: "sag",
      },
      loopId: null,
      notes: bills?.subscriptionsNote,
      createdAt: now,
      updatedAt: now,
      updatedBy: "sag",
    },
    {
      id: "tampa-ai-builders",
      name: "Tampa 20s AI Builders growth",
      status: "active",
      target: {
        type: "milestone",
        description: "30 members, 10 contributors, 5 returning attendees",
      },
      measurement: {
        current: null,
        measuredAt: null,
        source: undefined,
        stale: true,
        missing: true,
      },
      nextAction: {
        description: "Establish data collection mechanism for member/contributor/attendance counts",
        ownerOfNextInput: "devin",
      },
      loopId: null,
      notes: "Community building goal; metrics not yet tracked in z-sync",
      createdAt: now,
      updatedAt: now,
      updatedBy: "sag",
    },
    {
      id: "trailblaize-gate",
      name: "Trailblaize decision gate",
      status: "active",
      target: {
        type: "milestone",
        description: "No signing without written $80k+ base salary and cliff protection",
      },
      measurement: {
        current: "Gate not yet triggered; no pending Trailblaize decision",
        measuredAt: now,
        source: "user-provided gate",
        stale: false,
        missing: false,
      },
      nextAction: {
        description: "Monitor for Trailblaize offer; validate against gate criteria when received",
        ownerOfNextInput: "sag",
      },
      loopId: null,
      notes: "Decision gate - blocks acceptance below $80k or without cliff protection",
      createdAt: now,
      updatedAt: now,
      updatedBy: "sag",
    },
    {
      id: "nicotine-quit",
      name: "Quit nicotine via patches",
      status: "active",
      target: {
        type: "milestone",
        description: "Successfully quit vaping using nicotine patches; trigger: current vape dies",
      },
      measurement: {
        current: null,
        measuredAt: null,
        source: undefined,
        stale: true,
        missing: true,
      },
      nextAction: {
        description: "Devin to report when vape dies and patches procurement status",
        ownerOfNextInput: "devin",
      },
      loopId: null,
      notes: "Health goal; start date pending vape hardware failure",
      createdAt: now,
      updatedAt: now,
      updatedBy: "sag",
    },
  ];

  for (const goal of goals) {
    const wasSeeded = await seedGoalIfNotExists(goal);
    if (wasSeeded) {
      seeded.push(goal.id);
    } else {
      skipped.push(goal.id);
    }
  }

  return { seeded, skipped };
}

function isFinanceStale(asOf: string | undefined): boolean {
  if (!asOf) return true;
  const age = Date.now() - new Date(asOf).getTime();
  const threeDays = 3 * 24 * 60 * 60 * 1000;
  return age > threeDays;
}

function isBillsStale(updatedAt: string | undefined): boolean {
  if (!updatedAt) return true;
  const age = Date.now() - new Date(updatedAt).getTime();
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  return age > sevenDays;
}

function formatUsd(value: number): string {
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function describeBillsStatus(bills: any): string {
  const unpaid = bills.bills.filter((b: any) => !b.paidThrough);
  if (unpaid.length === 0) {
    return "All tracked bills marked paid through current period";
  }
  return `${unpaid.length} bills pending payment: ${unpaid.map((b: any) => b.name).join(", ")}`;
}

function getNextBillAction(bills: any): string {
  const unpaid = bills.bills.filter((b: any) => !b.paidThrough && b.dueDay);
  if (unpaid.length === 0) {
    return "All bills paid through current period; monitor for next cycle";
  }
  const next = unpaid[0];
  return `Next alert due for ${next.name} (${formatUsd(next.amount || 0)} on day ${next.dueDay})`;
}
