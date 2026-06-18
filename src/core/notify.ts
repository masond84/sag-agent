import { getAuthorizedChatId, sendTelegramMessage } from "./telegram.js";

export function isTelegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim() && process.env.TELEGRAM_CHAT_ID?.trim());
}

export function getActiveNotifierLabel(): string {
  return "Telegram";
}

export async function sendNotification(body: string): Promise<void> {
  const chatId = getAuthorizedChatId();
  if (!chatId) {
    throw new Error(
      "Telegram is not configured. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env",
    );
  }

  await sendTelegramMessage(chatId, body);
}
