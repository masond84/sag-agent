import type { AgentHealthContext, ScheduledSkill, ScheduledSkillResult } from "../../types.js";
import { buildAliveReportMessage, buildRecoveryMessage } from "../../core/heartbeat-message.js";
import {
  getLastHeartbeatReportAt,
  getLastWatchdogAlertAt,
  markHeartbeatReported,
  markWatchdogAlerted,
} from "../../core/state.js";

const DAY_MS = 86_400_000;

function getReportIntervalMs(): number {
  return Number(process.env.HEARTBEAT_REPORT_INTERVAL_MS ?? DAY_MS);
}

function getStaleAfterMs(): number {
  return Number(process.env.HEARTBEAT_STALE_AFTER_MS ?? DAY_MS);
}

function getAlertCooldownMs(): number {
  return Number(process.env.HEARTBEAT_ALERT_COOLDOWN_MS ?? DAY_MS);
}

async function shouldSendReport(): Promise<boolean> {
  const lastReportAt = await getLastHeartbeatReportAt();
  if (!lastReportAt) {
    return true;
  }

  const elapsedMs = Date.now() - new Date(lastReportAt).getTime();
  return elapsedMs >= getReportIntervalMs();
}

async function shouldSendStaleAlert(): Promise<boolean> {
  const lastAlertAt = await getLastWatchdogAlertAt();
  if (!lastAlertAt) {
    return true;
  }

  const elapsedMs = Date.now() - new Date(lastAlertAt).getTime();
  return elapsedMs >= getAlertCooldownMs();
}

function isWorkerStale(previousLastRunAt?: string): boolean {
  if (!previousLastRunAt) {
    return false;
  }

  const elapsedMs = Date.now() - new Date(previousLastRunAt).getTime();
  return elapsedMs >= getStaleAfterMs();
}

async function runHeartbeat(context: AgentHealthContext): Promise<ScheduledSkillResult | null> {
  if (isWorkerStale(context.previousLastRunAt) && (await shouldSendStaleAlert())) {
    await markWatchdogAlerted();

    return {
      type: "alert",
      message: await buildRecoveryMessage(context),
    };
  }

  if (!(await shouldSendReport())) {
    return null;
  }

  await markHeartbeatReported();

  return {
    type: "report",
    message: await buildAliveReportMessage(context),
  };
}

export const heartbeatSkill: ScheduledSkill = {
  kind: "scheduled",
  config: {
    id: "heartbeat",
    name: "Heartbeat",
    enabled: true,
    kind: "scheduled",
  },
  run: runHeartbeat,
};
