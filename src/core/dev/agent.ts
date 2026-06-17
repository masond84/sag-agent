import type { ChatMessage } from "../llm.js";
import { isLlmConfigured, runDevTurn } from "../llm.js";
import { formatManualTask } from "../orchestrator/prompts.js";
import type { DevTrigger } from "./state.js";
import { devTools, executeDevTool, type DevSession } from "./tools.js";

function buildTriggerPrompt(trigger: DevTrigger): string {
  if (trigger.kind === "post_merge") {
    return `Post-merge follow-up for PR #${trigger.prNumber}. Review and implement follow-ups.`;
  }
  if (trigger.kind === "manual") {
    return formatManualTask(trigger);
  }
  return "Scheduled audit — make small improvements as you see fit.";
}

export interface DevAgentResult {
  brief: string;
  mergedPrs: number[];
  branch?: string;
  filesChanged: string[];
}

export async function runDevAgent(trigger: DevTrigger): Promise<DevAgentResult> {
  if (!isLlmConfigured()) {
    return { brief: "OPENAI_API_KEY not configured.", mergedPrs: [], filesChanged: [] };
  }

  const session: DevSession = { writtenFiles: new Set(), mergedPrs: [], buildPassed: false };
  const messages: ChatMessage[] = [
    { role: "system", content: "Autonomous SAG dev agent. Branch → edit → build → PR → merge. complete_dev_run with brief when done." },
    { role: "user", content: buildTriggerPrompt(trigger) },
  ];

  for (let step = 0; step < Number(process.env.DEV_MAX_STEPS ?? 24); step += 1) {
    const turn = await runDevTurn(messages, devTools);
    if (turn.toolCalls.length === 0) {
      if (turn.message.content?.trim()) session.completionBrief = turn.message.content.trim();
      break;
    }
    messages.push(turn.message);
    for (const tc of turn.toolCalls) {
      messages.push({ role: "tool", tool_call_id: tc.id, name: tc.name, content: await executeDevTool(tc.name, tc.arguments, session) });
      if (tc.name === "complete_dev_run") {
        return { brief: session.completionBrief ?? "Done.", mergedPrs: session.mergedPrs, branch: session.branch, filesChanged: [...session.writtenFiles] };
      }
    }
  }

  return {
    brief: session.completionBrief ?? (session.mergedPrs.length ? `Merged ${session.mergedPrs.join(", ")}` : "No merge."),
    mergedPrs: session.mergedPrs,
    branch: session.branch,
    filesChanged: [...session.writtenFiles],
  };
}
