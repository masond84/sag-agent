import { getRecentCheckInReplies, getTodayFocusDay } from "./focus.js";
import { isLlmConfigured } from "./llm.js";
import { getZonedTimeInfo } from "./schedule.js";

export type CompanionIntent =
  | "morning"
  | "checkin_has_focus"
  | "checkin_no_focus"
  | "evening_has_focus"
  | "evening_no_focus"
  | "hourly_has_focus"
  | "hourly_no_focus";

export interface CompanionMessageContext {
  timeZone: string;
  slot: string;
  intent: CompanionIntent;
  focus?: string;
  weekday: string;
  hour: number;
  recentReplies: string[];
}

function buildTemplate(context: CompanionMessageContext): string {
  switch (context.intent) {
    case "morning":
      return `Good morning — happy ${context.weekday}. What's your focus today? Use /focus followed by your goal.`;
    case "checkin_no_focus":
      return `Quick check-in — set your focus with /focus and one thing you want to get done today.`;
    case "checkin_has_focus":
      return `You said you'd focus on "${context.focus}" — how's it going? Reply here and I'll remember.`;
    case "evening_no_focus":
      return `How was your day? Reply if you want — or set tomorrow's focus anytime with /focus.`;
    case "evening_has_focus":
      return `End of day check-in: did you get to "${context.focus}"? Anything to carry to tomorrow?`;
    case "hourly_has_focus":
      return `Quick pulse — how's "${context.focus}" going so far?`;
    case "hourly_no_focus":
      return `Quick pulse check — how's your day going?`;
    default:
      return `Quick check-in — how's your day going?`;
  }
}

async function runShortLlmCompletion(system: string, user: string): Promise<string> {
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
      max_tokens: 100,
      temperature: 0.7,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Companion LLM request failed (${response.status}): ${errorBody}`);
  }

  const payload = (await response.json()) as {
    choices: Array<{ message: { content: string | null } }>;
  };

  const content = payload.choices[0]?.message.content?.trim();
  if (!content) {
    throw new Error("Companion LLM returned empty content");
  }

  return content;
}

export async function buildCompanionMessage(
  intent: CompanionIntent,
  slot: string,
  timeZone: string,
): Promise<string> {
  const now = getZonedTimeInfo(timeZone);
  const day = await getTodayFocusDay(timeZone);
  const focus = day.focus?.trim();

  const context: CompanionMessageContext = {
    timeZone,
    slot,
    intent,
    focus,
    weekday: now.weekday,
    hour: now.hour,
    recentReplies: getRecentCheckInReplies(day),
  };

  const template = buildTemplate(context);

  if (!isLlmConfigured()) {
    return template;
  }

  const systemParts = [
    "You are SAG, a personal day companion on Telegram.",
    "Write ONE short message (1-2 sentences, under 280 characters).",
    "Be warm and practical. No markdown, no bullet lists.",
    "Do not invent facts about bills, email, or devices.",
  ];

  if (intent === "morning" || intent === "checkin_no_focus") {
    systemParts.push("Remind the user to set focus with /focus followed by their goal.");
  } else if (intent === "hourly_no_focus") {
    systemParts.push("Do NOT mention /focus or ask them to set a focus. Just a light generic check-in.");
  } else if (intent.includes("has_focus") && context.focus) {
    systemParts.push("You may briefly reference their focus.");
  }

  const system = systemParts.join(" ");

  const user = [
    `Intent: ${intent}`,
    `Slot: ${slot}`,
    `Weekday: ${context.weekday}`,
    `Hour: ${context.hour}`,
    `Focus: ${focus ?? "not set"}`,
    context.recentReplies.length > 0 ? `Recent replies: ${context.recentReplies.join(" | ")}` : "",
    `Fallback template: ${template}`,
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

export function resolveCompanionIntent(
  slotHour: number,
  hasFocus: boolean,
  anchorHours: number[],
): CompanionIntent {
  const isAnchor = anchorHours.includes(slotHour);

  if (isAnchor) {
    const morningHour = anchorHours[0];
    const eveningHour = anchorHours[anchorHours.length - 1];

    if (slotHour === morningHour) {
      return "morning";
    }

    if (slotHour === eveningHour) {
      return hasFocus ? "evening_has_focus" : "evening_no_focus";
    }

    return hasFocus ? "checkin_has_focus" : "checkin_no_focus";
  }

  return hasFocus ? "hourly_has_focus" : "hourly_no_focus";
}
