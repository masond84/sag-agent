import "dotenv/config";
import {
  createCheckoutSession,
  getBillingConfigStatus,
  getCreditPacks,
  isBillingEnabled,
} from "../core/income/billing.js";

async function main() {
  console.log("\n=== SAG BILLING CONFIGURATION ===\n");

  const status = getBillingConfigStatus();
  console.log(`STRIPE_SECRET_KEY: ${status.secretKeyConfigured ? "configured" : "MISSING"}`);
  console.log(
    `STRIPE_WEBHOOK_SECRET: ${status.webhookSecretConfigured ? "configured" : "MISSING (needed for webhooks)"}`,
  );
  console.log(`Billing enabled: ${status.enabled}`);

  const packs = getCreditPacks();
  console.log(`\nCredit packs (${packs.length}):`);
  for (const pack of packs) {
    console.log(`  - ${pack.id}: ${pack.name} — ${pack.description}`);
  }

  if (!isBillingEnabled()) {
    console.log("\n=== SETUP STEPS ===\n");
    console.log("1. Copy .env.example to .env if needed: cp .env.example .env");
    console.log("2. Get test keys from https://dashboard.stripe.com/test/apikeys");
    console.log("3. Set STRIPE_SECRET_KEY=sk_test_... in .env");
    console.log("4. Add webhook at https://dashboard.stripe.com/test/webhooks");
    console.log("   URL: http://localhost:9473/api/billing/webhook");
    console.log("   Event: checkout.session.completed");
    console.log("5. Set STRIPE_WEBHOOK_SECRET=whsec_... in .env");
    console.log("6. Set HOUSE_SERVER_ENABLED=true, run npm run dev");
    console.log('7. Verify checkout: curl -X POST http://localhost:9473/api/billing/buy \\');
    console.log('     -H "Content-Type: application/json" \\');
    console.log('     -d \'{"packId":"starter"}\'');
    console.log("\nRe-run npm run test:billing after setting STRIPE_SECRET_KEY to verify checkout.\n");
    return;
  }

  console.log("\n=== CHECKOUT VERIFICATION ===\n");
  console.log("Creating test checkout session via /api/billing/buy flow (starter pack)...");

  const session = await createCheckoutSession({ packId: "starter" });
  console.log(`Session ID: ${session.sessionId}`);
  console.log(`Customer ID: ${session.customerId}`);
  console.log(`Pack: ${session.pack.name} (${session.pack.credits} credits)`);
  console.log(`Checkout URL: ${session.url}`);

  if (!session.url.startsWith("https://checkout.stripe.com/")) {
    throw new Error(`Unexpected checkout URL: ${session.url}`);
  }

  console.log("\nCheckout verification passed.");
  if (!status.webhookSecretConfigured) {
    console.log("\nNote: STRIPE_WEBHOOK_SECRET is not set — webhooks will fail until configured.");
  }
  console.log("");
}

main().catch((error) => {
  console.error("Billing test failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
