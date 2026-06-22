import { Cron } from "croner";
import type { AgentHealthContext, LoadedSkills, ScheduledSkill, WorkerConfig } from "../types.js";
import { getActiveNotifierLabel, isTelegramConfigured, sendNotification } from "./notify.js";
import { touchWorkerRun } from "./state.js";

function log(level: WorkerConfig["logLevel"], message: string): void {
  const levels = { debug: 0, info: 1, warn: 2, error: 3 };
  const configured = levels[level];
  const current = levels[(process.env.LOG_LEVEL ?? "info") as WorkerConfig["logLevel"]];
  if (current <= configured) {
    console.log(`[${level}] ${message}`);
  }
}

async function sendPreparedNotification(
  body: string,
  config: WorkerConfig,
  label: string,
  skipSpeech = false,
): Promise<void> {
  if (config.dryRun) {
    log("info", "DRY_RUN=true — notification not sent");
    return;
  }

  if (!isTelegramConfigured()) {
    log("warn", `${getActiveNotifierLabel()} not configured — notification not sent`);
    return;
  }

  await sendNotification(body, skipSpeech ? { speak: false } : undefined);
  log("info", `${label} sent via ${getActiveNotifierLabel()}`);
}

async function processScheduledSkill(
  skill: ScheduledSkill,
  context: AgentHealthContext,
  config: WorkerConfig,
): Promise<void> {
  log("debug", `Checking scheduled skill: ${skill.config.name}`);

  const result = await skill.run(context);
  if (!result) {
    return;
  }

  log("info", `Prepared ${result.type}:\n${result.message}`);

  if (result.bypassDryRun) {
    if (!isTelegramConfigured()) {
      log("warn", `${getActiveNotifierLabel()} not configured — notification not sent`);
      return;
    }
    await sendNotification(result.message, result.speak === false ? { speak: false } : undefined);
    log("info", `${skill.config.name} sent via ${getActiveNotifierLabel()}`);
    return;
  }

  await sendPreparedNotification(result.message, config, skill.config.name, result.speak === false);
}

export async function runScheduledTick(
  skills: LoadedSkills,
  context: AgentHealthContext,
  config: WorkerConfig,
): Promise<void> {
  const heartbeat = skills.scheduled.find((skill) => skill.config.id === "heartbeat");
  const otherScheduled = skills.scheduled.filter((skill) => skill.config.id !== "heartbeat");

  if (heartbeat) {
    await processScheduledSkill(heartbeat, context, config);
  }

  await touchWorkerRun();

  for (const skill of otherScheduled) {
    await processScheduledSkill(skill, context, config);
  }
}

export function startScheduledCron(
  skills: LoadedSkills,
  getContext: () => Promise<AgentHealthContext>,
  config: WorkerConfig,
): Cron {
  const pattern = process.env.SCHEDULE_CRON?.trim() || "* * * * *";

  return new Cron(pattern, { protect: true }, async () => {
    try {
      const context = await getContext();
      await runScheduledTick(skills, context, config);
    } catch (error) {
      log("error", error instanceof Error ? error.message : String(error));
    }
  });
}
