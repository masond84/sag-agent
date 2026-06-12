import "dotenv/config";

async function main(): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();

  if (!token) {
    console.error("Set TELEGRAM_BOT_TOKEN in .env first.");
    process.exit(1);
  }

  const meResponse = await fetch(`https://api.telegram.org/bot${token}/getMe`);
  const me = (await meResponse.json()) as { ok: boolean; result?: { username?: string } };
  if (me.ok && me.result?.username) {
    console.log(`Bot: @${me.result.username}`);
    console.log(`Open: https://t.me/${me.result.username}\n`);
  }

  await fetch(`https://api.telegram.org/bot${token}/deleteWebhook?drop_pending_updates=false`);

  console.log("Fetching recent updates for your bot...");
  console.log("Send your bot any message (e.g. /start or hello), then run this again.\n");

  const response = await fetch(
    `https://api.telegram.org/bot${token}/getUpdates?limit=20&allowed_updates=${encodeURIComponent(JSON.stringify(["message"]))}`,
  );
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Telegram getUpdates failed (${response.status}): ${errorBody}`);
  }

  const payload = (await response.json()) as {
    ok: boolean;
    result: Array<{
      message?: {
        chat: { id: number; type: string; username?: string; first_name?: string };
        text?: string;
      };
    }>;
  };

  if (!payload.ok || payload.result.length === 0) {
    console.log("No messages found yet.");
    console.log("");
    console.log("Workaround: message @userinfobot or @getidsbot on Telegram.");
    console.log("It will reply with your user ID — use that as TELEGRAM_CHAT_ID in .env.");
    return;
  }

  const seen = new Set<number>();

  for (const update of payload.result) {
    const chat = update.message?.chat;
    if (!chat || seen.has(chat.id)) {
      continue;
    }
    seen.add(chat.id);

    const label = chat.username ?? chat.first_name ?? chat.type;
    console.log(`Chat ID: ${chat.id}  (${label})`);
  }

  console.log("\nAdd the chat ID you want to .env as TELEGRAM_CHAT_ID.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
