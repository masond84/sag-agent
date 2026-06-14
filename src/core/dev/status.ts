import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getRepoRoot } from "../assistant/repo-tools.js";
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

  return [
    "SAG dev status", "",
    `- Dev runner: ${isDevRunnerEnabled() ? "ENABLED" : "disabled"}`,
    `- Repo: ${getRepoRoot()}`,
    `- GitHub CLI: ${ghStatus}`, "",
    "Open PRs:", prs, "",
    await getDevRunnerSummary(), "",
    "Commands: /dev status | /dev run [task]",
  ].join("\n");
}
