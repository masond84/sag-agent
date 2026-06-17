import "dotenv/config";
import { recoverOrphanedDevLock } from "./core/dev/state.js";
import { loadSkills } from "./core/registry.js";
import { runWorker } from "./core/worker.js";
import { loadWorkerConfig } from "./types.js";

async function main(): Promise<void> {
  const once = process.argv.includes("--once");
  const config = loadWorkerConfig();
  if (await recoverOrphanedDevLock()) {
    console.warn("[warn] Cleared orphaned dev-runner lock from a prior run.");
  }
  const skills = await loadSkills();
  const skillCount = skills.email.length + skills.scheduled.length + skills.interactive.length;

  if (skillCount === 0) {
    console.warn("[warn] No enabled skills found in config/skills/");
  }

  await runWorker(skills, config, once);
}

main().catch((error) => {
  console.error("[error]", error);
  process.exit(1);
});
