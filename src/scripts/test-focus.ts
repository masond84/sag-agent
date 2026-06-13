import "dotenv/config";
import { buildCompanionMessage, resolveCompanionIntent } from "../core/companion-message.js";
import { getFocusTimeZone, getTodayFocusText } from "../core/focus.js";
import { getCompanionHours, getFocusAnchorHours } from "../skills/focus/index.js";

async function previewSlot(hour: number, forceHasFocus?: boolean): Promise<void> {
  const timeZone = getFocusTimeZone();
  const anchorHours = getFocusAnchorHours();
  const hasFocus = forceHasFocus ?? Boolean(await getTodayFocusText(timeZone));
  const intent = resolveCompanionIntent(hour, hasFocus, anchorHours);
  const slot = `anchor-${hour}`;
  const message = await buildCompanionMessage(intent, slot, timeZone);

  console.log(`--- ${hour}:00 (${intent}, focus=${hasFocus ? "yes" : "no"}) ---`);
  console.log(message);
  console.log();
}

async function main(): Promise<void> {
  const anchorHours = getFocusAnchorHours();
  const slotArg = process.argv.find((arg) => arg.startsWith("--slot="));
  const send = process.argv.includes("--send");
  const withFocus = process.argv.includes("--with-focus");
  const noFocus = process.argv.includes("--no-focus");

  if (send) {
    const hour = slotArg ? Number(slotArg.split("=")[1]) : anchorHours[0];
    const timeZone = getFocusTimeZone();
    const hasFocus = noFocus ? false : withFocus ? true : Boolean(await getTodayFocusText(timeZone));
    const intent = resolveCompanionIntent(hour, hasFocus, anchorHours);
    const message = await buildCompanionMessage(intent, `anchor-${hour}`, timeZone);

    const { isTelegramConfigured, sendNotification } = await import("../core/notify.js");
    if (!isTelegramConfigured()) {
      console.error("Telegram is not configured.");
      process.exit(1);
    }

    await sendNotification(message);
    console.log(`Sent anchor-${hour} companion message to Telegram.`);
    return;
  }

  console.log("Focus companion preview\n");
  console.log(`Timezone: ${getFocusTimeZone()}`);
  console.log(`Companion hours: ${getCompanionHours().join(", ")}`);
  console.log(`Anchor hours (focus nudges): ${getFocusAnchorHours().join(", ")}\n`);

  if (slotArg) {
    const hour = Number(slotArg.split("=")[1]);
    const forceHasFocus = noFocus ? false : withFocus ? true : undefined;
    await previewSlot(hour, forceHasFocus);
    return;
  }

  for (const hour of anchorHours) {
    await previewSlot(hour, noFocus ? false : withFocus ? true : undefined);
  }

  console.log("Options:");
  console.log("  --slot=8       Preview one anchor hour");
  console.log("  --with-focus   Preview as if focus is set");
  console.log("  --no-focus     Preview as if focus is not set");
  console.log("  --send         Deliver --slot message to Telegram (does not update focus.json state)");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
