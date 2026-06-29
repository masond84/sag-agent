function getBotToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  }
  return token;
}

export function getAuthorizedChatId(): string | undefined {
  return process.env.TELEGRAM_CHAT_ID?.trim();
}

export function isAuthorizedChat(chatId: number | string): boolean {
  const authorized = getAuthorizedChatId();
  if (!authorized) {
    return false;
  }
  return String(chatId) === authorized;
}

const TELEGRAM_MAX_MESSAGE_LENGTH = 4096;

export function splitTelegramMessage(text: string, maxLength = TELEGRAM_MAX_MESSAGE_LENGTH): string[] {
  if (text.length <= maxLength) {
    return [text];
  }

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > maxLength) {
    let splitAt = remaining.lastIndexOf("\n", maxLength);
    if (splitAt <= 0) {
      splitAt = maxLength;
    }

    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).replace(/^\n/, "");
  }

  if (remaining) {
    chunks.push(remaining);
  }

  return chunks;
}

async function postTelegramMessage(
  token: string,
  chatId: number | string,
  text: string,
): Promise<void> {
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Telegram send failed (${response.status}): ${errorBody}`);
  }
}

export async function sendTelegramMessage(chatId: number | string, text: string): Promise<void> {
  const token = getBotToken();
  for (const chunk of splitTelegramMessage(text)) {
    await postTelegramMessage(token, chatId, chunk);
  }
}

export function parseCommand(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/")) {
    return null;
  }

  const command = trimmed.split(/\s+/)[0]?.toLowerCase() ?? "";
  const base = command.split("@")[0];
  return base || null;
}
