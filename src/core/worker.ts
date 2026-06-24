import { logActivity } from "./activity-log.js";
import { saveBill } from "./bills.js";
import type { AgentHealthContext, LoadedSkills, WorkerConfig } from "../types.js";
import { fetchMessages, formatGmailAuthError, isGmailConfigured } from "./gmail.js";
import { getActiveNotifierLabel, isTelegramConfigured, sendNotification } from "./notify.js";
import { summarizeSkills } from "./registry.js";
import { runScheduledTick, startScheduledCron } from "./scheduler.js";
import {
  getLastRunAt,
  getProcessedMessageCount,
  hasProcessed,
  markProcessed,
} from "./state.js";
import { startHouseServer } from "./house/server.js";
import { startTelegramBot } from "./telegram-bot.js";

function log(level: WorkerConfig["logLevel"], message: string): void {
  const levels = { debug: 0, info: 1, warn: 2, error: 3 };
  const configured = levels[level];
  const current = levels[(process.env.LOG_LEVEL ?? "info") as WorkerConfig["logLevel"]];
  if (current <= configured) {
    console.log(`[${level}] ${message}`);
  }
}

function isGmailPollEnabled(skills: LoadedSkills): boolean {
  return skills.scheduled.some((skill) => skill.config.id === "gmail-poll");
}

async function processEmailSkills(skills: LoadedSkills, config: WorkerConfig): Promise<void> {
  if (!isGmailPollEnabled(skills)) {
    log("debug", "Gmail poll skill disabled — email skills skipped");
    return;
  }

  if (!isGmailConfigured()) {
    log(
      "warn",
      "Gmail not configured — email skills skipped. Run `npm run auth:gmail` after setting Gmail credentials in .env",
    );
    return;
  }

  for (const skill of skills.email) {
    log("info", `Checking email skill: ${skill.config.name}`);

    try {
      const messages = await fetchMessages(skill.config.trigger.gmailQuery, 10);
      log("debug", `Found ${messages.length} candidate message(s)`);
      await logActivity("gmail_poll", `Polled ${skill.config.name}: ${messages.length} candidate(s)`, {
        skill: skill.config.id,
        candidates: messages.length,
      });

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
        await logActivity("gmail_bill_processed", `Processed bill: ${message.subject}`, {
          skill: skill.config.id,
          messageId: message.id,
        });

        if (config.dryRun) {
          log("info", "DRY_RUN=true — notification not sent");
        } else if (!isTelegramConfigured()) {
          log("warn", `${getActiveNotifierLabel()} not configured — notification not sent`);
        } else {
          await sendNotification(notificationBody);
          log("info", `Notification sent via ${getActiveNotifierLabel()}`);
        }

        await markProcessed(message.id);
        continue;
      }

      log("debug", `Skipping already processed message ${message.id}`);
    }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      log("error", formatGmailAuthError(error));
      await logActivity("gmail_poll", `Gmail poll failed: ${detail.slice(0, 120)}`, {
        skill: skill.config.id,
        error: true,
      });
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
    skills: summarizeSkills(skills),
  };
}

export async function runWorker(skills: LoadedSkills, config: WorkerConfig, once = false): Promise<void> {
  const skillCount = skills.email.length + skills.scheduled.length + skills.interactive.length;
  log("info", `SAG worker started (dryRun=${config.dryRun}, once=${once}, skills=${skillCount})`);

  const getHealthContext = () => buildHealthContext(skills, config);
  const getInteractiveContext = async () => ({
    health: await getHealthContext(),
    skills: summarizeSkills(skills),
  });

  if (!once) {
    startHouseServer(getHealthContext, getInteractiveContext);
  }

  if (!once && isTelegramConfigured() && skills.interactive.length > 0) {
    await startTelegramBot(getInteractiveContext);
  } else if (!once && skills.interactive.length > 0 && !isTelegramConfigured()) {
    log("warn", "Telegram not configured — chat bot not started");
  }

  const runEmailCycle = async () => {
    try {
      await processEmailSkills(skills, config);
    } catch (error) {
      log("error", formatGmailAuthError(error));
    }
  };

  const runScheduleOnce = async () => {
    try {
      const context = await getHealthContext();
      await runScheduledTick(skills, context, config);
    } catch (error) {
      log("error", error instanceof Error ? error.message : String(error));
    }
  };

  await runScheduleOnce();

  if (isGmailPollEnabled(skills)) {
    await runEmailCycle();
  } else {
    log("info", "Gmail poll skill disabled — email polling not started");
  }

  if (once) {
    return;
  }

  startScheduledCron(skills, getHealthContext, config);
  log("info", `Scheduled skills cron started (pattern=${process.env.SCHEDULE_CRON?.trim() || "* * * * *"})`);

  if (isGmailPollEnabled(skills)) {
    log("info", `Email poll interval: ${config.pollIntervalMs}ms`);
    setInterval(runEmailCycle, config.pollIntervalMs);
  }
}
