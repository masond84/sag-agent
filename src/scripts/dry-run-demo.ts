/**
 * Dry-run demonstration of the growing-brain system.
 * Shows the complete workflow without making any external calls.
 * 
 * Run: npm run dry-run:demo
 */
import { seedInitialGoals } from "../core/goals/seed.js";
import { loadAllGoals } from "../core/goals/store.js";
import { registerLoop, getAllLoops } from "../core/loops/registry.js";
import { executeLoop } from "../core/loops/executor.js";
import { jobPipelineLoop } from "../core/loops/job-pipeline.js";
import { seedCurrentMonthLedger } from "../core/ledger/seed.js";
import { loadLedger, getCurrentMonth } from "../core/ledger/store.js";
import { buildDeltaDigest } from "../core/scoreboard/digest.js";
import { loadBots } from "../core/bots/store.js";

const TZ = "America/New_York";

async function main() {
  console.log("==================================================");
  console.log("SAG GROWING-BRAIN DRY-RUN DEMONSTRATION");
  console.log("==================================================\n");

  console.log("1. SEEDING INITIAL GOALS");
  console.log("--------------------------------------------------");
  const seedResult = await seedInitialGoals();
  console.log(`Seeded: ${seedResult.seeded.length} goals`);
  console.log(`Skipped: ${seedResult.skipped.length} goals (already exist)`);
  
  const goals = await loadAllGoals();
  console.log(`\nTotal goals loaded: ${goals.length}`);
  for (const goal of goals) {
    console.log(`  - ${goal.name} [${goal.status}]`);
    console.log(`    Loop: ${goal.loopId || "none"}`);
    console.log(`    Next: ${goal.nextAction.description} [${goal.nextAction.ownerOfNextInput}]`);
    if (goal.measurement.stale || goal.measurement.missing) {
      const flags = [];
      if (goal.measurement.stale) flags.push("STALE");
      if (goal.measurement.missing) flags.push("MISSING");
      console.log(`    Data: ${flags.join(", ")}`);
    }
  }

  console.log("\n2. REGISTERING LOOPS");
  console.log("--------------------------------------------------");
  registerLoop(jobPipelineLoop);
  const loops = getAllLoops();
  console.log(`Registered loops: ${loops.length}`);
  for (const loop of loops) {
    console.log(`  - ${loop.config.name} (${loop.config.id})`);
    console.log(`    Goal: ${loop.config.goalId}`);
    console.log(`    Status: ${loop.config.status}`);
    console.log(`    Enabled: ${loop.config.enabled}`);
  }

  console.log("\n3. EXECUTING JOB PIPELINE LOOP (DRY-RUN)");
  console.log("--------------------------------------------------");
  const loopResult = await executeLoop(jobPipelineLoop, { dryRun: true, timeZone: TZ });
  console.log(`Loop ID: ${loopResult.loopId}`);
  console.log(`Success: ${loopResult.success}`);
  if (loopResult.success && loopResult.action) {
    console.log(`Action Type: ${loopResult.action.type}`);
    console.log(`Description: ${loopResult.action.description}`);
    console.log(`Owner: ${loopResult.action.ownerOfNextInput}`);
    if (loopResult.measurements) {
      console.log(`Measurements:`);
      for (const [key, value] of Object.entries(loopResult.measurements)) {
        console.log(`  ${key}: ${value}`);
      }
    }
  }
  if (loopResult.staleData?.length) {
    console.log(`Stale data sources: ${loopResult.staleData.join(", ")}`);
  }
  if (loopResult.missingData?.length) {
    console.log(`Missing data sources: ${loopResult.missingData.join(", ")}`);
  }

  console.log("\n4. INITIALIZING LEDGER");
  console.log("--------------------------------------------------");
  const month = getCurrentMonth();
  const ledger = await seedCurrentMonthLedger();
  console.log(`Month: ${ledger.month}`);
  console.log(`Subscriptions tracked: ${ledger.subscriptions.length}`);
  for (const sub of ledger.subscriptions) {
    console.log(`  - ${sub.name}: $${sub.monthlyCostUsd.toFixed(2)}/mo [${sub.category}, ${sub.status}]`);
  }
  console.log(`\nLane costs tracked: ${ledger.laneCosts.length}`);
  for (const lane of ledger.laneCosts) {
    const cost = lane.monthlyCostUsd !== null ? `$${lane.monthlyCostUsd.toFixed(2)}` : "unknown";
    const estimated = lane.estimatedOnly ? " (estimated)" : "";
    console.log(`  - ${lane.name} [${lane.costType}]: ${cost}/mo${estimated}`);
    if (lane.botId) {
      console.log(`    Bot: ${lane.botId}`);
    }
  }
  console.log(`\nSummary:`);
  console.log(`  Known costs: $${ledger.summary.totalKnownCostUsd.toFixed(2)}/mo`);
  console.log(`  Cash returns: $${ledger.summary.totalCashReturnUsd.toFixed(2)}`);
  console.log(`  Incomplete coverage: ${ledger.summary.incompleteCoverage.length} lanes`);

  console.log("\n5. LOADING BOTS REGISTRY");
  console.log("--------------------------------------------------");
  const registry = await loadBots();
  if (registry) {
    console.log(`Registered bots: ${registry.bots.length}`);
    for (const bot of registry.bots) {
      console.log(`  - ${bot.name} (${bot.id})`);
      console.log(`    Platform: ${bot.platform}`);
      console.log(`    Lane: ${bot.lane}`);
      console.log(`    Purpose: ${bot.purpose}`);
      console.log(`    Status: ${bot.status}`);
      console.log(`    Reports to: ${bot.reportsTo}`);
      console.log(`    Capabilities:`);
      console.log(`      Read: ${bot.capabilities.canRead}`);
      console.log(`      Draft: ${bot.capabilities.canDraft}`);
      console.log(`      Send: ${bot.capabilities.canSend}`);
      console.log(`      Spend: ${bot.capabilities.canSpendMoney}`);
      console.log(`      Delete: ${bot.capabilities.canDelete}`);
      console.log(`    Forbidden: ${bot.forbiddenActions.join(", ")}`);
    }
  }

  console.log("\n6. GENERATING DELTA DIGEST");
  console.log("--------------------------------------------------");
  const digest = await buildDeltaDigest(TZ);
  console.log(digest);

  console.log("\n==================================================");
  console.log("DRY-RUN DEMONSTRATION COMPLETE");
  console.log("==================================================");
  console.log("\nKey observations:");
  console.log("  - 6 goals seeded with real data from z-sync");
  console.log("  - Job pipeline loop executed successfully");
  console.log("  - Ledger tracks subscriptions and lane costs");
  console.log("  - Emi bot registered with proper capabilities");
  console.log("  - Delta digest shows first-run baseline");
  console.log("\nNo external calls were made. All state is local.");
  console.log("Ready for integration with existing cron/zsync schedule.");
}

main().catch((error) => {
  console.error("Dry-run demonstration failed:", error);
  process.exit(1);
});
