import { summarizeRecentActivity } from "../activity-log.js";
import { isLlmConfigured } from "../llm.js";
import { searchAgentMemories } from "../memory/mem0-service.js";
import { getZonedTimeInfo } from "../schedule.js";
import { getFocusTimeZone } from "../focus.js";
import { buildSagPersonaBlock } from "../persona.js";

async function runShortLlmCompletion(system: string, user: string, maxTokens = 120): Promise<string> {
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
      max_tokens: maxTokens,
      temperature: 0.85,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Life companion LLM failed (${response.status}): ${errorBody}`);
  }

  const payload = (await response.json()) as {
    choices: Array<{ message: { content: string | null } }>;
  };

  const content = payload.choices[0]?.message.content?.trim();
  if (!content) {
    throw new Error("Life companion LLM returned empty content");
  }

  return content;
}

function buildLifeTemplate(weekday: string): string {
  return `Hey — random thought while you're doing your thing. How's your ${weekday} actually going?`;
}

export async function buildLifeCompanionMessage(timeZone?: string): Promise<string> {
  const zone = timeZone ?? getFocusTimeZone();
  const now = getZonedTimeInfo(zone);
  const template = buildLifeTemplate(now.weekday);

  if (!isLlmConfigured()) {
    return template;
  }

  const [activity, agentMemories] = await Promise.all([
    summarizeRecentActivity({ sinceHours: 12, limit: 12 }),
    searchAgentMemories("recent mood hobbies thoughts", 4),
  ]);

  const system = buildSagPersonaBlock([
    "Write ONE spontaneous life message (1-2 sentences, under 280 characters).",
    "Personal, mission-aware, occasionally sarcastic — not a productivity check-in.",
    "Do NOT mention /focus unless work is clearly relevant. No markdown.",
  ]);

  const user = [
    `Weekday: ${now.weekday}`,
    `Hour: ${now.hour}`,
    agentMemories ? `Agent memories:\n${agentMemories}` : "",
    `Recent activity:\n${activity}`,
    `Fallback: ${template}`,
    "Write the Telegram message only.",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    return await runShortLlmCompletion(system, user);
  } catch {
    return template;
  }
}
