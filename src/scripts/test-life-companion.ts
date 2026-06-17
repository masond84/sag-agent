import "dotenv/config";
import { getLifeCompanionPreview } from "../core/companion/life-state.js";
import { buildLifeCompanionMessage } from "../core/companion/life-message.js";
import { getFocusTimeZone } from "../core/focus.js";
import { getZonedTimeInfo } from "../core/schedule.js";

async function main(): Promise<void> {
  const timeZone = getFocusTimeZone();
  const now = getZonedTimeInfo(timeZone);
  const state = await getLifeCompanionPreview(now.dateKey);

  console.log("Life companion preview\n");
  console.log(`Timezone: ${timeZone}`);
  console.log(`Date: ${now.dateKey}`);
  console.log(`Daily cap: ${process.env.LIFE_COMPANION_DAILY_CAP ?? 5}`);
  console.log(
    `Window: ${process.env.LIFE_COMPANION_WINDOW_START ?? 8}:00 – ${process.env.LIFE_COMPANION_WINDOW_END ?? 22}:00`,
  );
  console.log("\nScheduled slots today:");
  for (const slot of state.slots) {
    const label = `${String(slot.hour).padStart(2, "0")}:${String(slot.minute).padStart(2, "0")}`;
    console.log(`  ${label} ${slot.sent ? "(sent)" : "(pending)"}`);
  }

  console.log("\nSample life message:");
  console.log(await buildLifeCompanionMessage(timeZone));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
