import { formatHostLabel, formatRelativeTime } from "./health.js";
import { isLlmConfigured } from "./llm.js";
import { buildSagPersonaBlock } from "./persona.js";
import type { AgentHealthContext, SkillSummary } from "../types.js";

function formatSkillList(skills: SkillSummary[]): string {
  const names = skills.map((skill) => skill.name);
  if (names.length === 0) {
    return "no active skills";
  }
  if (names.length === 1) {
    return names[0];
  }
  if (names.length === 2) {
    return `${names[0]} and ${names[1]}`;
  }

  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

function formatConnectionStatus(context: AgentHealthContext): string {
  const parts: string[] = [];

  if (context.gmailConfigured) {
    parts.push("Gmail is connected");
  }

  if (context.telegramConfigured) {
    parts.push("you can message me anytime here on Telegram");
  }

  if (parts.length === 0) {
    return "Some integrations still need setup before I can fully help.";
  }

  if (parts.length === 1) {
    return `${parts[0]}.`;
  }

  return `${parts[0]}, and ${parts[1]}.`;
}

function buildRecoveryTemplate(context: AgentHealthContext): string {
  const host = formatHostLabel();
  const lastActive = formatRelativeTime(context.previousLastRunAt);
  const skillList = formatSkillList(context.skills);

  return [
    `I'm back online — SAG is here when you're ready to chat.`,
    `I was last active ${lastActive}.`,
    `I'm running on ${host} with ${skillList}.`,
    formatConnectionStatus(context),
  ].join(" ");
}

function buildAliveReportTemplate(context: AgentHealthContext): string {
  const host = formatHostLabel();
  const lastCheck = formatRelativeTime(context.previousLastRunAt);
  const skillList = formatSkillList(context.skills);

  return [
    `SAG is alive and running on ${host}.`,
    `Last check was ${lastCheck}.`,
    `Active skills: ${skillList}.`,
    formatConnectionStatus(context),
  ].join(" ");
}

async function runShortLlmCompletion(system: string, user: string, maxTokens = 180): Promise<string> {
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
      temperature: 0.7,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Heartbeat LLM request failed (${response.status}): ${errorBody}`);
  }

  const payload = (await response.json()) as {
    choices: Array<{ message: { content: string | null } }>;
  };

  const content = payload.choices[0]?.message.content?.trim();
  if (!content) {
    throw new Error("Heartbeat LLM returned empty content");
  }

  return content;
}

async function buildHeartbeatMessage(
  context: AgentHealthContext,
  kind: "recovery" | "report",
): Promise<string> {
  const template = kind === "recovery" ? buildRecoveryTemplate(context) : buildAliveReportTemplate(context);

  if (!isLlmConfigured()) {
    return template;
  }

  const system =
    kind === "recovery"
      ? buildSagPersonaBlock([
          "The worker just came back online after being offline.",
          "Write a warm, conversational status message in 2-4 sentences (under 420 characters).",
          "Include that you're back and available, how long since last active, the host name, active skill names, and Gmail/Telegram connection status.",
          "Sound human — not a system alert. No markdown, bullet lists, or headers like 'Health audit'.",
        ])
      : buildSagPersonaBlock([
          "Write a brief daily alive check-in in 1-3 sentences (under 320 characters).",
          "Mention you're running, host name, active skills, and that the user can message you.",
          "Warm and conversational — not a system log. No markdown or bullet lists.",
        ]);

  const user = [
    `Host: ${formatHostLabel()}`,
    `Last active: ${formatRelativeTime(context.previousLastRunAt)}`,
    `Active skills: ${formatSkillList(context.skills)}`,
    `Gmail: ${context.gmailConfigured ? "connected" : "not configured"}`,
    `Telegram: ${context.telegramConfigured ? "connected" : "not configured"}`,
    `Fallback template: ${template}`,
    "Write the Telegram message only.",
  ].join("\n");

  try {
    return await runShortLlmCompletion(system, user);
  } catch {
    return template;
  }
}

export async function buildRecoveryMessage(context: AgentHealthContext): Promise<string> {
  return buildHeartbeatMessage(context, "recovery");
}

export async function buildAliveReportMessage(context: AgentHealthContext): Promise<string> {
  return buildHeartbeatMessage(context, "report");
}
