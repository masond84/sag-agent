import { logActivity, summarizeRecentActivity } from "../../core/activity-log.js";
import { isLlmConfigured } from "../../core/llm.js";
import { addAgentDiary } from "../../core/memory/mem0-service.js";
import { buildSagPersonaBlock } from "../../core/persona.js";
import { getLastReflectionAt, markReflectionCompleted } from "../../core/state.js";
import { getZonedTimeInfo } from "../../core/schedule.js";
import type { AgentHealthContext, ScheduledSkill, ScheduledSkillResult } from "../../types.js";

function isEnabled(): boolean {
  return (process.env.REFLECTION_ENABLED ?? "true").toLowerCase() === "true";
}

function getTimeZone(): string {
  return (
    process.env.REFLECTION_TIMEZONE?.trim() ||
    process.env.FOCUS_TIMEZONE?.trim() ||
    "America/New_York"
  );
}

function getReflectionHours(): number[] {
  const raw = process.env.REFLECTION_HOURS?.trim() || "13,21";
  const hours = raw
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((hour) => Number.isInteger(hour) && hour >= 0 && hour <= 23);

  return hours.length > 0 ? [...new Set(hours)].sort((a, b) => a - b) : [13, 21];
}

async function runShortReflectionLlm(activitySummary: string, dateLabel: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const baseUrl = (process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = process.env.ASSISTANT_MODEL?.trim() || "gpt-4o-mini";

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 280,
      temperature: 0.8,
      messages: [
        {
          role: "system",
          content: buildSagPersonaBlock([
            "Write a short private diary entry (3-5 sentences) about your day so far based on the activity log.",
            "Include moods, observations, and what you did while the user was away.",
            "First person, conversational, no markdown.",
          ]),
        },
        {
          role: "user",
          content: [`Date: ${dateLabel}`, "", "Activity log:", activitySummary].join("\n"),
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Reflection LLM failed (${response.status}): ${errorBody}`);
  }

  const payload = (await response.json()) as {
    choices: Array<{ message: { content: string | null } }>;
  };

  const content = payload.choices[0]?.message.content?.trim();
  if (!content) {
    throw new Error("Reflection LLM returned empty content");
  }

  return content;
}

async function runReflection(_context: AgentHealthContext): Promise<ScheduledSkillResult | null> {
  if (!isEnabled()) {
    return null;
  }

  const timeZone = getTimeZone();
  const now = getZonedTimeInfo(timeZone);
  const reflectionHours = getReflectionHours();

  if (!reflectionHours.includes(now.hour)) {
    return null;
  }

  const slotKey = `${now.dateKey}-h${now.hour}`;
  const lastReflection = await getLastReflectionAt();
  if (lastReflection === slotKey) {
    return null;
  }

  const sinceHours = now.hour <= 13 ? now.hour + 1 : now.hour - (reflectionHours[reflectionHours.length - 2] ?? 13);
  const activitySummary = await summarizeRecentActivity({
    sinceHours: Math.max(sinceHours, 4),
    limit: 40,
  });

  let diary = `Quiet stretch on ${now.weekday} — nothing notable in the activity log.`;

  if (isLlmConfigured() && activitySummary !== "No recent activity logged.") {
    try {
      diary = await runShortReflectionLlm(activitySummary, `${now.weekday} ${now.dateKey}`);
    } catch (error) {
      console.warn(
        `[warn] Reflection LLM: ${error instanceof Error ? error.message : String(error)}`,
      );
      diary = `Activity today: ${activitySummary.split("\n").slice(0, 3).join("; ")}`;
    }
  }

  await addAgentDiary(diary, { slot: slotKey, dateKey: now.dateKey });
  await markReflectionCompleted(slotKey);
  await logActivity("reflection", diary.slice(0, 200), { slot: slotKey });

  return null;
}

export const reflectionSkill: ScheduledSkill = {
  kind: "scheduled",
  config: {
    id: "reflection",
    name: "Agent Reflection",
    enabled: true,
    kind: "scheduled",
  },
  run: runReflection,
};
