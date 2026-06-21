import { Bot } from "grammy";
import type { InteractiveSkillContext } from "../types.js";
import { publishHouseSpeech } from "./house/events.js";
import { buildTelegramReply, TELEGRAM_COMMANDS } from "./telegram-handlers.js";
import { isTelegramConfigured } from "./notify.js";
import { isAuthorizedChat, splitTelegramMessage } from "./telegram.js";

export type TelegramContextProvider = () => Promise<InteractiveSkillContext>;

export async function startTelegramBot(getContext: TelegramContextProvider): Promise<void> {
  if (!isTelegramConfigured()) {
    return;
  }

  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) {
    return;
  }

  const bot = new Bot(token);

  bot.catch((error) => {
    console.error("[error] Telegram bot:", error.error instanceof Error ? error.error.message : String(error.error));
  });

  bot.on("message:text", async (ctx) => {
    const chatId = ctx.chat.id;
    if (!isAuthorizedChat(chatId)) {
      return;
    }

    const text = ctx.message.text.trim();
    if (!text) {
      return;
    }

    try {
      await ctx.replyWithChatAction("typing");
      const context = await getContext();
      const reply = await buildTelegramReply(text, context, chatId);
      publishHouseSpeech(reply, { source: "telegram" });
      for (const chunk of splitTelegramMessage(reply)) {
        await ctx.reply(chunk);
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      console.error("[error] Telegram reply failed:", detail);
      await ctx.reply("Something went wrong handling your message. Try again or use /help.");
    }
  });

  await bot.api.deleteWebhook({ drop_pending_updates: false });
  try {
    await bot.api.setMyCommands(TELEGRAM_COMMANDS);
  } catch (error) {
    console.warn(
      "[warn] Telegram command menu unavailable:",
      error instanceof Error ? error.message : String(error),
    );
  }

  void bot.start({
    onStart: () => {
      console.log("[info] Telegram bot long-polling started");
    },
    allowed_updates: ["message"],
  });
}
