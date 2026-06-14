import type { SkillSummary } from "../types.js";

const SKILL_DESCRIPTIONS: Record<string, string> = {
  "conservice-statement":
    "Watches Gmail for Conservice utility statements and texts you a charge summary on Telegram.",
  "focus-companion":
    "Day companion — scheduled check-ins and /focus to track what you are working on.",
  heartbeat: "Keeps the worker monitored and sends a conversational status when SAG comes back online.",
  "telegram-commands": "This chat — answer questions, look up bills and focus, and run slash commands.",
  "morning-briefing": "Optional daily morning greeting at a configured time.",
};

function describeSkill(skill: SkillSummary): string {
  return SKILL_DESCRIPTIONS[skill.id] ?? `${skill.kind} skill`;
}

export function formatSkillCatalog(skills: SkillSummary[]): string {
  if (skills.length === 0) {
    return "No active skills loaded.";
  }

  const lines = ["Active skills:"];
  for (const skill of skills) {
    lines.push(`- ${skill.name} (${skill.kind}): ${describeSkill(skill)}`);
  }

  lines.push("");
  lines.push("Slash commands: /help, /skills, /status, /focus, /ping");

  return lines.join("\n");
}

export function formatSkillCatalogForAssistant(skills: SkillSummary[]): string {
  if (skills.length === 0) {
    return "No active skills loaded.";
  }

  return skills.map((skill) => `${skill.name} (${skill.kind}): ${describeSkill(skill)}`).join("\n");
}
