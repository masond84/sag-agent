// npm run test:arbitrage — validates Tier 2 API arbitrage unit economics.
// No secrets required: checks service configs, markup math (>= 2x), and the
// self-funding tracker shape. Fails non-zero on any violation.

import { loadServiceConfigs } from "../core/income/service-config.js";
import { getSelfFundingStatus, getWeeklyCostUsd } from "../core/income/self-funding.js";

const ARBITRAGE_SERVICES = ["translation", "transcription", "email-verify"];
const MIN_MARKUP = 2;

let failures = 0;

function fail(message: string): void {
  failures += 1;
  console.error(`  FAIL: ${message}`);
}

function ok(message: string): void {
  console.log(`  ok: ${message}`);
}

async function main(): Promise<void> {
  const configs = await loadServiceConfigs();

  console.log("Arbitrage service configs:");
  for (const id of ARBITRAGE_SERVICES) {
    const cfg = configs.find((c) => c.id === id);
    if (!cfg) {
      fail(`service "${id}" missing from service configs`);
      continue;
    }
    ok(`"${id}" registered (${cfg.name})`);

    if (cfg.backend.type !== "api_proxy") {
      fail(`"${id}" backend.type should be "api_proxy", got "${cfg.backend.type}"`);
    } else {
      ok(`"${id}" uses api_proxy backend (${cfg.backend.apiProvider})`);
    }

    let markup: number | null = null;
    if (cfg.pricing.model === "per_unit" && cfg.pricing.pricePerUnit && cfg.backend.costPerUnit) {
      markup = cfg.pricing.pricePerUnit / cfg.backend.costPerUnit;
    } else if (
      cfg.pricing.model === "per_call" &&
      cfg.pricing.pricePerCall &&
      cfg.backend.costPerUnit
    ) {
      markup = cfg.pricing.pricePerCall / cfg.backend.costPerUnit;
    }

    if (markup === null) {
      fail(`"${id}" has incomplete pricing/cost config for markup math`);
    } else if (markup < MIN_MARKUP) {
      fail(`"${id}" markup ${markup.toFixed(2)}x is below the ${MIN_MARKUP}x floor`);
    } else {
      const unit = cfg.pricing.unit ? `/${cfg.pricing.unit}` : "/call";
      const price =
        cfg.pricing.model === "per_unit" ? cfg.pricing.pricePerUnit : cfg.pricing.pricePerCall;
      ok(
        `"${id}" charges $${price}${unit} at ${markup.toFixed(1)}x markup ` +
          `(cost $${cfg.backend.costPerUnit}${unit})`,
      );
    }

    if (cfg.enabled) {
      console.log(`  note: "${id}" is enabled — wholesale key must be set or calls will fail`);
    }
  }

  console.log("Self-funding tracker:");
  const weeklyCost = getWeeklyCostUsd();
  if (!Number.isFinite(weeklyCost) || weeklyCost < 0) {
    fail(`AGENT_WEEKLY_COST_USD parsed to invalid value: ${weeklyCost}`);
  } else {
    ok(`weekly cost estimate $${weeklyCost.toFixed(2)} (AGENT_WEEKLY_COST_USD)`);
  }

  const funding = await getSelfFundingStatus();
  if (typeof funding.covered !== "boolean" || !Number.isFinite(funding.surplus)) {
    fail("getSelfFundingStatus() returned an invalid shape");
  } else {
    ok(
      `status: $${funding.revenueThisWeek.toFixed(2)} revenue vs $${funding.weeklyCostUsd.toFixed(2)} cost — ` +
        (funding.covered ? "COVERED" : "not yet covered"),
    );
  }

  if (failures > 0) {
    console.error(`\ntest:arbitrage failed with ${failures} failure(s)`);
    process.exit(1);
  }
  console.log("\ntest:arbitrage passed");
}

main().catch((error) => {
  console.error("test:arbitrage crashed:", error);
  process.exit(1);
});
