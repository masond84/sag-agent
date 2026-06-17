import type { DevTrigger } from "../dev/state.js";
import type { LinearIssueRef } from "./linear-client.js";
import { formatGuardrails, getGithubRepo } from "./config.js";

function baseContext(linearIssue?: Pick<LinearIssueRef, "identifier" | "url">): string {
  const lines = [`Repository: ${getGithubRepo()}`, formatGuardrails()];
  if (linearIssue) lines.push(`Linear issue: ${linearIssue.identifier} (${linearIssue.url})`);
  return lines.join("\n\n");
}

function prDeliverables(linearIssue?: Pick<LinearIssueRef, "identifier">): string {
  const idNote = linearIssue?.identifier
    ? `- PR title must include ${linearIssue.identifier} (e.g. "${linearIssue.identifier}: …").`
    : "";
  return [
    "Deliverables:",
    "- Make the code changes.",
    "- Run npm run build and fix any errors.",
    "- Open a pull request targeting main with a clear title and summary.",
    ...(idNote ? [idNote] : []),
  ].join("\n");
}

export function buildImplementationPrompt(task: string, linearIssue?: Pick<LinearIssueRef, "identifier" | "url">): string {
  return [
    "Implement this change for the SAG personal agent repository.",
    "",
    baseContext(linearIssue),
    "",
    "Task:",
    task.trim(),
    "",
    prDeliverables(linearIssue),
  ].join("\n");
}

export function buildPostMergePrompt(
  prNumber: number,
  prTitle?: string,
  linearIssue?: Pick<LinearIssueRef, "identifier" | "url">,
): string {
  return [
    `Post-merge audit for PR #${prNumber}${prTitle ? `: ${prTitle}` : ""}.`,
    "",
    baseContext(linearIssue),
    "",
    "Review the merged changes on main. Fix regressions, tighten types, improve tests or docs if needed.",
    "If no follow-up is required, open a minimal PR that documents the audit outcome.",
    "",
    prDeliverables(linearIssue),
  ].join("\n");
}

export function buildCadencePrompt(linearIssue?: Pick<LinearIssueRef, "identifier" | "url">): string {
  return [
    "Scheduled SAG repository audit.",
    "",
    baseContext(linearIssue),
    "",
    "Look for one small, safe improvement: dead code, unclear naming, missing README notes, or a minor bug.",
    "Skip large refactors. Open a PR only if you make a concrete change.",
    "",
    prDeliverables(linearIssue),
  ].join("\n");
}

export function buildOrchestratorPrompt(
  trigger: DevTrigger,
  linearIssue?: Pick<LinearIssueRef, "identifier" | "url">,
): { title: string; prompt: string } {
  if (trigger.kind === "post_merge") {
    const title = `Post-merge audit: PR #${trigger.prNumber ?? "?"}`;
    return { title, prompt: buildPostMergePrompt(trigger.prNumber ?? 0, trigger.prTitle, linearIssue) };
  }
  if (trigger.kind === "manual") {
    const task = trigger.task?.trim() || "Implement requested change.";
    const title = task.length > 80 ? `${task.slice(0, 77)}...` : task;
    return { title, prompt: buildImplementationPrompt(task, linearIssue) };
  }
  return { title: "Scheduled SAG audit", prompt: buildCadencePrompt(linearIssue) };
}
