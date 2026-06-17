import type { DevTrigger } from "../dev/state.js";
import { queuePostMergeScan } from "../dev/state.js";
import {
  checkOrchestratorEnv,
  isAutoMergeEnabled,
  isPostMergeAuditEnabled,
} from "./config.js";
import { runCursorCloudAgent } from "./cursor-cloud.js";
import { autoMergePullRequest, getPullRequestSummary, waitForPullRequest } from "./github.js";
import { createLinearIssue } from "./linear-client.js";
import { buildOrchestratorPrompt } from "./prompts.js";

export interface OrchestratorCycleResult {
  brief: string;
  notify: boolean;
  trigger: DevTrigger;
  mergedPrs: number[];
  linearIssueUrl?: string;
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
  const cloudPrompt = buildOrchestratorPrompt(trigger, linearIssue.url).prompt;
  const cloud = await runCursorCloudAgent(cloudPrompt);
  const pr = await waitForPullRequest({ prUrl: cloud.prUrl, branch: cloud.branch });
  const mergedPrs: number[] = [];
  const briefParts = [
    `Linear: ${linearIssue.identifier} (${linearIssue.url})`,
    `Cursor agent: ${cloud.agentId} (${cloud.status})`,
  ];

  if (cloud.summary) briefParts.push("Agent summary:", cloud.summary.slice(0, 1200));

  if (!pr) {
    briefParts.push("No pull request detected before timeout. Check Cursor Cloud dashboard.");
    return {
      brief: buildBrief(briefParts),
      notify: true,
      trigger,
      mergedPrs,
      linearIssueUrl: linearIssue.url,
      cursorAgentId: cloud.agentId,
    };
  }

  briefParts.push(await getPullRequestSummary(pr.number));

  if (isAutoMergeEnabled()) {
    const merge = await autoMergePullRequest(pr.number);
    if (merge.merged) {
      mergedPrs.push(pr.number);
      briefParts.push(
        `Merged PR #${pr.number}: ${merge.title}${merge.wasDraft ? " (was draft, marked ready)" : ""}`,
      );
      if (isPostMergeAuditEnabled()) {
        await queuePostMergeScan(pr.number, merge.title);
        briefParts.push("Queued post-merge audit.");
      }
    } else {
      briefParts.push(
        `PR #${pr.number} was not merged (${merge.title})${merge.wasDraft ? " after marking ready" : ""}.`,
      );
    }
  } else {
    briefParts.push(`PR ready for review: ${pr.url}`);
  }

  return {
    brief: buildBrief(briefParts),
    notify: true,
    trigger,
    mergedPrs,
    linearIssueUrl: linearIssue.url,
    cursorAgentId: cloud.agentId,
    prUrl: pr.url,
  };
}
