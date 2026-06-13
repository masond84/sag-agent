import { formatTodayFocusSummary, getTodayFocusDay } from "../focus.js";
import { compareToPrevious, formatBillSummary, getBillHistory, getLatestBill } from "../bills.js";
import { formatHealthAudit } from "../health-audit.js";
import type { ToolDefinition } from "../llm.js";
import type { InteractiveSkillContext } from "../../types.js";

export const assistantTools: ToolDefinition[] = [
  {
    name: "get_agent_status",
    description: "Get current SAG health audit including host, last check, skills, Gmail/Telegram status.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_latest_utility_bill",
    description: "Get the most recent Conservice utility bill summary, if one has been processed.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_utility_bill_history",
    description: "Get recent stored Conservice utility bills.",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "number", description: "How many recent bills to return (max 5)." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "list_active_skills",
    description: "List all active SAG skills.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_today_focus",
    description: "Get today's daily focus, check-in history, and whether focus has been set.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
];

export async function executeAssistantTool(
  name: string,
  argsJson: string,
  context: InteractiveSkillContext,
): Promise<string> {
  const args = argsJson ? (JSON.parse(argsJson) as Record<string, unknown>) : {};

  switch (name) {
    case "get_agent_status":
      return formatHealthAudit(context.health);

    case "get_latest_utility_bill": {
      const latest = await getLatestBill();
      if (!latest) {
        return "No utility bills stored yet.";
      }
      const history = await getBillHistory(2);
      const comparison = compareToPrevious(latest, history[1]);
      return [formatBillSummary(latest), comparison].filter(Boolean).join("\n\n");
    }

    case "get_utility_bill_history": {
      const limit = Math.min(Number(args.limit ?? 3) || 3, 5);
      const bills = await getBillHistory(limit);
      if (bills.length === 0) {
        return "No utility bills stored yet.";
      }
      return bills
        .map((bill, index) => `Bill ${index + 1} (${bill.savedAt.slice(0, 10)}):\n${formatBillSummary(bill)}`)
        .join("\n\n");
    }

    case "list_active_skills":
      return context.skills.map((skill) => `- ${skill.name} (${skill.kind})`).join("\n") || "No skills loaded.";

    case "get_today_focus": {
      const day = await getTodayFocusDay();
      return formatTodayFocusSummary(day);
    }

    default:
      return `Unknown tool: ${name}`;
  }
}
