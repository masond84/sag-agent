import "dotenv/config";
import {
  addExplicitMemory,
  addUserSeedMemory,
  isMem0Enabled,
  resolveMemoryUserId,
  searchUserMemories,
} from "../core/memory/mem0-service.js";
import { formatProfileForPrompt, loadAgentProfile } from "../core/memory/profile.js";

async function main(): Promise<void> {
  const userId = resolveMemoryUserId(process.argv.find((arg) => arg.startsWith("--user="))?.split("=")[1]);
  const query = process.argv.find((arg) => arg.startsWith("--query="))?.split("=")[1] ?? "What do you know about me?";
  const remember = process.argv.find((arg) => arg.startsWith("--remember="))?.slice("--remember=".length);
  const seed = process.argv.find((arg) => arg.startsWith("--seed="))?.slice("--seed=".length);

  console.log(`Mem0 enabled: ${isMem0Enabled()}`);
  console.log(`Memory user id: ${userId}\n`);

  const profile = await loadAgentProfile();
  console.log(formatProfileForPrompt(profile));
  console.log();

  if (seed) {
    await addUserSeedMemory(userId, seed);
    console.log(`Seeded user persona (verbatim, infer=false).\n`);
  }

  if (remember) {
    await addExplicitMemory(userId, remember);
    console.log(`Remembered: ${remember}\n`);
  }

  const memories = await searchUserMemories(userId, query);
  console.log(memories || "(no matching memories yet)");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
