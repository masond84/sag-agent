import { getRevenueStats, getServiceStats, logServiceUsage } from "../core/income/revenue-tracking.js";
import { getEnabledServices } from "../core/income/service-config.js";

async function main() {
  console.log("\n=== SAG INCOME SERVICE STATUS ===\n");
  
  console.log("ENABLED SERVICES:");
  const services = await getEnabledServices();
  for (const service of services) {
    console.log(`  - ${service.name} (${service.id})`);
    console.log(`    Pricing: ${JSON.stringify(service.pricing)}`);
    console.log(`    Backend: ${service.backend.type}`);
  }
  
  console.log("\n=== REVENUE STATS ===\n");
  const stats = await getRevenueStats();
  console.log(`Weekly Goal: $${stats.weeklyGoal}`);
  console.log(`This Week: $${stats.thisWeek.toFixed(2)} (${stats.weeklyProgress.toFixed(1)}%)`);
  console.log(`Today: $${stats.today.toFixed(2)}`);
  console.log(`Yesterday: $${stats.yesterday.toFixed(2)}`);
  console.log(`All Time: $${stats.allTime.toFixed(2)}`);
  console.log(`Days Remaining: ${stats.daysUntilGoal}`);
  
  console.log("\n=== SERVICE PERFORMANCE ===\n");
  const serviceStats = await getServiceStats();
  if (serviceStats.length === 0) {
    console.log("  No usage data yet. Services are ready to accept requests!");
  } else {
    for (const svc of serviceStats) {
      console.log(`${svc.serviceId}:`);
      console.log(`  Total Calls: ${svc.totalCalls}`);
      console.log(`  Success Rate: ${((svc.successfulCalls / svc.totalCalls) * 100).toFixed(1)}%`);
      console.log(`  Revenue: $${svc.totalRevenue.toFixed(2)}`);
      console.log(`  Profit: $${svc.totalProfit.toFixed(2)}`);
      console.log(`  Avg Profit/Call: $${svc.averageProfit.toFixed(2)}`);
      console.log(`  Last Used: ${svc.lastUsed || "Never"}`);
      console.log("");
    }
  }
  
  console.log("\n=== TEST API CALL ===\n");
  console.log("Simulating a test service call...");
  await logServiceUsage({
    timestamp: new Date().toISOString(),
    serviceId: "test-service",
    units: 1,
    revenue: 0.15,
    cost: 0.01,
    profit: 0.14,
    customerId: "test-customer",
    success: true,
  });
  console.log("Test call logged successfully!");
  
  console.log("\n=== NEXT STEPS ===\n");
  console.log("1. Set HOUSE_SERVER_ENABLED=true in .env");
  console.log("2. Run: npm run dev");
  console.log("3. Test API endpoint:");
  console.log("   curl -X POST http://localhost:9473/api/services/pdf/merge \\");
  console.log("     -H 'Content-Type: application/json' \\");
  console.log("     -d '{\"files\": [\"<base64-pdf>\"], \"customerId\": \"test\"}'");
  console.log("\n");
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
