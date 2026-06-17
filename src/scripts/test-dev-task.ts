import {
  extractDevTask,
  isDevTaskRequest,
  isVagueDevConfirmation,
} from "../core/message-routing.js";
import { formatManualTask } from "../core/orchestrator/prompts.js";

const samples: Array<{ text: string; dev: boolean; vague: boolean }> = [
  { text: "Yes please update your code to do so", dev: true, vague: true },
  { text: "Please implement it", dev: true, vague: true },
  { text: "Go ahead and update your code", dev: true, vague: true },
  { text: "Update your code to unify persona prompts in companion-message.ts", dev: true, vague: false },
  { text: "Hey, how are you?", dev: false, vague: false },
];

console.log("Dev task routing smoke test\n");

for (const sample of samples) {
  const task = extractDevTask(sample.text);
  const dev = isDevTaskRequest(sample.text);
  const vague = isVagueDevConfirmation(task);
  const ok = dev === sample.dev && vague === sample.vague;
  console.log(`${ok ? "ok" : "FAIL"} "${sample.text}"`);
  console.log(`  dev=${dev} vague=${vague} task="${task}"`);
  if (!ok) process.exitCode = 1;
}

const enriched = formatManualTask({
  kind: "manual",
  task: "Yes please update your code to do so",
  taskContext: "SAG: Want me to unify the persona prompts?\nUser: sounds good",
  queuedAt: new Date().toISOString(),
});

console.log("\nEnriched manual task preview:\n");
console.log(enriched.slice(0, 240), "...\n");
