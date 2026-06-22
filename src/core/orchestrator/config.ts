export type OrchestratorMode = "local" | "cursor";

const GUARDRAIL_ALLOW = ["src/", "config/", "scripts/", "house/", "README.md", ".env.example"];
const GUARDRAIL_BLOCK = [".env", "data/", "node_modules/"];

export function getOrchestratorMode(): OrchestratorMode {
  const mode = (process.env.DEV_ORCHESTRATOR_MODE ?? "cursor").trim().toLowerCase();
  return mode === "local" ? "local" : "cursor";
}

export function isCursorOrchestratorMode(): boolean {
  return isDevOrchestratorEnabled() && getOrchestratorMode() === "cursor";
}

export function isDevOrchestratorEnabled(): boolean {
  return (process.env.DEV_RUNNER_ENABLED ?? "false").toLowerCase() === "true";
}

export function isAutoMergeEnabled(): boolean {
  return (process.env.DEV_AUTO_MERGE ?? "true").toLowerCase() === "true";
}

export function isPostMergeAuditEnabled(): boolean {
  return (process.env.DEV_POST_MERGE_AUDIT ?? "true").toLowerCase() === "true";
}

export function getLinearApiKey(): string | undefined {
  return process.env.LINEAR_API_KEY?.trim() || undefined;
}

export function getLinearTeamKey(): string | undefined {
  return process.env.LINEAR_TEAM_KEY?.trim() || undefined;
}

export function getLinearProjectName(): string {
  return process.env.LINEAR_PROJECT?.trim() || "SAG Agent";
}

export function getCursorApiKey(): string | undefined {
  return process.env.CURSOR_API_KEY?.trim() || undefined;
}

export function getGithubRepo(): string {
  const explicit = process.env.GITHUB_REPO?.trim();
  if (explicit) return explicit.replace(/^https:\/\/github\.com\//, "").replace(/\.git$/, "");
  return "masond84/sag-agent";
}

export function getGithubRepoUrl(): string {
  return `https://github.com/${getGithubRepo()}`;
}

export function getCloudModelId(): string {
  return process.env.DEV_CLOUD_MODEL?.trim() || "composer-2.5";
}

export function getCloudTimeoutMs(): number {
  return Number(process.env.DEV_CLOUD_TIMEOUT_MS ?? 1_800_000);
}

export function getCloudPollIntervalMs(): number {
  return Number(process.env.DEV_CLOUD_POLL_MS ?? 15_000);
}

export function formatGuardrails(): string {
  return [
    "Guardrails:",
    `- You may edit: ${GUARDRAIL_ALLOW.join(", ")}`,
    `- Never edit: ${GUARDRAIL_BLOCK.join(", ")}`,
    "- Run npm run build before opening the PR.",
    "- Keep changes focused on the task.",
  ].join("\n");
}

export interface OrchestratorEnvCheck {
  ok: boolean;
  missing: string[];
}

export function checkOrchestratorEnv(): OrchestratorEnvCheck {
  const missing: string[] = [];
  if (!getLinearApiKey()) missing.push("LINEAR_API_KEY");
  if (!getLinearTeamKey()) missing.push("LINEAR_TEAM_KEY");
  if (!getCursorApiKey()) missing.push("CURSOR_API_KEY");
  return { ok: missing.length === 0, missing };
}
