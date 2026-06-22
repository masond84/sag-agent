import type { ActivityEventType } from "../activity-log.js";

export interface SkillMeta {
  implementationPath: string;
  activityTypes: ActivityEventType[];
  telegramCommands: string[];
  /** Disabling shows a strong warning — core capability */
  critical?: boolean;
}

export const SKILL_META: Record<string, SkillMeta> = {
  "conservice-statement": {
    implementationPath: "src/skills/conservice/index.ts",
    activityTypes: ["gmail_poll", "gmail_bill_processed"],
    telegramCommands: ["/skills"],
  },
  "focus-companion": {
    implementationPath: "src/skills/focus/index.ts",
    activityTypes: ["focus_sent", "focus_reply", "life_message_sent"],
    telegramCommands: ["/focus"],
  },
  "morning-briefing": {
    implementationPath: "src/skills/morning/index.ts",
    activityTypes: ["morning_briefing"],
    telegramCommands: [],
  },
  reflection: {
    implementationPath: "src/skills/reflection/index.ts",
    activityTypes: ["reflection"],
    telegramCommands: ["/sag-memories"],
  },
  heartbeat: {
    implementationPath: "src/skills/heartbeat/index.ts",
    activityTypes: ["heartbeat_report", "heartbeat_recovery"],
    telegramCommands: ["/status", "/ping"],
  },
  "dev-runner": {
    implementationPath: "src/skills/dev-runner/index.ts",
    activityTypes: ["dev_cycle"],
    telegramCommands: ["/dev"],
  },
  "telegram-commands": {
    implementationPath: "src/skills/commands/index.ts",
    activityTypes: ["chat_in", "chat_out"],
    telegramCommands: [
      "/help",
      "/skills",
      "/status",
      "/focus",
      "/ping",
      "/profile",
      "/remember",
      "/memories",
      "/sag-memories",
      "/clear",
      "/dev",
    ],
    critical: true,
  },
};

export function getSkillMeta(skillId: string): SkillMeta | undefined {
  return SKILL_META[skillId];
}
