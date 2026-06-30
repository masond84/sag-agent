import type { DevTrigger } from "../dev/state.js";
import type { LinearIssueRef } from "./linear-client.js";
import { formatGuardrails, getGithubRepo } from "./config.js";

export function formatManualTask(trigger: DevTrigger): string {
  const task = trigger.task?.trim() || "Implement requested change.";
  const context = trigger.taskContext?.trim();
  if (!context) {
    return task;
  }

  return [
    task,
    "",
    "Recent Telegram conversation (implement what SAG proposed or what the user asked for before this confirmation):",
    context,
  ].join("\n");
}

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
    "",
    "Final response:",
    "End with a brief 2-3 sentence summary in first-person voice (as SAG) explaining what you changed and why.",
    "Example: 'I updated the skill tree descriptions to reflect current timing and features. The Home Base UI now shows accurate information about each capability.'",
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
    "Scheduled SAG repository audit: Find ONE small, high-value improvement to existing capabilities.",
    "",
    baseContext(linearIssue),
    "",
    "Focus areas:",
    "1. Missing parameters/options that would make existing features more useful (1-5 line changes)",
    "2. Data we already have but aren't exposing to users (wiring gaps)",
    "3. Home Base web UI (`house/`) - check that skill tree reflects actual skills and fix UI bugs",
    "4. Missing guardrails or unclear error messages",
    "5. Tool descriptions or prompts that could be clearer",
    "",
    "Avoid:",
    "- Dead code cleanup (low value)",
    "- New skills or external integrations",
    "- Large refactors or architectural changes",
    "",
    "Review recent activity logs, skill implementations, tool definitions, and the house/ UI.",
    "If you find something worth fixing, implement it. If nothing obvious stands out, document that the audit found no high-value gaps.",
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
    const task = formatManualTask(trigger);
    const titleSource = trigger.task?.trim() || "Implement requested change.";
    const title = titleSource.length > 80 ? `${titleSource.slice(0, 77)}...` : titleSource;
    return { title, prompt: buildImplementationPrompt(task, linearIssue) };
  }
  return { title: "Scheduled SAG audit", prompt: buildCadencePrompt(linearIssue) };
}
