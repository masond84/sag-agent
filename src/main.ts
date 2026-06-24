import "dotenv/config";
import { recoverOrphanedDevLock } from "./core/dev/state.js";
import { initMcpBridge, shutdownMcpBridge } from "./core/mcp/index.js";
import { loadSkills } from "./core/registry.js";
import { runWorker } from "./core/worker.js";
import { loadWorkerConfig } from "./types.js";

let shuttingDown = false;

async function shutdown(signal?: string): Promise<void> {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  if (signal) {
    console.log(`[info] Shutting down (${signal})...`);
  }
  await shutdownMcpBridge();
  process.exit(0);
}

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

  await initMcpBridge();

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });

  await runWorker(skills, config, once);
}

main().catch(async (error) => {
  console.error("[error]", error);
  await shutdownMcpBridge();
  process.exit(1);
});
