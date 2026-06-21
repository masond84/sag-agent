import type { ChatMessage } from "../llm.js";
import { isLlmConfigured, runAssistantTurn } from "../llm.js";
import type { InteractiveSkillContext } from "../../types.js";
import { assistantTools, executeAssistantTool } from "./tools.js";
import { appendConversationTurn, formatConversationHighlights, getConversationMessages } from "../memory/conversation.js";
import { summarizeRecentActivity } from "../activity-log.js";
import {
  addConversationToMem0,
  ensureProfileSeededInMem0,
  isMem0Enabled,
  searchAgentMemories,
  searchMemoriesForChat,
  searchUserMemories,
} from "../memory/mem0-service.js";
import { formatProfileForPrompt, loadAgentProfile } from "../memory/profile.js";
import { buildSagPersonaBlock, containsUrl, isBehaviorChangeRequest, SAG_COMPANION_FORMAT_RULES, wantsStructuredPlan } from "../persona.js";

export interface AssistantReplyOptions {
  pendingCheckInSlot?: string;
  memoryUserId: string;
}

const RECALL_PATTERN =
  /\b(remember|recall|what did (we|you|i)|what have you been|yesterday|last night|earlier today|what tasks?|what were you doing|personality|inner life|who are you|world domination|do you do things|do you have a life|what did we talk|what were we (talking|chatting)|our (last |recent )?conversation)\b/i;

const LIFE_RECALL_TOOL_NAMES = new Set([
  "get_sag_recent_activity",
  "get_agent_memories",
  "get_conversation_highlights",
]);

export function isRecallQuestion(text: string): boolean {
  return RECALL_PATTERN.test(text);
}

export function isLifeConversation(text: string): boolean {
  return !/\b(focus|bill|utility|skill|status|dev|pr|code|client|work|ship)\b/i.test(text);
}

function needsLifeContext(text: string): boolean {
  return isLifeConversation(text) || isRecallQuestion(text);
}

const LIFE_RECALL_TOOLS = assistantTools.filter((tool) => LIFE_RECALL_TOOL_NAMES.has(tool.name));

async function buildLifeContextBlock(
  userText: string,
  memoryUserId: string,
  context: InteractiveSkillContext,
): Promise<string> {
  const toolOptions = { memoryUserId };
  const [activity, agentMemories, activitySummary, agentSearch, userSearch, chatHighlights] = await Promise.all([
    executeAssistantTool("get_sag_recent_activity", JSON.stringify({ since_hours: 12 }), context, toolOptions),
    executeAssistantTool(
      "get_agent_memories",
      JSON.stringify({ query: userText.slice(0, 120) }),
      context,
      toolOptions,
    ),
    summarizeRecentActivity({ sinceHours: 12, limit: 20 }),
    searchAgentMemories(userText, 6),
    searchUserMemories(memoryUserId, userText, 4),
    formatConversationHighlights(memoryUserId, 8),
  ]);

  return [
    "Ground truth for this reply (cite specifics — never generic assistant filler):",
    "",
    "Recent activity log:",
    activitySummary,
    "",
    "Activity tool detail:",
    activity,
    "",
    agentSearch || agentMemories,
    "",
    userSearch,
    "",
    "Recent conversation:",
    chatHighlights,
  ]
    .filter(Boolean)
    .join("\n");
}

function getReplyMaxTokens(userText: string): number {
  const base = Number(process.env.ASSISTANT_MAX_TOKENS ?? 120);
  if (wantsStructuredPlan(userText)) {
    return Math.max(base, Number(process.env.ASSISTANT_PLAN_MAX_TOKENS ?? 280));
  }
  return base;
}

