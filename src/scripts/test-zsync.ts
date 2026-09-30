/**
 * Smoke test for the z-sync shared-state layer.
 * Run: npm run test:zsync
 */
import assert from "node:assert/strict";
import {
  formatUsd,
  loadBills,
  loadDeftBd,
  loadFinance,
  loadGoals,
  loadJobPipeline,
  loadZSyncFile,
  nextBillOccurrence,
} from "../core/zsync/store.js";
import { buildDigest } from "../skills/zsync/index.js";

const TZ = "America/New_York";

async function main() {
  // 1. All five files load and carry sync metadata.
  const goals = await loadGoals();
  assert.ok(goals && goals.goals.length >= 5, "goals.json loads with goals");
  assert.ok(goals.updatedAt && ["z", "sag"].includes(goals.updatedBy), "goals has sync meta");

  const bills = await loadBills();
  assert.ok(bills && bills.bills.length >= 3, "bills.json loads with bills");
  assert.ok(bills.subscriptions.length >= 3, "subscriptions seeded");

  const finance = await loadFinance();
  assert.ok(finance && finance.accounts.length >= 5, "finance.json loads with accounts");
  assert.ok(finance.floor && finance.floor.target === 20000, "floor target is $20k");

  const pipeline = await loadJobPipeline();
  assert.ok(pipeline && pipeline.targets.length >= 2, "job pipeline has targets");
  assert.ok(pipeline.rules.length > 0, "pipeline rules present");

  const bd = await loadDeftBd();
  assert.ok(bd && Array.isArray(bd.leads), "deft-bd.json loads");

  // 2. Missing file returns null instead of throwing.
  const missing = await loadZSyncFile("nope.json");
  assert.equal(missing, null, "missing file -> null");

  // 3. Bill occurrence math.
  const rent = bills.bills.find((b) => b.id === "rent");
  assert.ok(rent, "rent bill seeded");
  const occ = nextBillOccurrence(rent, TZ);
  assert.ok(occ, "rent has an occurrence");
  assert.match(occ.dueDateKey, /^\d{4}-\d{2}-01$/, "rent due on the 1st");
  assert.ok(occ.daysUntil >= 0 && occ.daysUntil <= 31, "rent daysUntil sane");
  assert.equal(occ.paid, false, "rent not marked paid");

  const noSchedule = bills.bills.find((b) => !b.dueDay);
  assert.ok(noSchedule, "a bill without dueDay exists");
  assert.equal(nextBillOccurrence(noSchedule, TZ), null, "no dueDay -> null occurrence");

  // 4. Formatting helper.
  assert.equal(formatUsd(188.58), "$188.58", "usd formats");
  assert.equal(formatUsd(null), "amount TBD", "null amount labels honestly");

  // 5. Digest builds without throwing and mentions the key sections.
  const digest = await buildDigest(TZ);
  assert.ok(digest.includes("Z-SYNC DAILY DIGEST"), "digest header");
  assert.ok(digest.includes("Floor:"), "digest has floor");
  assert.ok(digest.includes("Bills"), "digest has bills");
  assert.ok(digest.includes("Job pipeline"), "digest has pipeline");
  assert.ok(digest.includes("Deft Point BD"), "digest has BD");
  assert.ok(digest.includes("Self-funding"), "digest has self-funding");

  console.log("test:zsync OK");
  console.log("--- sample digest ---");
  console.log(digest);
}

main().catch((error) => {
  console.error("test:zsync FAILED:", error);
  process.exit(1);
});
