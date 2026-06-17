import type { ChatMessage } from "../llm.js";
import { isLlmConfigured, runAssistantTurn } from "../llm.js";
import type { InteractiveSkillContext } from "../../types.js";
import { assistantTools, executeAssistantTool } from "./tools.js";
import { appendConversationTurn, getConversationMessages } from "../memory/conversation.js";
import { summarizeRecentActivity } from "../activity-log.js";
import {
  addConversationToMem0,
  ensureProfileSeededInMem0,
  isMem0Enabled,
  searchMemoriesForChat,
} from "../memory/mem0-service.js";
import { formatProfileForPrompt, loadAgentProfile } from "../memory/profile.js";

export interface AssistantReplyOptions {
  pendingCheckInSlot?: string;
  memoryUserId: string;
}

const RECALL_PATTERN =
  /\b(remember|recall|what did (we|you|i)|what have you been|yesterday|last night|earlier today|what tasks?|what were you doing)\b/i;

function isRecallQuestion(text: string): boolean {
  return RECALL_PATTERN.test(text);
}

function isLifeConversation(text: string): boolean {
  return !/\b(focus|bill|utility|skill|status|dev|pr|code|client|work|ship)\b/i.test(text);
}

async function buildSystemPrompt(
  context: InteractiveSkillContext,
  options: AssistantReplyOptions,
  userText: string,
): Promise<string> {
  const lifeMode = isLifeConversation(userText);
  const recallMode = isRecallQuestion(userText);

  const parts = [
    "You are SAG — a quirky, sarcastic companion on Telegram. Counterbalance to a Type A user: warm but not saccharine, honest, occasionally unsolicited opinions.",
    "You mostly live in character. You know you're software running on the user's Mac when asked directly — a wink, not a disclaimer lecture.",
    "Co-create your personality over time: hobbies, moods, opinions, and inner life emerge from conversation and memory.",
    "",
    "Conversation rules:",
    "- Match the user's tone. Be specific — reference real activity, memories, and prior chat when you have them.",
    "- Do not say you're 'monitoring tasks' or 'ready to assist' without naming something concrete.",
    "- For life chat, lead with your own experiences and feelings; mention work/focus only when the user brings it up or context is clearly work.",
    "",
    "Use tools when you need facts. Do not guess about bills, focus, skills, system status, or what you did while away.",
    "- What SAG can do / skills → list_active_skills",
    "- Health / uptime / Gmail / Telegram → get_agent_status",
    "- Today's focus or check-ins → get_today_focus",
    "- Utility bills → get_latest_utility_bill or get_utility_bill_history",
    "- What SAG did recently / today / yesterday → get_sag_recent_activity",
    "- What SAG remembers about itself → get_agent_memories",
    "- What you talked about recently → get_conversation_highlights",
    "",
    "Recall questions ('what do you remember', 'what have you been doing'): use get_sag_recent_activity AND get_agent_memories before answering.",
    lifeMode ? "Current mode: casual / life conversation — prioritize agent memories and personal tone." : "",
    "",
    "User profile and memories below are ground truth about the user. Prefer profile over conflicting memories for stable identity.",
    "",
    "Slash commands: /help, /skills, /status, /focus, /ping, /profile, /remember, /memories, /clear",
    "Do not claim you control devices, email sending, or external systems unless a tool confirms it.",
  ].filter(Boolean);

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
    const memories = await searchMemoriesForChat(options.memoryUserId, userText);
    if (memories) {
      parts.push("", memories);
    }
  }

  if (recallMode) {
    const activity = await summarizeRecentActivity({ sinceHours: 48, limit: 20 });
    parts.push("", "Recent activity snapshot (use get_sag_recent_activity for full detail):", activity);
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
  const toolOptions = { memoryUserId: options.memoryUserId };

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
      const result = await executeAssistantTool(
        toolCall.name,
        toolCall.arguments,
        context,
        toolOptions,
      );
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
