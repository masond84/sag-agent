import { Bot } from "grammy";
import type { InteractiveSkillContext } from "../types.js";
import { buildTelegramReply } from "./telegram-handlers.js";
import { isTelegramConfigured } from "./notify.js";
import { isAuthorizedChat } from "./telegram.js";

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

    const context = await getContext();
    const reply = await buildTelegramReply(text, context, chatId);
    await ctx.reply(reply);
  });

  await bot.api.deleteWebhook({ drop_pending_updates: false });

  void bot.start({
    onStart: () => {
      console.log("[info] Telegram bot long-polling started");
    },
    allowed_updates: ["message"],
  });
}
