export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    text?: string;
    chat: {
      id: number;
      type: string;
      username?: string;
      first_name?: string;
    };
  };
}

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

export async function ensureTelegramPollingMode(): Promise<void> {
  const token = getBotToken();
  await fetch(`https://api.telegram.org/bot${token}/deleteWebhook?drop_pending_updates=false`);
}

export async function fetchTelegramUpdates(offset?: number): Promise<TelegramUpdate[]> {
  const token = getBotToken();
  const params = new URLSearchParams({
    timeout: "0",
    allowed_updates: JSON.stringify(["message"]),
  });

  if (offset !== undefined) {
    params.set("offset", String(offset));
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/getUpdates?${params}`);
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Telegram getUpdates failed (${response.status}): ${errorBody}`);
  }

  const payload = (await response.json()) as { ok: boolean; result: TelegramUpdate[] };
  if (!payload.ok) {
    throw new Error("Telegram getUpdates returned ok=false");
  }

  return payload.result;
}

export async function sendTelegramMessage(chatId: number | string, text: string): Promise<void> {
  const token = getBotToken();
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

export function parseCommand(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/")) {
    return null;
  }

  const command = trimmed.split(/\s+/)[0]?.toLowerCase() ?? "";
  const base = command.split("@")[0];
  return base || null;
}
