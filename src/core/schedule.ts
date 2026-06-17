export interface ZonedTimeInfo {
  dateKey: string;
  hour: number;
  minute: number;
  weekday: string;
  minutesSinceMidnight: number;
}

export function parseTimeHHMM(value: string): { hour: number; minute: number } {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    throw new Error(`Invalid time format "${value}". Use HH:MM (e.g. 07:30).`);
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  if (hour > 23 || minute > 59) {
    throw new Error(`Invalid time "${value}".`);
  }

  return { hour, minute };
}

export function getZonedTimeInfo(timeZone: string): ZonedTimeInfo {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "long",
    hourCycle: "h23",
  }).formatToParts(new Date());

  const read = (type: string) => parts.find((part) => part.type === type)?.value ?? "";

  const hour = Number(read("hour"));
  const minute = Number(read("minute"));
  const dateKey = `${read("year")}-${read("month")}-${read("day")}`;

  return {
    dateKey,
    hour,
    minute,
    weekday: read("weekday"),
    minutesSinceMidnight: hour * 60 + minute,
  };
}

export function hasReachedDailyTime(
  timeZone: string,
  targetTime: string,
  lastSentDateKey?: string,
): boolean {
  const now = getZonedTimeInfo(timeZone);
  const target = parseTimeHHMM(targetTime);
  const targetMinutes = target.hour * 60 + target.minute;

  if (now.minutesSinceMidnight < targetMinutes) {
    return false;
  }

  if (lastSentDateKey === now.dateKey) {
    return false;
  }

  return true;
}
