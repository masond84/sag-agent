/**
 * Comprehensive test for the growing-brain system.
 * Tests: schema validation, migration, goal seeding, loops, ledger, digest.
 * 
 * Run: npm run test:growing-brain
 */
import assert from "node:assert/strict";
import { validateGoal } from "../core/goals/schema.js";
import { loadGoal, loadAllGoals, saveGoal } from "../core/goals/store.js";
import { seedInitialGoals } from "../core/goals/seed.js";
import { registerLoop, getLoop, clearRegistry } from "../core/loops/registry.js";
import { executeLoop } from "../core/loops/executor.js";
import { jobPipelineLoop } from "../core/loops/job-pipeline.js";
import { seedCurrentMonthLedger } from "../core/ledger/seed.js";
import { loadLedger, getCurrentMonth, calculateLedgerSummary } from "../core/ledger/store.js";
import { buildDeltaDigest, shouldSendDigest } from "../core/scoreboard/digest.js";
import { validateBot } from "../core/bots/schema.js";
import { loadBots } from "../core/bots/store.js";

const TZ = "America/New_York";

async function testGoalSchema() {
  console.log("Testing goal schema validation...");

  const validGoal = {
    id: "test-goal",
    name: "Test Goal",
    status: "active",
    target: {
      type: "number",
      value: 100,
      description: "Test target",
    },
    measurement: {
      current: 50,
      measuredAt: new Date().toISOString(),
      source: "test",
      stale: false,
      missing: false,
    },
    nextAction: {
      description: "Do something",
      ownerOfNextInput: "sag",
    },
    loopId: "test-loop",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    updatedBy: "sag",
  };

  const errors = validateGoal(validGoal);
  assert.equal(errors.length, 0, "Valid goal should have no errors");

  const invalidGoal = {
    id: "invalid_id",
    name: "",
    status: "unknown",
  };
  const invalidErrors = validateGoal(invalidGoal);
  assert.ok(invalidErrors.length > 0, "Invalid goal should have errors");
  assert.ok(invalidErrors.some(e => e.field === "id"), "Should catch invalid id format");
  assert.ok(invalidErrors.some(e => e.field === "status"), "Should catch invalid status");

  console.log("  Schema validation OK");
}

async function testGoalSeeding() {
  console.log("Testing goal seeding...");

  const result = await seedInitialGoals();
  console.log(`  Seeded: ${result.seeded.join(", ")}`);
  console.log(`  Skipped: ${result.skipped.join(", ")}`);

  const goals = await loadAllGoals();
  assert.ok(goals.length >= 6, "Should have at least 6 goals seeded");

  const jobGoal = goals.find(g => g.id === "job-140k");
  assert.ok(jobGoal, "job-140k goal should exist");
  assert.equal(jobGoal.status, "active", "Job goal should be active");
  assert.equal(jobGoal.target.type, "milestone", "Job goal target should be milestone");
  assert.equal(jobGoal.loopId, "job-pipeline", "Job goal should have job-pipeline loop");

  const savingsGoal = goals.find(g => g.id === "savings-floor-20k");
  assert.ok(savingsGoal, "savings-floor-20k goal should exist");
  assert.equal(savingsGoal.target.type, "number", "Savings goal target should be number");
  assert.equal(savingsGoal.target.value, 20000, "Savings goal target should be $20k");

  console.log("  Goal seeding OK");
}

async function testJobPipelineLoop() {
  console.log("Testing job pipeline loop...");

  clearRegistry();
  registerLoop(jobPipelineLoop);

  const loop = getLoop("job-pipeline");
  assert.ok(loop, "Job pipeline loop should be registered");
  assert.equal(loop.config.goalId, "job-140k", "Loop should target job-140k goal");

  const result = await executeLoop(loop, { dryRun: true, timeZone: TZ });
  console.log(`  Loop result: success=${result.success}, action=${result.action?.description}`);

  assert.equal(result.loopId, "job-pipeline", "Result should have correct loopId");
  assert.equal(result.goalId, "job-140k", "Result should have correct goalId");

  if (result.success) {
    assert.ok(result.action, "Successful loop should have an action");
    assert.ok(result.action.description, "Action should have description");
    assert.ok(["sag", "devin", "z"].includes(result.action.ownerOfNextInput), "Action should have valid owner");
    console.log(`  Next action owner: ${result.action.ownerOfNextInput}`);
  } else {
    console.log(`  Loop failed (expected if job-pipeline.json missing): ${result.error}`);
  }

  console.log("  Job pipeline loop OK");
}

