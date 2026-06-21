import type { SkillSummary } from "../types.js";

const SKILL_DESCRIPTIONS: Record<string, string> = {
  "conservice-statement":
    "Watches Gmail for Conservice utility statements and texts you a charge summary on Telegram.",
  "focus-companion":
    "Unified companion — work focus check-ins at anchor hours plus random personal life texts during the day.",
  reflection: "Distills the activity log into SAG's own Mem0 diary (agent memories).",
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
  lines.push(
    "Slash commands: /help, /today, /skills, /status, /focus, /profile, /remember, /memories, /sag-memories, /clear, /dev, /ping",
  );

  return lines.join("\n");
}

export function formatSkillCatalogForAssistant(skills: SkillSummary[]): string {
  if (skills.length === 0) {
    return "No active skills loaded.";
  }

  return skills.map((skill) => `${skill.name} (${skill.kind}): ${describeSkill(skill)}`).join("\n");
}
