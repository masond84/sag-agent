import { formatHealthAudit } from "../../core/health-audit.js";
import { respondToAssistantMessage } from "../../core/assistant/respond.js";
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
    "- Help me plan my day",
    "",
    "Each morning (~7:30 AM) SAG sends a good morning message.",
    "",
    "Commands:",
    "/ping — check if SAG is online",
    "/status — full health audit",
    "/skills — list active skills",
    "/help — show this message",
  ].join("\n");
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

      const command = parseCommand(text);
      const reply = command ? handleCommand(command, context) : await respondToAssistantMessage(text, context);
      await sendTelegramMessage(chatId, reply);
    }

    await setTelegramUpdateOffset(nextOffset);
  },
};
