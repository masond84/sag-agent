import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { InteractiveSkillContext } from "../types.js";

async function main(): Promise<void> {
  const originalCwd = process.cwd();
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "sag-telegram-ux-"));
  process.chdir(tempDir);

  try {
    const { TELEGRAM_COMMANDS, buildTelegramReply, formatHelp, formatStart } = await import(
      "../core/telegram-handlers.js"
    );

    const context: InteractiveSkillContext = {
      health: {
        emailSkillCount: 1,
        scheduledSkillCount: 2,
        interactiveSkillCount: 1,
        processedMessageCount: 0,
        gmailConfigured: false,
        telegramConfigured: false,
        dryRun: true,
        skills: [
          { id: "telegram-commands", name: "Telegram Commands", kind: "interactive" },
          { id: "focus-companion", name: "Focus Companion", kind: "scheduled" },
        ],
      },
      skills: [
        { id: "telegram-commands", name: "Telegram Commands", kind: "interactive" },
        { id: "focus-companion", name: "Focus Companion", kind: "scheduled" },
      ],
    };

    const commandNames = TELEGRAM_COMMANDS.map((entry) => entry.command);
    for (const required of ["start", "help", "today", "focus", "remember"]) {
      if (!commandNames.includes(required)) {
        throw new Error(`Missing Telegram command menu entry: ${required}`);
      }
    }

    const start = formatStart(context);
    const help = formatHelp();
    const today = await buildTelegramReply("/today", context, 12345);
    const sagMemoriesAlias = await buildTelegramReply("/sag_memories", context, 12345);

    if (!start.includes("What I can do from this chat")) {
      throw new Error("/start onboarding text is missing capability summary");
    }
    if (!help.includes("/today")) {
      throw new Error("/help text is missing /today");
    }
    if (!today.includes("Today with SAG")) {
      throw new Error("/today digest did not render");
    }
    if (!sagMemoriesAlias.includes("Mem0 is not configured")) {
      throw new Error("/sag_memories alias did not reach agent memory command");
    }

    console.log("Telegram UX smoke test passed: onboarding, help, menu, and /today are wired.");
  } finally {
    process.chdir(originalCwd);
    await rm(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
