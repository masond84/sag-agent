import { logActivity } from "../activity-log.js";
import { buildCompanionMessage, resolveCompanionIntent } from "../companion-message.js";
import {
  getFocusTimeZone,
  getTodayFocusDay,
  getTodayFocusText,
  hasSentTouchpointToday,
  markTouchpointSent,
  setPendingReplySlot,
} from "../focus.js";
import { getZonedTimeInfo } from "../schedule.js";
import type { AgentHealthContext, ScheduledSkillResult } from "../../types.js";
import {
  getCompanionHours,
  getFocusAnchorHours,
  isFocusCompanionEnabled,
  isWithinActiveHours,
  slotForHour,
} from "./focus-config.js";
import { buildLifeCompanionMessage } from "./life-message.js";
import { getDueLifeSlot, markLifeSlotSent } from "./life-state.js";

export { getCompanionHours, getFocusAnchorHours } from "./focus-config.js";

function isLifeCompanionEnabled(): boolean {
  return (process.env.LIFE_COMPANION_ENABLED ?? "true").toLowerCase() === "true";
}

async function tryFocusTouchpoint(timeZone: string, now: ReturnType<typeof getZonedTimeInfo>): Promise<ScheduledSkillResult | null> {
  if (!isFocusCompanionEnabled()) {
    return null;
  }

  const companionHours = getCompanionHours();
  const anchorHours = getFocusAnchorHours();

  if (!isWithinActiveHours(now.hour)) {
    return null;
  }

  if (!companionHours.includes(now.hour)) {
    return null;
  }

  const day = await getTodayFocusDay(timeZone);
  const hasFocus = Boolean(await getTodayFocusText(timeZone));
  const slot = slotForHour(now.hour);

  if (hasSentTouchpointToday(day, slot, now.dateKey)) {
    return null;
  }

  const intent = resolveCompanionIntent(now.hour, hasFocus, anchorHours);
  const message = await buildCompanionMessage(intent, slot, timeZone);

  await markTouchpointSent(slot, timeZone);
  await logActivity("focus_sent", `Focus check-in (${intent})`, { slot, intent });

  if (anchorHours.includes(now.hour)) {
    await setPendingReplySlot(slot);
  }

  return {
    type: "briefing",
    bypassDryRun: true,
    message,
  };
}

async function tryLifeTouchpoint(timeZone: string, now: ReturnType<typeof getZonedTimeInfo>): Promise<ScheduledSkillResult | null> {
  if (!isLifeCompanionEnabled()) {
    return null;
  }

  const dueSlot = await getDueLifeSlot(now.dateKey, now.hour, now.minute);
  if (!dueSlot) {
    return null;
  }

  const message = await buildLifeCompanionMessage(timeZone);
  await markLifeSlotSent(now.dateKey, dueSlot);
  await logActivity("life_message_sent", message.slice(0, 120), {
    hour: dueSlot.hour,
    minute: dueSlot.minute,
  });

  return {
    type: "briefing",
    bypassDryRun: true,
    message,
  };
}

export async function runUnifiedCompanion(_context: AgentHealthContext): Promise<ScheduledSkillResult | null> {
  const timeZone = getFocusTimeZone();
  const now = getZonedTimeInfo(timeZone);

  const focusResult = await tryFocusTouchpoint(timeZone, now);
  if (focusResult) {
    return focusResult;
  }

  return tryLifeTouchpoint(timeZone, now);
}
