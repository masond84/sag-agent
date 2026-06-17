import "dotenv/config";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getRepoRoot } from "../core/assistant/repo-tools.js";
import {
  checkOrchestratorEnv,
  getGithubRepo,
  getOrchestratorMode,
  isDevOrchestratorEnabled,
} from "../core/orchestrator/config.js";
import { pingCursor } from "../core/orchestrator/cursor-cloud.js";
import { pingLinear } from "../core/orchestrator/linear-client.js";

const execFileAsync = promisify(execFile);

async function ghStatus(): Promise<string> {
  try {
    const { stdout } = await execFileAsync("gh", ["auth", "status"], { maxBuffer: 32_000 });
    return stdout.trim().split("\n")[0] ?? "ok";
  } catch {
    return "not authenticated";
  }
}

async function main(): Promise<void> {
  const lines = [
    "SAG orchestrator preflight",
    "",
    `- DEV_RUNNER_ENABLED: ${isDevOrchestratorEnabled()}`,
    `- DEV_ORCHESTRATOR_MODE: ${getOrchestratorMode()}`,
    `- GITHUB_REPO: ${getGithubRepo()}`,
    `- Repo root: ${getRepoRoot()}`,
  ];

  const envCheck = checkOrchestratorEnv();
  lines.push(`- Required env: ${envCheck.ok ? "ok" : `missing ${envCheck.missing.join(", ")}`}`);

  if (envCheck.ok) {
    try {
      const linear = await pingLinear();
      lines.push(
        "",
        "Linear (SDK):",
        `- team ${linear.teamKey}${linear.teamName ? ` (${linear.teamName})` : ""}`,
        `- project ${linear.projectName}${linear.projectId ? " ok" : " (missing)"}`,
        `- labels ${linear.orchestratorLabels.join(", ") || "none"}`,
        `- viewer ${linear.viewer ?? "unknown"}`,
      );
    } catch (error) {
      lines.push("", "Linear: FAILED", String(error));
    }

    try {
      const cursor = await pingCursor();
      lines.push("", "Cursor:", `- key ${cursor.apiKeyName}`, `- models ${cursor.modelCount}`, `- repos ${cursor.repoCount}`);
    } catch (error) {
      lines.push("", "Cursor: FAILED", String(error));
    }
  }

  lines.push("", "GitHub CLI:", `- ${await ghStatus()}`);
  console.log(lines.join("\n"));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
