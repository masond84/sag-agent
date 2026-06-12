import "dotenv/config";
import { buildMorningBriefingMessage } from "../skills/morning/index.js";

async function main(): Promise<void> {
  const timeZone = process.env.MORNING_BRIEFING_TIMEZONE?.trim() || "America/New_York";
  const message = buildMorningBriefingMessage(timeZone);

  if (process.argv.includes("--send")) {
    const { isTelegramConfigured, sendNotification } = await import("../core/notify.js");
    if (!isTelegramConfigured()) {
      console.error("Telegram is not configured.");
      process.exit(1);
    }
    await sendNotification(message);
    console.log("Morning briefing sent to Telegram.");
    return;
  }

  console.log("Morning briefing preview:\n");
  console.log(message);
  console.log("\nUse --send to deliver it now (ignores 7:30 schedule).");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
