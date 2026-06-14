import { buildCheckInReplyNudge } from "../../core/companion-message.js";
import { formatHealthAudit } from "../../core/health-audit.js";
import { shouldUseCheckInNudge, isGeneralConversation, isDevTaskRequest, extractDevTask } from "../../core/message-routing.js";
import { respondToAssistantMessage } from "../../core/assistant/respond.js";
import { getDevStatus } from "../../core/dev/status.js";
import { isDevRunnerEnabled, queueManualDevTask } from "../../core/dev/state.js";
import { runDevCycle } from "../../core/dev/runner.js";
import { formatSkillCatalog } from "../../core/skill-catalog.js";
import { clearConversation } from "../../core/memory/conversation.js";
import {
  addExplicitMemory,
  listUserMemories,
  resolveMemoryUserId,
} from "../../core/memory/mem0-service.js";
import { formatProfileSummary, loadAgentProfile } from "../../core/memory/profile.js";
import {
  clearPendingReplySlot,
  formatTodayFocusSummary,
  getFocusTimeZone,
  getPendingReplySlot,
  getTodayFocusDay,
  recordTouchpointReply,
  setTodayFocus,
} from "../../core/focus.js";
import {
  ensureTelegramPollingMode,
  fetchTelegramUpdates,
  isAuthorizedChat,
  parseCommand,
  sendTelegramMessage,
} from "../../core/telegram.js";
import { getTelegramUpdateOffset, setTelegramUpdateOffset } from "../../core/state.js";
import type { InteractiveSkill, InteractiveSkillContext } from "../../types.js";

function formatSkillsList(context: InteractiveSkillContext): string {
  return formatSkillCatalog(context.skills);
}

function formatHelp(): string {
  return [
    "SAG assistant",
    "",
    "Talk naturally, for example:",
    "- Hey — just saying hi",
    "- What skills can you run?",
    "- What was my last utility bill?",
    "- I'm bored, want to chat",
    "",
    "Daily companion: check-ins and focus tracking. Reply to a check-in for an immediate nudge.",
    "Set focus: /focus followed by your goal (e.g. /focus Ship the PR)",
    "",
    "Commands:",
    "/ping — check if SAG is online",
    "/status — full health audit",
    "/skills — list active skills",
    "/focus — show today's focus",
    "/profile — show your stable profile",
    "/remember <fact> — save a fact to Mem0",
    "/memories — list stored Mem0 memories",
    "/clear — clear this chat's short-term thread",
    "/dev — dev status, or /dev run [task] to queue code changes",
    "/help — show this message",
  ].join("\n");
}

async function handleFocusCommand(text: string): Promise<string> {
  const trimmed = text.trim();
  const rest = trimmed.slice("/focus".length).trim();

  if (!rest) {
    const day = await getTodayFocusDay();
    return ["Today's focus", "", formatTodayFocusSummary(day)].join("\n");
  }

  const day = await setTodayFocus(rest);
  return `Focus set for today: "${day.focus}"`;
}

async function handleRememberCommand(text: string, memoryUserId: string): Promise<string> {
  const fact = text.trim().slice("/remember".length).trim();
  if (!fact) {
    return 'Usage: /remember followed by a fact (e.g. /remember I prefer React over Vue)';
  }

  await addExplicitMemory(memoryUserId, fact);
  return `Got it — I'll remember: "${fact}"`;
}

async function handleDevCommand(text: string): Promise<string> {
  const rest = text.trim().slice("/dev".length).trim();
  const lower = rest.toLowerCase();

  if (!rest || lower === "status") {
    return getDevStatus();
  }

  if (lower === "run" || lower.startsWith("run ")) {
    if (!isDevRunnerEnabled()) {
      return "Dev runner disabled. Set DEV_RUNNER_ENABLED=true in .env and restart the worker.";
    }
    const task = rest.slice("run".length).trim();
    if (task) {
      await queueManualDevTask(task);
      return `Queued: "${task}". You'll get a Telegram evolution brief when it finishes (usually 1-2 min).`;
    }
    const result = await runDevCycle(true);
    return result ? ["Dev run complete.", "", result.brief].join("\n") : "Dev run skipped (already running).";
  }

  return `Unknown /dev command: ${rest}. Try /dev status or /dev run [task].`;
}

async function handleCommand(
  command: string,
  context: InteractiveSkillContext,
  memoryUserId: string,
): Promise<string> {
  switch (command) {
    case "/ping":
      return "SAG online";
    case "/status":
      return ["SAG status", "", formatHealthAudit(context.health)].join("\n");
    case "/skills":
      return formatSkillsList(context);
    case "/profile":
      return formatProfileSummary(await loadAgentProfile());
    case "/memories":
      return listUserMemories(memoryUserId);
    case "/clear":
      await clearConversation(memoryUserId);
      return "Cleared this chat's short-term conversation thread.";
    case "/help":
    case "/start":
      return formatHelp();
    default:
      return [`Unknown command: ${command}`, "", formatHelp()].join("\n");
  }
}

async function buildReply(
  text: string,
  context: InteractiveSkillContext,
  chatId: number,
): Promise<string> {
  const command = parseCommand(text);
  const memoryUserId = resolveMemoryUserId(chatId);

  if (command === "/focus") {
    return handleFocusCommand(text);
  }

  if (command === "/remember") {
    return handleRememberCommand(text, memoryUserId);
  }

  if (command === "/dev") {
    return handleDevCommand(text);
  }

  if (command) {
    return await handleCommand(command, context, memoryUserId);
  }

  if (isDevRunnerEnabled() && isDevTaskRequest(text)) {
    const task = extractDevTask(text);
    await queueManualDevTask(task);
    return `Got it — queued a code change: "${task.slice(0, 120)}${task.length > 120 ? "…" : ""}". I'll Telegram you an evolution brief when done.`;
  }

  const pendingSlot = await getPendingReplySlot();

  if (shouldUseCheckInNudge(text, pendingSlot)) {
    await recordTouchpointReply(pendingSlot!, text);
    await clearPendingReplySlot();
    return buildCheckInReplyNudge(text, pendingSlot!, getFocusTimeZone());
  }

  if (pendingSlot && isGeneralConversation(text)) {
    await clearPendingReplySlot();
  }

  return respondToAssistantMessage(text, context, {
    pendingCheckInSlot: pendingSlot && !isGeneralConversation(text) ? pendingSlot : undefined,
    memoryUserId,
  });
}

export const commandsSkill: InteractiveSkill = {
  kind: "interactive",
  config: {
    id: "telegram-commands",
    name: "Telegram Assistant",
    enabled: true,
    kind: "interactive",
  },
  async run(context: InteractiveSkillContext): Promise<void> {
    await ensureTelegramPollingMode();

    const offset = await getTelegramUpdateOffset();
    const updates = await fetchTelegramUpdates(offset);

    if (updates.length === 0) {
      return;
    }

    let nextOffset = offset ?? 0;

    for (const update of updates) {
      nextOffset = Math.max(nextOffset, update.update_id + 1);

      const message = update.message;
      const text = message?.text?.trim();
      const chatId = message?.chat.id;

      if (!text || chatId === undefined) {
        continue;
      }

      if (!isAuthorizedChat(chatId)) {
        continue;
      }

      const reply = await buildReply(text, context, chatId);
      await sendTelegramMessage(chatId, reply);
    }

    await setTelegramUpdateOffset(nextOffset);
  },
};
