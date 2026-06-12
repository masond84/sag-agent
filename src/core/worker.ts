import { saveBill } from "./bills.js";
import type { AgentHealthContext, EmailSkill, LoadedSkills, ScheduledSkill, WorkerConfig } from "../types.js";
import { fetchMessages, formatGmailAuthError, isGmailConfigured } from "./gmail.js";
import { getActiveNotifierLabel, isTelegramConfigured, sendNotification } from "./notify.js";
import { summarizeSkills } from "./registry.js";
import {
  getLastRunAt,
  getProcessedMessageCount,
  hasProcessed,
  markProcessed,
  touchWorkerRun,
} from "./state.js";

function log(level: WorkerConfig["logLevel"], message: string): void {
  const levels = { debug: 0, info: 1, warn: 2, error: 3 };
  const configured = levels[level];
  const current = levels[(process.env.LOG_LEVEL ?? "info") as WorkerConfig["logLevel"]];
  if (current <= configured) {
    console.log(`[${level}] ${message}`);
  }
}

async function sendPreparedNotification(body: string, config: WorkerConfig, label: string): Promise<void> {
  if (config.dryRun) {
    log("info", "DRY_RUN=true — notification not sent");
    return;
  }

  if (!isTelegramConfigured()) {
    log("warn", `${getActiveNotifierLabel()} not configured — notification not sent`);
    return;
  }

  await sendNotification(body);
  log("info", `${label} sent via ${getActiveNotifierLabel()}`);
}

async function processEmailSkill(skill: EmailSkill, config: WorkerConfig): Promise<void> {
  log("info", `Checking email skill: ${skill.config.name}`);

  const messages = await fetchMessages(skill.config.trigger.gmailQuery, 10);
  log("debug", `Found ${messages.length} candidate message(s)`);

  for (const message of messages) {
    if (!(await hasProcessed(message.id))) {
      if (!skill.matches(message)) {
        continue;
      }

      log("info", `Processing message ${message.id}: ${message.subject}`);

      const extracted = skill.extract(message);
      if (!extracted) {
        log("warn", `Could not extract data from message ${message.id}`);
        continue;
      }

      const notificationBody = skill.format(extracted);
      log("info", `Prepared notification:\n${notificationBody}`);
      await saveBill(message.id, extracted);
      await sendPreparedNotification(notificationBody, config, "Notification");
      await markProcessed(message.id);
      continue;
    }

    log("debug", `Skipping already processed message ${message.id}`);
  }
}

async function processScheduledSkill(
  skill: ScheduledSkill,
  context: AgentHealthContext,
  config: WorkerConfig,
): Promise<void> {
  log("info", `Checking scheduled skill: ${skill.config.name}`);

  const result = await skill.run(context);
  if (!result) {
    log("debug", `No action needed for ${skill.config.name}`);
    return;
  }

  log("info", `Prepared ${result.type}:\n${result.message}`);

  if (result.bypassDryRun) {
    if (!isTelegramConfigured()) {
      log("warn", `${getActiveNotifierLabel()} not configured — notification not sent`);
      return;
    }
    await sendNotification(result.message);
    log("info", `${result.type} sent via ${getActiveNotifierLabel()}`);
    return;
  }

  await sendPreparedNotification(result.message, config, result.type === "alert" ? "Watchdog alert" : "Heartbeat");
}

async function processInteractiveSkills(skills: LoadedSkills, context: AgentHealthContext): Promise<void> {
  if (skills.interactive.length === 0) {
    return;
  }

  if (!isTelegramConfigured()) {
    log("warn", "Telegram not configured — interactive skills skipped");
    return;
  }

  const interactiveContext = {
    health: context,
    skills: summarizeSkills(skills),
  };

  for (const skill of skills.interactive) {
    log("info", `Checking interactive skill: ${skill.config.name}`);
    try {
      await skill.run(interactiveContext);
    } catch (error) {
      log("error", error instanceof Error ? error.message : String(error));
    }
  }
}

export async function buildHealthContext(
  skills: LoadedSkills,
  config: WorkerConfig,
): Promise<AgentHealthContext> {
  return {
    previousLastRunAt: await getLastRunAt(),
    emailSkillCount: skills.email.length,
    scheduledSkillCount: skills.scheduled.length,
    interactiveSkillCount: skills.interactive.length,
    processedMessageCount: await getProcessedMessageCount(),
    gmailConfigured: isGmailConfigured(),
    telegramConfigured: isTelegramConfigured(),
    dryRun: config.dryRun,
  };
}

export async function runWorkerCycle(skills: LoadedSkills, config: WorkerConfig): Promise<void> {
  const healthContext = await buildHealthContext(skills, config);
  await touchWorkerRun();

  await processInteractiveSkills(skills, healthContext);

  if (isGmailConfigured()) {
    for (const skill of skills.email) {
      await processEmailSkill(skill, config);
    }
  } else {
    log(
      "warn",
      "Gmail not configured — email skills skipped. Run `npm run auth:gmail` after setting Gmail credentials in .env",
    );
  }

  for (const skill of skills.scheduled) {
    await processScheduledSkill(skill, healthContext, config);
  }
}

export async function runWorker(skills: LoadedSkills, config: WorkerConfig, once = false): Promise<void> {
  const skillCount = skills.email.length + skills.scheduled.length + skills.interactive.length;
  log("info", `SAG worker started (dryRun=${config.dryRun}, once=${once}, skills=${skillCount})`);

  const cycle = async () => {
    try {
      await runWorkerCycle(skills, config);
    } catch (error) {
      log("error", formatGmailAuthError(error));
    }
  };

  await cycle();

  if (once) {
    return;
  }

  setInterval(cycle, config.pollIntervalMs);
}
