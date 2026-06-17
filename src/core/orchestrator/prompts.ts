import type { DevTrigger } from "../dev/state.js";
import { formatGuardrails, getGithubRepo } from "./config.js";

function baseContext(linearIssueUrl?: string): string {
  const lines = [`Repository: ${getGithubRepo()}`, formatGuardrails()];
  if (linearIssueUrl) lines.push(`Linear issue: ${linearIssueUrl}`);
  return lines.join("\n\n");
}

export function buildImplementationPrompt(task: string, linearIssueUrl?: string): string {
  return [
    "Implement this change for the SAG personal agent repository.",
    "",
    baseContext(linearIssueUrl),
    "",
    "Task:",
    task.trim(),
    "",
    "Deliverables:",
    "- Make the code changes.",
    "- Run npm run build and fix any errors.",
    "- Open a pull request targeting main with a clear title and summary.",
  ].join("\n");
}

export function buildPostMergePrompt(prNumber: number, prTitle?: string, linearIssueUrl?: string): string {
  return [
    `Post-merge audit for PR #${prNumber}${prTitle ? `: ${prTitle}` : ""}.`,
    "",
    baseContext(linearIssueUrl),
    "",
    "Review the merged changes on main. Fix regressions, tighten types, improve tests or docs if needed.",
    "If no follow-up is required, open a minimal PR that documents the audit outcome.",
  ].join("\n");
}

export function buildCadencePrompt(linearIssueUrl?: string): string {
  return [
    "Scheduled SAG repository audit.",
    "",
    baseContext(linearIssueUrl),
    "",
    "Look for one small, safe improvement: dead code, unclear naming, missing README notes, or a minor bug.",
    "Skip large refactors. Open a PR only if you make a concrete change.",
  ].join("\n");
}

export function buildOrchestratorPrompt(trigger: DevTrigger, linearIssueUrl?: string): { title: string; prompt: string } {
  if (trigger.kind === "post_merge") {
    const title = `Post-merge audit: PR #${trigger.prNumber ?? "?"}`;
    return { title, prompt: buildPostMergePrompt(trigger.prNumber ?? 0, trigger.prTitle, linearIssueUrl) };
  }
  if (trigger.kind === "manual") {
    const task = trigger.task?.trim() || "Implement requested change.";
    const title = task.length > 80 ? `${task.slice(0, 77)}...` : task;
    return { title, prompt: buildImplementationPrompt(task, linearIssueUrl) };
  }
  return { title: "Scheduled SAG audit", prompt: buildCadencePrompt(linearIssueUrl) };
}
