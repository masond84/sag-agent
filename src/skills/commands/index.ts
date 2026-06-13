import { formatHealthAudit } from "../../core/health-audit.js";
import { respondToAssistantMessage } from "../../core/assistant/respond.js";
import {
  clearPendingReplySlot,
  formatTodayFocusSummary,
  getPendingReplySlot,
  getTodayFocusDay,
  getTodayFocusText,
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
  const lines = ["Active skills:"];

  for (const skill of context.skills) {
    lines.push(`- ${skill.name} (${skill.kind})`);
  }

  if (context.skills.length === 0) {
    lines.push("- none");
  }

  return lines.join("\n");
}

function formatHelp(): string {
  return [
    "SAG assistant",
    "",
    "Talk naturally, for example:",
    "- What was my last utility bill?",
    "- Is SAG healthy?",
    "- What's my focus today?",
    "",
    "Daily companion (hourly 8 AM–9 PM, LLM): check-ins and focus tracking.",
    "Set focus: /focus followed by your goal (e.g. /focus Ship the PR)",
    "",
    "Commands:",
    "/ping — check if SAG is online",
    "/status — full health audit",
    "/skills — list active skills",
    "/focus — show today's focus",
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

function handleCommand(command: string, context: InteractiveSkillContext): string {
  switch (command) {
    case "/ping":
      return "SAG online";
    case "/status":
      return ["SAG status", "", formatHealthAudit(context.health)].join("\n");
    case "/skills":
      return formatSkillsList(context);
    case "/help":
    case "/start":
      return formatHelp();
    default:
      return [`Unknown command: ${command}`, "", formatHelp()].join("\n");
  }
}

async function buildReply(text: string, context: InteractiveSkillContext): Promise<string> {
  const command = parseCommand(text);

  if (command === "/focus") {
    return handleFocusCommand(text);
  }

  if (command) {
    return handleCommand(command, context);
  }

  const pendingSlot = await getPendingReplySlot();
  if (pendingSlot) {
    await recordTouchpointReply(pendingSlot, text);
    await clearPendingReplySlot();

    const focus = await getTodayFocusText();
    if (focus) {
      return `Noted — thanks for the check-in on "${focus}".`;
    }
    return "Noted — thanks for the check-in.";
  }

  return respondToAssistantMessage(text, context);
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

      const reply = await buildReply(text, context);
      await sendTelegramMessage(chatId, reply);
    }

    await setTelegramUpdateOffset(nextOffset);
  },
};
