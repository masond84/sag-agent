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


export function buildCadencePrompt(linearIssue?: Pick<LinearIssueRef, "identifier" | "url">): string {
  return [
    "Scheduled SAG repository audit: Find improvements to advance towards $200/week income goal OR enhance existing capabilities.",
    "",
    baseContext(linearIssue),
    "",
    "PRIMARY MISSION: SAG operates API services autonomously to generate $200/week minimum revenue.",
    "Review /api/income/stats endpoint to see current progress and prioritize accordingly.",
    "",
    "Priority Focus Areas (in order):",
    "1. INCOME-GENERATING TASKS (if behind weekly goal):",
    "   - Optimize service performance (faster = better UX = more customers)",
    "   - Add features to existing services (batch processing, premium options)",
    "   - Fix service reliability issues (check recent failures in income logs)",
    "   - Implement new high-margin services (translation API, transcription)",
    "   - Marketing automation (SEO content generation, social posting)",
    "   - Landing page improvements for better conversion",
    "",
    "2. EXISTING CAPABILITY IMPROVEMENTS:",
    "   - Missing parameters/options that would make features more useful",
    "   - Data we already have but aren't exposing to users",
    "   - Home Base web UI (`house/`) - skill tree and income dashboard",
    "   - Missing guardrails or unclear error messages",
    "   - Tool descriptions or prompts that could be clearer",
    "",
    "Avoid:",
    "- Dead code cleanup (low value)",
    "- Large refactors or architectural changes",
    "- Tasks that don't move towards income goal OR improve user experience",
    "",
    "Review: activity logs, income service stats, skill implementations, house/ UI, and API endpoints.",
    "If you find something worth fixing, implement it. Document findings in commit message.",
    "",
    prDeliverables(linearIssue),
  ].join("\n");
}

export function buildOrchestratorPrompt(
  trigger: DevTrigger,
  linearIssue?: Pick<LinearIssueRef, "identifier" | "url">,
): { title: string; prompt: string } {
  if (trigger.kind === "manual") {
    const task = formatManualTask(trigger);
    const titleSource = trigger.task?.trim() || "Implement requested change.";
    const title = titleSource.length > 80 ? `${titleSource.slice(0, 77)}...` : titleSource;
    return { title, prompt: buildImplementationPrompt(task, linearIssue) };
  }
  return { title: "Scheduled SAG audit", prompt: buildCadencePrompt(linearIssue) };
}
