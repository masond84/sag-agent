import "dotenv/config";
import { buildAliveReportMessage, buildRecoveryMessage } from "../core/heartbeat-message.js";
import { buildHealthContext } from "../core/worker.js";
import { loadSkills } from "../core/registry.js";
import { loadWorkerConfig } from "../types.js";
import { heartbeatSkill } from "../skills/heartbeat/index.js";
import { getLastHeartbeatReportAt } from "../core/state.js";

const STALE_MS = 31 * 60 * 60 * 1000;

async function main(): Promise<void> {
  const force = process.argv.includes("--force");
  const recovery = process.argv.includes("--recovery");
  const send = process.argv.includes("--send");
  const skills = await loadSkills();
  const config = loadWorkerConfig();
  const context = await buildHealthContext(skills, config);
  const previewContext = recovery
    ? {
        ...context,
        previousLastRunAt: new Date(Date.now() - STALE_MS).toISOString(),
      }
    : context;

  if (force || recovery) {
    const message = recovery
      ? await buildRecoveryMessage(previewContext)
      : await buildAliveReportMessage(previewContext);

    console.log(`${recovery ? "Recovery" : "Alive report"} preview${force ? " (force)" : ""}:\n`);
    console.log(message);

    if (send) {
      const { isTelegramConfigured, sendNotification } = await import("../core/notify.js");
      if (!isTelegramConfigured()) {
        console.error("Telegram is not configured.");
        process.exit(1);
      }

      await sendNotification(message);
      console.log("\nSent preview to Telegram.");
    }

    return;
  }

  const lastReportAt = await getLastHeartbeatReportAt();
  console.log(`Last heartbeat report: ${lastReportAt ?? "never"}\n`);

  const result = await heartbeatSkill.run(context);
  if (!result) {
    console.log("No heartbeat action needed right now.");
    console.log("Use `npm run test:heartbeat -- --force` to preview the alive report.");
    console.log("Use `npm run test:heartbeat -- --recovery --force` to preview startup recovery.");
    console.log("Add `--send` to deliver a preview to Telegram.");
    return;
  }

  console.log(`Type: ${result.type}`);
  console.log("\n" + result.message);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
