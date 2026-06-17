import type { InteractiveSkill } from "../../types.js";

/**
 * Telegram chat is handled by core/telegram-bot.ts (Grammy long-polling).
 * This skill remains registered so it appears in /skills and config/skills/commands.yaml.
 */
export const commandsSkill: InteractiveSkill = {
  kind: "interactive",
  config: {
    id: "telegram-commands",
    name: "Telegram Assistant",
    enabled: true,
    kind: "interactive",
  },
  async run(): Promise<void> {
    // No-op: worker starts Grammy bot when this skill is enabled.
  },
};