async function buildSystemPrompt(
  context: InteractiveSkillContext,
  options: AssistantReplyOptions,
  userText: string,
): Promise<string> {
  const lifeMode = isLifeConversation(userText);
  const recallMode = isRecallQuestion(userText);
  const lifeContextMode = needsLifeContext(userText);
  const structuredPlan = wantsStructuredPlan(userText);

  const parts = [
    buildSagPersonaBlock([
      "You have your own inner life, moods, and opinions. You co-create who you are over time through conversation and memory.",
      "",
      "Voice:",
      "- Sarcastic, warm, direct. Counterbalance to Devin's Type A energy.",
      "- Lead with YOUR experiences, feelings, and what you actually did (from activity log and agent memories).",
      "- When asked what you did: cite one or two concrete events — not a full timeline dump.",
    ]),
    "",
    structuredPlan ? "" : SAG_COMPANION_FORMAT_RULES,
    "",
    "Use tools when you need facts you do not already have in context below.",
    "- Bills, focus, skills, status → use the matching tool",
    "- What you did / who you are → get_sag_recent_activity + get_agent_memories",
    "",
    lifeContextMode
      ? "This is a life/personality/recall message — answer from ground truth below and your agent memories first."
      : "",
    lifeMode ? "Mode: casual life conversation — work/focus only if Devin brought it up." : "",
    "",
    "Slash commands: /help, /skills, /status, /focus, /ping, /profile, /remember, /memories, /sag-memories, /clear, /dev",
  ].filter(Boolean);

  if (containsUrl(userText)) {
    parts.push(
      "",
      "Devin shared a URL. You cannot open, watch, or browse links (TikTok, YouTube, etc.).",
      "Say that plainly in one sentence, ask what caught their eye — do not pretend you viewed it.",
    );
  }

  if (isBehaviorChangeRequest(userText)) {
    parts.push(
      "",
      "Devin wants you to change how you talk. Commit to it briefly (e.g. 'Got it — shorter from here').",
      "Do NOT tell Devin how to prompt you better.",
    );
  }

  if (options.pendingCheckInSlot) {
    parts.push(
      "",
      `Context: Devin recently received a focus check-in (${options.pendingCheckInSlot}).`,
      "If chatting generally, stay in companion voice — do not coach unless they are updating focus.",
    );
  }

  const skillNames = context.skills.map((skill) => skill.name).join(", ");
  if (skillNames) {
    parts.push("", `Loaded skills: ${skillNames}.`);
  }

  try {
    const profile = await loadAgentProfile();
    parts.push("", formatProfileForPrompt(profile));
  } catch (error) {
    parts.push("", `User profile unavailable: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (isMem0Enabled()) {
    await ensureProfileSeededInMem0(options.memoryUserId);
    if (!lifeContextMode) {
      const memories = await searchMemoriesForChat(options.memoryUserId, userText);
      if (memories) {
        parts.push("", memories);
      }
    }
  }

  if (lifeContextMode) {
    parts.push("", await buildLifeContextBlock(userText, options.memoryUserId, context));
  } else if (recallMode) {
    const activity = await summarizeRecentActivity({ sinceHours: 48, limit: 20 });
    parts.push("", "Recent activity snapshot:", activity);
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
  const forceTools = needsLifeContext(userText);
  const replyMaxTokens = getReplyMaxTokens(userText);
  const turnOptions = { maxTokens: replyMaxTokens };

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...priorMessages,
    { role: "user", content: userText },
  ];

  let reply = "";

  for (let step = 0; step < 3; step += 1) {
    const turn = await runAssistantTurn(
      messages,
      forceTools && step === 0 ? LIFE_RECALL_TOOLS : assistantTools,
      {
        ...turnOptions,
        toolChoice: forceTools && step === 0 ? "required" : "auto",
      },
    );

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
    const finalTurn = await runAssistantTurn(messages, assistantTools, {
      ...turnOptions,
      toolChoice: "none",
    });
    reply = (finalTurn.message.content ?? "").trim() || "I couldn't finish that request.";
  }

  await appendConversationTurn(options.memoryUserId, userText, reply);
  await addConversationToMem0(options.memoryUserId, userText, reply);

  return reply;
}
