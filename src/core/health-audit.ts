import type { AgentHealthContext } from "../types.js";
import { formatHostLabel, formatRelativeTime, formatStatusLabel } from "./health.js";
import { formatMcpHealthSummary } from "./mcp/index.js";
import { getMem0InitError, isMem0Enabled } from "./memory/mem0-service.js";

function formatMem0StatusLabel(): string {
  if (!isMem0Enabled()) {
    return "disabled";
  }

  const initError = getMem0InitError();
  if (initError) {
    return `error — ${initError}`;
  }

  return "ok";
}

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
    `- Mem0: ${formatMem0StatusLabel()}`,
    `- MCP: ${formatMcpHealthSummary()}`,
    `- Messages processed: ${context.processedMessageCount}`,
  ];

  if (context.dryRun) {
    lines.push("- Mode: dry-run");
  }

  return lines.join("\n");
}
