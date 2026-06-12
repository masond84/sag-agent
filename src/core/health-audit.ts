import type { AgentHealthContext } from "../types.js";
import { formatHostLabel, formatRelativeTime, formatStatusLabel } from "./health.js";

export function formatHealthAudit(context: AgentHealthContext): string {
  const totalSkills =
    context.emailSkillCount + context.scheduledSkillCount + context.interactiveSkillCount;
  const lines = [
    "Health audit:",
    `- Host: ${formatHostLabel()}`,
    `- Last check: ${formatRelativeTime(context.previousLastRunAt)}`,
    `- Active skills: ${totalSkills} (${context.emailSkillCount} email, ${context.scheduledSkillCount} scheduled, ${context.interactiveSkillCount} interactive)`,
    `- Gmail: ${formatStatusLabel(context.gmailConfigured)}`,
    `- Telegram: ${formatStatusLabel(context.telegramConfigured)}`,
    `- Messages processed: ${context.processedMessageCount}`,
  ];

  if (context.dryRun) {
    lines.push("- Mode: dry-run");
  }

  return lines.join("\n");
}
