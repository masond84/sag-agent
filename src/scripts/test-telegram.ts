import "dotenv/config";
import { getActiveNotifierLabel, isTelegramConfigured, sendNotification } from "../core/notify.js";

async function main(): Promise<void> {
  if (!isTelegramConfigured()) {
    console.error("Telegram is not configured.");
    console.error("");
    console.error("Set in .env:");
    console.error("  TELEGRAM_BOT_TOKEN=...");
    console.error("  TELEGRAM_CHAT_ID=...");
    console.error("");
    console.error("Run `npm run telegram:chat-id` after messaging your bot to find your chat ID.");
    process.exit(1);
  }

  const dryRun = (process.env.DRY_RUN ?? "true").toLowerCase() === "true";
  const message = "SAG test: Telegram notifications are working.";

  if (dryRun) {
    console.log(`DRY_RUN=true — would send via ${getActiveNotifierLabel()}:`);
    console.log(message);
    console.log("");
    console.log("Set DRY_RUN=false in .env to send a real Telegram message.");
    return;
  }

  await sendNotification(message);
  console.log(`Test message sent via ${getActiveNotifierLabel()}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
