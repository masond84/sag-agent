import { logActivity } from "../../core/activity-log.js";
import { buildAliveReportMessage, buildRecoveryMessage } from "../../core/heartbeat-message.js";
import {
  getLastHeartbeatReportAt,
  getLastWatchdogAlertAt,
  markHeartbeatReported,
  markWatchdogAlerted,
} from "../../core/state.js";
import type {
  AgentHealthContext,
  ScheduledSkill,
  ScheduledSkillConfig,
  ScheduledSkillResult,
} from "../../types.js";

type HeartbeatSchedule = ScheduledSkillConfig["schedule"];

const DAY_MS = 86_400_000;

function getReportIntervalMs(schedule?: HeartbeatSchedule): number {
  return Number(process.env.HEARTBEAT_REPORT_INTERVAL_MS ?? schedule?.reportIntervalMs ?? DAY_MS);
}

function getStaleAfterMs(schedule?: HeartbeatSchedule): number {
  return Number(process.env.HEARTBEAT_STALE_AFTER_MS ?? schedule?.staleAfterMs ?? DAY_MS);
}

function getAlertCooldownMs(schedule?: HeartbeatSchedule): number {
  return Number(process.env.HEARTBEAT_ALERT_COOLDOWN_MS ?? schedule?.alertCooldownMs ?? DAY_MS);
}

async function shouldSendReport(schedule?: HeartbeatSchedule): Promise<boolean> {
  const lastReportAt = await getLastHeartbeatReportAt();
  if (!lastReportAt) {
    return true;
  }

  const elapsedMs = Date.now() - new Date(lastReportAt).getTime();
  return elapsedMs >= getReportIntervalMs(schedule);
}

async function shouldSendStaleAlert(schedule?: HeartbeatSchedule): Promise<boolean> {
  const lastAlertAt = await getLastWatchdogAlertAt();
  if (!lastAlertAt) {
    return true;
  }

  const elapsedMs = Date.now() - new Date(lastAlertAt).getTime();
  return elapsedMs >= getAlertCooldownMs(schedule);
}

function isWorkerStale(previousLastRunAt: string | undefined, schedule?: HeartbeatSchedule): boolean {
  if (!previousLastRunAt) {
    return false;
  }

  const elapsedMs = Date.now() - new Date(previousLastRunAt).getTime();
  return elapsedMs >= getStaleAfterMs(schedule);
}

async function runHeartbeat(
  context: AgentHealthContext,
  schedule?: HeartbeatSchedule,
): Promise<ScheduledSkillResult | null> {
  if (isWorkerStale(context.previousLastRunAt, schedule) && (await shouldSendStaleAlert(schedule))) {
    await markWatchdogAlerted();
    await logActivity("heartbeat_recovery", "Worker recovery alert — SAG came back online");

    return {
      type: "alert",
      message: await buildRecoveryMessage(context),
    };
  }

  if (!(await shouldSendReport(schedule))) {
    return null;
  }

  await markHeartbeatReported();
  await logActivity("heartbeat_report", "Daily alive heartbeat report sent");

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
  async run(context) {
    return runHeartbeat(context, this.config.schedule);
  },
};
