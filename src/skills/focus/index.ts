import { buildCompanionMessage, resolveCompanionIntent } from "../../core/companion-message.js";
import {
  getFocusTimeZone,
  getTodayFocusDay,
  getTodayFocusText,
  hasSentTouchpointToday,
  markTouchpointSent,
  setPendingReplySlot,
} from "../../core/focus.js";
import { getZonedTimeInfo } from "../../core/schedule.js";
import type { AgentHealthContext, ScheduledSkill, ScheduledSkillResult } from "../../types.js";

function isEnabled(): boolean {
  return (process.env.FOCUS_COMPANION_ENABLED ?? "true").toLowerCase() === "true";
}

function isHourlyMode(): boolean {
  return (process.env.FOCUS_HOURLY ?? "false").toLowerCase() === "true";
}

function parseAnchorHours(): number[] {
  const raw = process.env.FOCUS_ANCHOR_HOURS?.trim() || "8,13,21";
  const hours = raw
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((hour) => Number.isInteger(hour) && hour >= 0 && hour <= 23);

  if (hours.length === 0) {
    return [8, 13, 21];
  }

  return [...new Set(hours)].sort((a, b) => a - b);
}

function getActiveStartHour(): number {
  return Number(process.env.FOCUS_ACTIVE_START_HOUR ?? 8);
}

function getActiveEndHour(): number {
  return Number(process.env.FOCUS_ACTIVE_END_HOUR ?? 21);
}

function isWithinActiveHours(hour: number): boolean {
  return hour >= getActiveStartHour() && hour <= getActiveEndHour();
}

export function getFocusAnchorHours(): number[] {
  return parseAnchorHours().filter((hour) => isWithinActiveHours(hour));
}

export function getCompanionHours(): number[] {
  if (!isHourlyMode()) {
    return getFocusAnchorHours();
  }

  const start = getActiveStartHour();
  const end = getActiveEndHour();
  const hours: number[] = [];

  for (let hour = start; hour <= end; hour += 1) {
    hours.push(hour);
  }

  return hours;
}

function slotForHour(hour: number): string {
  return isHourlyMode() ? `hour-${hour}` : `anchor-${hour}`;
}

async function runFocusCompanion(_context: AgentHealthContext): Promise<ScheduledSkillResult | null> {
  if (!isEnabled()) {
    return null;
  }

  const timeZone = getFocusTimeZone();
  const now = getZonedTimeInfo(timeZone);
  const companionHours = getCompanionHours();
  const anchorHours = getFocusAnchorHours();

  if (!isWithinActiveHours(now.hour)) {
    return null;
  }

  const currentHour = now.hour;
  if (!companionHours.includes(currentHour)) {
    return null;
  }

  const day = await getTodayFocusDay(timeZone);
  const hasFocus = Boolean(await getTodayFocusText(timeZone));
  const slot = slotForHour(currentHour);

  if (hasSentTouchpointToday(day, slot, now.dateKey)) {
    return null;
  }

  const intent = resolveCompanionIntent(currentHour, hasFocus, anchorHours);
  const message = await buildCompanionMessage(intent, slot, timeZone);

  await markTouchpointSent(slot, timeZone);

  if (anchorHours.includes(currentHour)) {
    await setPendingReplySlot(slot);
  }

  return {
    type: "briefing",
    bypassDryRun: true,
    message,
  };
}

export const focusCompanionSkill: ScheduledSkill = {
  kind: "scheduled",
  config: {
    id: "focus-companion",
    name: "Focus Companion",
    enabled: true,
    kind: "scheduled",
  },
  run: runFocusCompanion,
};
