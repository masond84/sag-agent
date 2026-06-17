import { logActivity, summarizeRecentActivity } from "../core/activity-log.js";

async function main(): Promise<void> {
  await logActivity("gmail_poll", "Test poll — no new mail", { candidates: 0 });
  await logActivity("chat_in", "Test user message preview", { preview: "hello" });

  const summary = await summarizeRecentActivity({ sinceHours: 1, limit: 10 });
  console.log("Recent activity (last hour):\n");
  console.log(summary);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
