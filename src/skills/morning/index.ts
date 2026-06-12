import { getZonedTimeInfo, hasReachedDailyTime } from "../../core/schedule.js";
import {
  getLastMorningBriefingDate,
  markMorningBriefingSent,
} from "../../core/state.js";
import type { AgentHealthContext, ScheduledSkill, ScheduledSkillResult } from "../../types.js";

function isEnabled(): boolean {
  return (process.env.MORNING_BRIEFING_ENABLED ?? "true").toLowerCase() === "true";
}

function getBriefingTime(): string {
  return process.env.MORNING_BRIEFING_TIME?.trim() || "07:30";
}

function getTimeZone(): string {
  return process.env.MORNING_BRIEFING_TIMEZONE?.trim() || "America/New_York";
}

export function buildMorningBriefingMessage(timeZone: string): string {
  const now = getZonedTimeInfo(timeZone);
  return `Good morning — happy ${now.weekday}.`;
}

async function runMorningBriefing(_context: AgentHealthContext): Promise<ScheduledSkillResult | null> {
  if (!isEnabled()) {
    return null;
  }

  const timeZone = getTimeZone();
  const briefingTime = getBriefingTime();
  const lastSent = await getLastMorningBriefingDate();

  if (!hasReachedDailyTime(timeZone, briefingTime, lastSent)) {
    return null;
  }

  const now = getZonedTimeInfo(timeZone);
  await markMorningBriefingSent(now.dateKey);

  return {
    type: "briefing",
    bypassDryRun: true,
    message: buildMorningBriefingMessage(timeZone),
  };
}

export const morningSkill: ScheduledSkill = {
  kind: "scheduled",
  config: {
    id: "morning-briefing",
    name: "Morning Briefing",
    enabled: true,
    kind: "scheduled",
  },
  run: runMorningBriefing,
};
