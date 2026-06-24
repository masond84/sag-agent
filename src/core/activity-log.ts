import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { isHouseServerEnabled, publishHouseEvent } from "./house/events.js";

const DATA_DIR = path.resolve(process.cwd(), "data");
const ACTIVITY_FILE = path.join(DATA_DIR, "sag-activity.jsonl");
const MAX_LINE_BYTES = 8_192;

export type ActivityEventType =
  | "gmail_poll"
  | "gmail_bill_processed"
  | "focus_sent"
  | "focus_reply"
  | "heartbeat_report"
  | "heartbeat_recovery"
  | "morning_briefing"
  | "dev_cycle"
  | "chat_in"
  | "chat_out"
  | "life_message_sent"
  | "reflection"
  | "mcp_tool_call";

export interface ActivityEvent {
  at: string;
  type: ActivityEventType;
  summary: string;
  meta?: Record<string, string | number | boolean>;
}

function truncateSummary(summary: string): string {
  const trimmed = summary.trim().replace(/\s+/g, " ");
  if (trimmed.length <= 500) {
    return trimmed;
  }
  return `${trimmed.slice(0, 497)}...`;
}

export async function logActivity(
  type: ActivityEventType,
  summary: string,
  meta?: ActivityEvent["meta"],
): Promise<void> {
  const event: ActivityEvent = {
    at: new Date().toISOString(),
    type,
    summary: truncateSummary(summary),
    ...(meta && Object.keys(meta).length > 0 ? { meta } : {}),
  };

  const line = `${JSON.stringify(event)}\n`;
  if (Buffer.byteLength(line, "utf8") > MAX_LINE_BYTES) {
    return;
  }

  try {
    await mkdir(DATA_DIR, { recursive: true });
    await appendFile(ACTIVITY_FILE, line, "utf8");
    if (isHouseServerEnabled()) {
      publishHouseEvent("activity", {
        text: event.summary,
        meta: { type: event.type, ...(event.meta ?? {}) },
      });
    }
  } catch (error) {
    if ((process.env.LOG_LEVEL ?? "info") !== "error") {
      console.warn(
        `[warn] Activity log: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

export interface RecentActivityOptions {
  sinceHours?: number;
  sinceIso?: string;
  types?: ActivityEventType[];
  limit?: number;
}

export async function getRecentActivity(options: RecentActivityOptions = {}): Promise<ActivityEvent[]> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const sinceMs = options.sinceIso
    ? new Date(options.sinceIso).getTime()
    : Date.now() - (options.sinceHours ?? 24) * 60 * 60 * 1000;
  const typeSet = options.types ? new Set(options.types) : null;

  let raw = "";
  try {
    raw = await readFile(ACTIVITY_FILE, "utf8");
  } catch {
    return [];
  }

  const events: ActivityEvent[] = [];
  const lines = raw.split("\n").filter(Boolean);

  for (let index = lines.length - 1; index >= 0 && events.length < limit; index -= 1) {
    try {
      const event = JSON.parse(lines[index]!) as ActivityEvent;
      if (new Date(event.at).getTime() < sinceMs) {
        continue;
      }
      if (typeSet && !typeSet.has(event.type)) {
        continue;
      }
      events.push(event);
    } catch {
      continue;
    }
  }

  return events.reverse();
}

export function formatActivityForPrompt(events: ActivityEvent[]): string {
  if (events.length === 0) {
    return "No recent activity logged.";
  }

  return events
    .map((event) => {
      const time = event.at.slice(0, 16).replace("T", " ");
      const meta =
        event.meta && Object.keys(event.meta).length > 0
          ? ` (${Object.entries(event.meta)
              .map(([key, value]) => `${key}=${value}`)
              .join(", ")})`
          : "";
      return `- ${time} [${event.type}] ${event.summary}${meta}`;
    })
    .join("\n");
}

export async function summarizeRecentActivity(options: RecentActivityOptions = {}): Promise<string> {
  const events = await getRecentActivity(options);
  return formatActivityForPrompt(events);
}
