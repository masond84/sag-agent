import { publishHouseSpeech } from "./house/events.js";
import { getAuthorizedChatId, sendTelegramMessage } from "./telegram.js";

export interface NotificationOptions {
  /** Short text for House TTS. Omit to derive from body via speech policy. */
  speechText?: string;
  /** When false, never publish house speech for this notification. */
  speak?: boolean;
}

export function isTelegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim() && process.env.TELEGRAM_CHAT_ID?.trim());
}

export function getActiveNotifierLabel(): string {
  return "Telegram";
}

export async function sendNotification(body: string, options?: NotificationOptions): Promise<void> {
  const chatId = getAuthorizedChatId();
  if (!chatId) {
    throw new Error(
      "Telegram is not configured. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env",
    );
  }

  await sendTelegramMessage(chatId, body);

  if (options?.speak === false) {
    return;
  }

  const speechCandidate = options?.speechText ?? body;
  const meta: Record<string, string | number | boolean> = { source: "notification" };
  if (options?.speechText) {
    meta.speechOverride = options.speechText;
  }
  publishHouseSpeech(speechCandidate, meta);
}
