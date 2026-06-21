import { summarizeRecentActivity } from "../activity-log.js";
import { formatDailyDigest } from "../daily-digest.js";
import { formatTodayFocusSummary, getTodayFocusDay, setTodayFocus } from "../focus.js";
import { compareToPrevious, formatBillSummary, getBillHistory, getLatestBill } from "../bills.js";
import { formatSkillCatalogForAssistant } from "../skill-catalog.js";
import { formatHealthAudit } from "../health-audit.js";
import { formatConversationHighlights } from "../memory/conversation.js";
import {
  addExplicitMemory,
  listAgentMemories,
  resolveMemoryUserId,
  searchAgentMemories,
} from "../memory/mem0-service.js";
import type { ToolDefinition } from "../llm.js";
import type { InteractiveSkillContext } from "../../types.js";

export interface AssistantToolOptions {
  memoryUserId?: string;
}

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
    description:
      "List all active SAG skills with what each one does. Use when the user asks what you can do, what skills exist, or what SAG has access to.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_today_focus",
    description: "Get today's daily focus, check-in history, and whether focus has been set.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "set_today_focus",
    description:
      "Set or replace today's focus. Use when the user says they want to focus on, work on, or prioritize something today.",
    parameters: {
      type: "object",
      properties: {
        focus: { type: "string", description: "The user's focus for today." },
      },
      required: ["focus"],
      additionalProperties: false,
    },
  },
  {
    name: "remember_user_fact",
    description:
      "Save a durable fact about the user. Use when the user asks you to remember a preference, identity detail, project, or decision.",
    parameters: {
      type: "object",
      properties: {
        fact: { type: "string", description: "The durable fact to remember about the user." },
      },
      required: ["fact"],
      additionalProperties: false,
    },
  },
  {
    name: "get_today_digest",
    description:
      "Get a user-facing summary of today's focus, recent SAG activity, latest utility bill, active skills, and runtime mode.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_sag_recent_activity",
    description:
      "Get what SAG actually did recently (Gmail polls, check-ins sent, chat, reflection). Use when asked what SAG has been doing or what happened today/yesterday.",
    parameters: {
      type: "object",
      properties: {
        since_hours: {
          type: "number",
          description: "How many hours back to look (default 48, max 168).",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_agent_memories",
    description:
      "Search SAG's own long-term memories about itself, its feelings, hobbies, and diary. Use when asked what SAG remembers about itself or about past days.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "What to search for in agent memory." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_conversation_highlights",
    description:
      "Get recent chat highlights from this Telegram thread. Use when asked what you talked about recently.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
];

export async function executeAssistantTool(
  name: string,
  argsJson: string,
  context: InteractiveSkillContext,
  toolOptions: AssistantToolOptions = {},
): Promise<string> {
  const args = argsJson ? (JSON.parse(argsJson) as Record<string, unknown>) : {};
  const memoryUserId = toolOptions.memoryUserId ?? resolveMemoryUserId();

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
      return formatSkillCatalogForAssistant(context.skills);

    case "get_today_focus": {
      const day = await getTodayFocusDay();
      return formatTodayFocusSummary(day);
    }

    case "set_today_focus": {
      const focus = typeof args.focus === "string" ? args.focus.trim() : "";
      if (!focus) {
        return "No focus was provided.";
      }
      const day = await setTodayFocus(focus);
      return `Today's focus is now: ${day.focus}`;
    }

    case "remember_user_fact": {
      const fact = typeof args.fact === "string" ? args.fact.trim() : "";
      if (!fact) {
        return "No memory fact was provided.";
      }
      try {
        await addExplicitMemory(memoryUserId, fact);
        return `Saved memory: ${fact}`;
      } catch (error) {
        return `Could not save memory: ${error instanceof Error ? error.message : String(error)}`;
      }
    }

    case "get_today_digest":
      return formatDailyDigest(context);

    case "get_sag_recent_activity": {
      const sinceHours = Math.min(Math.max(Number(args.since_hours ?? 48) || 48, 1), 168);
      return summarizeRecentActivity({ sinceHours, limit: 40 });
    }

    case "get_agent_memories": {
      const query = typeof args.query === "string" && args.query.trim() ? args.query.trim() : "recent memories";
      const block = await searchAgentMemories(query, 8);
      if (block) {
        return block;
      }
      return await listAgentMemories(8);
    }

    case "get_conversation_highlights":
      return formatConversationHighlights(memoryUserId, 8);

    default:
      return `Unknown tool: ${name}`;
  }
}
