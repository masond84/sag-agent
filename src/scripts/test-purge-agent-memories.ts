import "dotenv/config";
import {
  isMem0Enabled,
  listAgentMemories,
  purgeGenericAgentMemories,
} from "../core/memory/mem0-service.js";

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");

  console.log(`Mem0 enabled: ${isMem0Enabled()}`);
  console.log(`Mode: ${dryRun ? "dry-run (list only)" : "purge"}\n`);

  if (dryRun) {
    console.log(await listAgentMemories(20));
    return;
  }

  const result = await purgeGenericAgentMemories();
  console.log(`Purged ${result.deleted} generic agent memories, kept ${result.kept}.\n`);
  console.log(await listAgentMemories(12));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
