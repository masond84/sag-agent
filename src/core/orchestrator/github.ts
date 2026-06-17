import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getRepoRoot } from "../assistant/repo-tools.js";
import { mergePullRequest } from "../dev/git.js";
import { getCloudPollIntervalMs, getCloudTimeoutMs } from "./config.js";

const execFileAsync = promisify(execFile);

export interface PullRequestRef {
  number: number;
  url: string;
  title: string;
  headRefName?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parsePrNumberFromUrl(prUrl?: string): number | undefined {
  if (!prUrl) return undefined;
  const match = prUrl.match(/\/pull\/(\d+)/);
  return match ? Number(match[1]) : undefined;
}

async function ghJson<T>(args: string[]): Promise<T> {
  const env = { ...process.env };
  if (process.env.GITHUB_TOKEN?.trim()) env.GH_TOKEN = process.env.GITHUB_TOKEN.trim();
  const { stdout } = await execFileAsync("gh", args, { cwd: getRepoRoot(), env, maxBuffer: 512_000 });
  return JSON.parse(stdout) as T;
}

export async function findPullRequestByBranch(branch: string): Promise<PullRequestRef | undefined> {
  try {
    const pulls = await ghJson<Array<{ number: number; url: string; title: string; headRefName: string }>>([
      "pr", "list", "--head", branch, "--json", "number,url,title,headRefName", "--limit", "1",
    ]);
    return pulls[0];
  } catch {
    return undefined;
  }
}

export async function waitForPullRequest(input: { prUrl?: string; branch?: string }): Promise<PullRequestRef | undefined> {
  const directNumber = parsePrNumberFromUrl(input.prUrl);
  if (directNumber && input.prUrl) {
    return { number: directNumber, url: input.prUrl, title: `PR #${directNumber}` };
  }
  if (!input.branch) return undefined;

  const deadline = Date.now() + getCloudTimeoutMs();
  while (Date.now() < deadline) {
    const byBranch = await findPullRequestByBranch(input.branch);
    if (byBranch) return byBranch;
    await sleep(getCloudPollIntervalMs());
  }
  return undefined;
}

export async function getPullRequestSummary(prNumber: number): Promise<string> {
  try {
    const info = await ghJson<{ title: string; url: string; files: Array<{ path: string }> }>([
      "pr", "view", String(prNumber), "--json", "title,url,files",
    ]);
    const files = info.files.slice(0, 12).map((file) => `- ${file.path}`).join("\n");
    return [`PR #${prNumber}: ${info.title}`, info.url, "", "Files:", files || "(none listed)"].join("\n");
  } catch {
    return `PR #${prNumber}`;
  }
}

export async function autoMergePullRequest(prNumber: number): Promise<{ merged: boolean; title: string; wasDraft?: boolean }> {
  return mergePullRequest(prNumber);
}
