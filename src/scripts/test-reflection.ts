import { addAgentDiary, isMem0Enabled, listAgentMemories, resolveAgentId } from "../core/memory/mem0-service.js";
import { summarizeRecentActivity } from "../core/activity-log.js";

async function main(): Promise<void> {
  console.log(`Mem0 enabled: ${isMem0Enabled()}`);
  console.log(`Agent id: ${resolveAgentId()}\n`);

  const activity = await summarizeRecentActivity({ sinceHours: 24, limit: 15 });
  console.log("Activity (24h):\n", activity, "\n");

  const seed = process.argv.find((arg) => arg.startsWith("--seed="))?.split("=").slice(1).join("=");
  if (seed) {
    await addAgentDiary(seed, { source: "test" });
    console.log("Seeded agent diary entry.\n");
  }

  console.log(await listAgentMemories(8));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
