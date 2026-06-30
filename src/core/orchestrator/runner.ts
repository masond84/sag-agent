import type { DevTrigger } from "../dev/state.js";
import { queuePostMergeScan } from "../dev/state.js";
import {
  checkOrchestratorEnv,
  isAutoMergeEnabled,
  isPostMergeAuditEnabled,
} from "./config.js";
import { runCursorCloudAgent } from "./cursor-cloud.js";
import { autoMergePullRequest, getPullRequestSummary, waitForPullRequest } from "./github.js";
import { createLinearIssue, type LinearIssueRef } from "./linear-client.js";
import { buildOrchestratorPrompt } from "./prompts.js";

export interface OrchestratorCycleResult {
  brief: string;
  notify: boolean;
  trigger: DevTrigger;
  mergedPrs: number[];
  linearIssue?: LinearIssueRef;
  cursorAgentId?: string;
  prUrl?: string;
}

function buildBrief(parts: string[]): string {
  return parts.filter(Boolean).join("\n\n");
}

export async function runOrchestratorCycle(trigger: DevTrigger): Promise<OrchestratorCycleResult> {
  const envCheck = checkOrchestratorEnv();
  if (!envCheck.ok) {
    return {
      brief: `Orchestrator misconfigured. Missing: ${envCheck.missing.join(", ")}`,
      notify: true,
      trigger,
      mergedPrs: [],
    };
  }

  const { title, prompt } = buildOrchestratorPrompt(trigger);
  const linearDescription = [
    `SAG orchestrator trigger: ${trigger.kind}`,
    trigger.task ? `Task: ${trigger.task}` : "",
    trigger.prNumber ? `Related PR: #${trigger.prNumber}` : "",
    "",
    prompt,
  ].filter(Boolean).join("\n");

  const linearIssue = await createLinearIssue(title, linearDescription, trigger.kind);
  const cloudPrompt = buildOrchestratorPrompt(trigger, linearIssue).prompt;
  const cloud = await runCursorCloudAgent(cloudPrompt);
  const pr = await waitForPullRequest({ prUrl: cloud.prUrl, branch: cloud.branch });
  const mergedPrs: number[] = [];
  const briefParts = [`Linear: ${linearIssue.identifier} (${linearIssue.url})`];

  if (cloud.summary) {
    const summary = cloud.summary.slice(0, 400).trim();
    briefParts.push(summary);
  }

  if (!pr) {
    briefParts.push("No PR detected before timeout.");
    return {
      brief: buildBrief(briefParts),
      notify: true,
      trigger,
      mergedPrs,
      linearIssue,
      cursorAgentId: cloud.agentId,
    };
  }

  briefParts.push(`PR: ${pr.url}`);

  if (isAutoMergeEnabled()) {
    const merge = await autoMergePullRequest(pr.number);
    if (merge.merged) {
      mergedPrs.push(pr.number);
      if (isPostMergeAuditEnabled()) {
        await queuePostMergeScan(pr.number, merge.title);
      }
    }
  }

  return {
    brief: buildBrief(briefParts),
    notify: true,
    trigger,
    mergedPrs,
    linearIssue,
    cursorAgentId: cloud.agentId,
    prUrl: pr.url,
  };
}
