import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getRepoRoot } from "../assistant/repo-tools.js";
import {
  checkOrchestratorEnv,
  getGithubRepo,
  getOrchestratorMode,
  isAutoMergeEnabled,
  isCursorOrchestratorMode,
  isPostMergeAuditEnabled,
} from "../orchestrator/config.js";
import { pingLinear } from "../orchestrator/linear-client.js";
import { getDevRunnerSummary, isDevRunnerEnabled } from "./state.js";

const execFileAsync = promisify(execFile);

export async function getDevStatus(): Promise<string> {
  let ghStatus = "unknown";
  try {
    const { stdout } = await execFileAsync("gh", ["auth", "status"], { maxBuffer: 32_000 });
    ghStatus = stdout.trim().split("\n")[0] ?? "ok";
  } catch {
    ghStatus = "not authenticated";
  }

  let prs = "unknown";
  try {
    const { stdout } = await execFileAsync("gh", ["pr", "list", "--limit", "5"], { cwd: getRepoRoot(), maxBuffer: 64_000 });
    prs = stdout.trim() || "No open PRs.";
  } catch {
    prs = "Could not list PRs.";
  }

  const envCheck = checkOrchestratorEnv();
  let linearLine = "- Linear: not checked";
  if (envCheck.ok) {
    try {
      const linear = await pingLinear();
      linearLine = `- Linear: ${linear.teamKey} / ${linear.projectName}${linear.projectId ? " ok" : " (project missing)"}`;
    } catch (error) {
      linearLine = `- Linear: error (${String(error)})`;
    }
  }

  return [
    "SAG dev status", "",
    `- Dev runner: ${isDevRunnerEnabled() ? "ENABLED" : "disabled"}`,
    `- Orchestrator mode: ${getOrchestratorMode()}${isCursorOrchestratorMode() ? " (Cursor Cloud)" : ""}`,
    `- GitHub repo: ${getGithubRepo()}`,
    `- Repo root: ${getRepoRoot()}`,
    `- Auto merge: ${isAutoMergeEnabled()}`,
    `- Post-merge audit: ${isPostMergeAuditEnabled()}`,
    `- Orchestrator env: ${envCheck.ok ? "ok" : `missing ${envCheck.missing.join(", ")}`}`,
    linearLine,
    `- GitHub CLI: ${ghStatus}`, "",
    "Open PRs:", prs, "",
    await getDevRunnerSummary(), "",
    "Commands: /dev status | /dev run [task]",
  ].join("\n");
}