async function testLedger() {
  console.log("Testing ledger system...");

  const month = getCurrentMonth();
  console.log(`  Current month: ${month}`);

  const ledger = await seedCurrentMonthLedger();
  assert.equal(ledger.month, month, "Ledger should be for current month");
  assert.ok(ledger.subscriptions.length >= 1, "Should have at least 1 subscription seeded");
  assert.ok(ledger.laneCosts.length >= 3, "Should have at least 3 lane costs seeded");

  const summary = calculateLedgerSummary(ledger);
  assert.ok(summary.totalSubscriptionsUsd >= 0, "Total subscriptions should be non-negative");
  assert.ok(summary.incompleteCoverage.length > 0, "Should have incomplete coverage initially");
  
  console.log(`  Subscriptions: ${ledger.subscriptions.length}`);
  console.log(`  Lane costs: ${ledger.laneCosts.length}`);
  console.log(`  Known costs: $${summary.totalKnownCostUsd.toFixed(2)}`);
  console.log(`  Incomplete coverage: ${summary.incompleteCoverage.length} lanes`);

  const emiLane = ledger.laneCosts.find(l => l.laneId === "coordination");
  assert.ok(emiLane, "Emi coordination lane should exist");
  assert.equal(emiLane.botId, "emi-grok-coordinator", "Emi lane should link to Emi bot");
  assert.equal(emiLane.costType, "saving", "Emi lane should be classified as saving");

  const arbitrageLane = ledger.laneCosts.find(l => l.laneId === "api-arbitrage");
  assert.ok(arbitrageLane, "API arbitrage lane should exist");
  assert.equal(arbitrageLane.costType, "earning", "Arbitrage lane should be classified as earning");

  console.log("  Ledger system OK");
}

async function testBotsRegistry() {
  console.log("Testing bots registry...");

  const registry = await loadBots();
  assert.ok(registry, "Bots registry should exist");
  assert.ok(registry.bots.length >= 1, "Should have at least 1 bot registered");

  const emiBot = registry.bots.find(b => b.id === "emi-grok-coordinator");
  assert.ok(emiBot, "Emi bot should be registered");
  assert.equal(emiBot.name, "Emi (Grok coordinator bot)", "Bot name should match");
  assert.equal(emiBot.platform, "x-grok", "Bot platform should be x-grok");
  assert.equal(emiBot.lane, "coordination", "Bot lane should be coordination");
  assert.equal(emiBot.reportsTo, "sag", "Bot should report to sag");
  assert.equal(emiBot.status, "active", "Bot should be active");
  assert.equal(emiBot.capabilities.canSend, false, "Bot should not have send capability");
  assert.equal(emiBot.capabilities.canSpendMoney, false, "Bot should not have spending capability");

  const errors = validateBot(emiBot);
  assert.equal(errors.length, 0, "Emi bot should pass validation");

  console.log("  Bots registry OK");
}

async function testDeltaDigest() {
  console.log("Testing delta digest...");

  const digest = await buildDeltaDigest(TZ);
  assert.ok(digest.includes("SCOREBOARD DELTA DIGEST"), "Digest should have header");
  assert.ok(digest.includes("Goals"), "Digest should mention goals");

  console.log("--- Sample digest ---");
  console.log(digest);
  console.log("--- End digest ---");

  const shouldSend = await shouldSendDigest(TZ, "08:00");
  console.log(`  Should send digest now: ${shouldSend}`);

  console.log("  Delta digest OK");
}

async function testIdempotency() {
  console.log("Testing idempotency...");

  const goals1 = await loadAllGoals();
  const goals2 = await loadAllGoals();
  assert.equal(goals1.length, goals2.length, "Multiple loads should return same count");

  const result1 = await seedInitialGoals();
  const result2 = await seedInitialGoals();
  assert.equal(result2.seeded.length, 0, "Second seed should skip all goals");
  assert.ok(result2.skipped.length >= 6, "Second seed should skip at least 6 goals");

  console.log("  Idempotency OK");
}

async function testTimezoneHandling() {
  console.log("Testing timezone handling...");

  clearRegistry();
  registerLoop(jobPipelineLoop);
  const loop = getLoop("job-pipeline");
  assert.ok(loop, "Loop should exist");

  const result = await executeLoop(loop, { dryRun: true, timeZone: "America/New_York" });
  assert.ok(result.executedAt, "Result should have executedAt timestamp");

  const executedDate = new Date(result.executedAt);
  assert.ok(!isNaN(executedDate.getTime()), "executedAt should be valid ISO timestamp");

  console.log("  Timezone handling OK");
}

async function main() {
  console.log("Running growing-brain system tests...\n");

  await testGoalSchema();
  await testGoalSeeding();
  await testJobPipelineLoop();
  await testLedger();
  await testBotsRegistry();
  await testDeltaDigest();
  await testIdempotency();
  await testTimezoneHandling();

  console.log("\nAll tests passed!");
}

main().catch((error) => {
  console.error("Tests FAILED:", error);
  process.exit(1);
});
