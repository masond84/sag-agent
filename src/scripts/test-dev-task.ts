import {
  extractDevTask,
  isDevFollowUp,
  isDevTaskRequest,
  isShortDevAffirmation,
  isVagueDevConfirmation,
  threadLooksLikeDevProposal,
} from "../core/message-routing.js";
import { formatManualTask } from "../core/orchestrator/prompts.js";

const samples: Array<{ text: string; dev: boolean; vague: boolean }> = [
  { text: "Yes please update your code to do so", dev: true, vague: true },
  { text: "Please implement it", dev: true, vague: true },
  { text: "Go ahead and update your code", dev: true, vague: true },
  { text: "Sounds good, do it", dev: false, vague: true },
  { text: "Update your code to unify persona prompts in companion-message.ts", dev: true, vague: false },
  {
    text: "Can you please try to make yourself better based off the past couple interactions",
    dev: true,
    vague: false,
  },
  { text: "Hey, how are you?", dev: false, vague: false },
];

const followUpSamples: Array<{ text: string; thread: string; followUp: boolean }> = [
  {
    text: "Sounds good, do it",
    thread: "SAG: Want me to unify the persona prompts?\nUser: sounds good",
    followUp: true,
  },
  {
    text: "Yes",
    thread: "SAG: I can update your code to fix recall — want me to queue it?",
    followUp: true,
  },
  {
    text: "Yes",
    thread: "SAG: How's focus going?\nUser: pretty good",
    followUp: false,
  },
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

console.log("\nShort affirmation follow-up routing\n");

for (const sample of followUpSamples) {
  const followUp = isDevFollowUp(sample.text, sample.thread);
  const ok = followUp === sample.followUp;
  console.log(`${ok ? "ok" : "FAIL"} "${sample.text}" with dev thread=${sample.followUp}`);
  console.log(`  followUp=${followUp} short=${isShortDevAffirmation(sample.text)} thread=${threadLooksLikeDevProposal(sample.thread)}`);
  if (!ok) process.exitCode = 1;
}

const enriched = formatManualTask({
  kind: "manual",
  task: "Implement the change SAG proposed: Want me to unify the persona prompts?",
  taskContext: "SAG: Want me to unify the persona prompts?\nUser: sounds good, do it",
  queuedAt: new Date().toISOString(),
});

console.log("\nEnriched manual task preview:\n");
console.log(enriched.slice(0, 280), "...\n");
