import "dotenv/config";
import { formatHostLabel, formatRelativeTime, formatStatusLabel } from "../core/health.js";
import { buildHealthContext } from "../core/worker.js";
import { loadSkills } from "../core/registry.js";
import { loadWorkerConfig } from "../types.js";
import { heartbeatSkill } from "../skills/heartbeat/index.js";
import { getLastHeartbeatReportAt } from "../core/state.js";

function buildPreviewMessage(context: Awaited<ReturnType<typeof buildHealthContext>>): string {
  const totalSkills =
    context.emailSkillCount + context.scheduledSkillCount + context.interactiveSkillCount;
  return [
    "SAG alive",
    "",
    "Health audit:",
    `- Host: ${formatHostLabel()}`,
    `- Last check: ${formatRelativeTime(context.previousLastRunAt)}`,
    `- Active skills: ${totalSkills} (${context.emailSkillCount} email, ${context.scheduledSkillCount} scheduled, ${context.interactiveSkillCount} interactive)`,
    `- Gmail: ${formatStatusLabel(context.gmailConfigured)}`,
    `- Telegram: ${formatStatusLabel(context.telegramConfigured)}`,
    `- Messages processed: ${context.processedMessageCount}`,
  ].join("\n");
}

async function main(): Promise<void> {
  const force = process.argv.includes("--force");
  const skills = await loadSkills();
  const config = loadWorkerConfig();
  const context = await buildHealthContext(skills, config);

  if (force) {
    console.log("Force mode: preview only (state not updated).\n");
    console.log(buildPreviewMessage(context));
    return;
  }

  const lastReportAt = await getLastHeartbeatReportAt();
  console.log(`Last heartbeat report: ${lastReportAt ?? "never"}\n`);

  const result = await heartbeatSkill.run(context);
  if (!result) {
    console.log("No heartbeat action needed right now.");
    console.log("Use `npm run test:heartbeat -- --force` to preview the message format.");
    return;
  }

  console.log(`Type: ${result.type}`);
  console.log("\n" + result.message);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
