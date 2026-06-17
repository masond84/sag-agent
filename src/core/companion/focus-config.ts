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

export function getActiveStartHour(): number {
  return Number(process.env.FOCUS_ACTIVE_START_HOUR ?? 8);
}

export function getActiveEndHour(): number {
  return Number(process.env.FOCUS_ACTIVE_END_HOUR ?? 21);
}

export function isWithinActiveHours(hour: number): boolean {
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

export function slotForHour(hour: number): string {
  return isHourlyMode() ? `hour-${hour}` : `anchor-${hour}`;
}

export function isFocusCompanionEnabled(): boolean {
  return (process.env.FOCUS_COMPANION_ENABLED ?? "true").toLowerCase() === "true";
}
