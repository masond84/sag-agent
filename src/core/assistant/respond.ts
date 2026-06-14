import type { ChatMessage } from "../llm.js";
import { isLlmConfigured, runAssistantTurn } from "../llm.js";
import type { InteractiveSkillContext } from "../../types.js";
import { assistantTools, executeAssistantTool } from "./tools.js";
import { appendConversationTurn, getConversationMessages } from "../memory/conversation.js";
import {
  addConversationToMem0,
  ensureProfileSeededInMem0,
  isMem0Enabled,
  searchUserMemories,
} from "../memory/mem0-service.js";
import { formatProfileForPrompt, loadAgentProfile } from "../memory/profile.js";

export interface AssistantReplyOptions {
  pendingCheckInSlot?: string;
  memoryUserId: string;
}

async function buildSystemPrompt(
  context: InteractiveSkillContext,
  options: AssistantReplyOptions,
  userText: string,
): Promise<string> {
  const parts = [
    "You are SAG, a personal home assistant on Telegram running on the user's Mac.",
    "",
    "You can have normal conversation — greetings, small talk, boredom, curiosity — without always pushing productivity.",
    "Be concise, warm, and practical. Match the user's tone.",
    "",
    "Use tools when the user asks for facts you do not already have. Do not guess about bills, focus, skills, or system status.",
    "- Questions about what SAG can do, skills, capabilities, or commands → list_active_skills",
    "- Agent health, uptime, Gmail/Telegram connectivity → get_agent_status",
    "- Today's focus or check-ins → get_today_focus (setting focus requires /focus plus their goal)",
    "- Utility bills → get_latest_utility_bill or get_utility_bill_history",
    "",
    "Use the user profile and relevant memories below as ground truth about who the user is.",
    "If memories conflict with profile, prefer profile for stable identity/preferences.",
    "",
    "Slash commands still work: /help, /skills, /status, /focus, /ping, /profile, /remember, /memories, /clear",
    "Do not claim you control devices, email sending, or external systems unless a tool confirms it.",
  ];

  if (options.pendingCheckInSlot) {
    parts.push(
      "",
      `Context: the user recently received a focus check-in (${options.pendingCheckInSlot}).`,
      "If they are chatting generally, respond naturally — do not force a coaching nudge.",
      "If they are clearly updating you on their day or focus, acknowledge briefly and offer one practical next step.",
    );
  }

  const skillNames = context.skills.map((skill) => skill.name).join(", ");
  if (skillNames) {
    parts.push("", `Loaded skills (use list_active_skills for details): ${skillNames}.`);
  }

  try {
    const profile = await loadAgentProfile();
    parts.push("", formatProfileForPrompt(profile));
  } catch (error) {
    parts.push("", `User profile unavailable: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (isMem0Enabled()) {
    await ensureProfileSeededInMem0(options.memoryUserId);
    const memories = await searchUserMemories(options.memoryUserId, userText);
    if (memories) {
      parts.push("", memories);
    }
  }

  return parts.join("\n");
}

export async function respondToAssistantMessage(
  userText: string,
  context: InteractiveSkillContext,
  options: AssistantReplyOptions,
): Promise<string> {
  if (!isLlmConfigured()) {
    const { formatSkillCatalog } = await import("../skill-catalog.js");
    return [
      "I can respond to natural language once OPENAI_API_KEY is set in .env.",
      "",
      formatSkillCatalog(context.skills),
      "",
      "Until then, use /help for commands.",
    ].join("\n");
  }

  const systemPrompt = await buildSystemPrompt(context, options, userText);
  const priorMessages = await getConversationMessages(options.memoryUserId);

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...priorMessages,
    { role: "user", content: userText },
  ];

  let reply = "";

  for (let step = 0; step < 3; step += 1) {
    const turn = await runAssistantTurn(messages, assistantTools);

    if (turn.toolCalls.length === 0) {
      reply = (turn.message.content ?? "").trim() || "I don't have an answer for that yet.";
      break;
    }

    messages.push(turn.message);

    for (const toolCall of turn.toolCalls) {
      const result = await executeAssistantTool(toolCall.name, toolCall.arguments, context);
      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        name: toolCall.name,
        content: result,
      });
    }
  }

  if (!reply) {
    const finalTurn = await runAssistantTurn(messages, assistantTools);
    reply = (finalTurn.message.content ?? "").trim() || "I couldn't finish that request.";
  }

  await appendConversationTurn(options.memoryUserId, userText, reply);
  await addConversationToMem0(options.memoryUserId, userText, reply);

  return reply;
}
