import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getRepoRoot } from "../assistant/repo-tools.js";
import { assertPathsWritable, normalizeRelativePath } from "./guardrails.js";

const execFileAsync = promisify(execFile);
const cwd = () => getRepoRoot();

async function git(args: string[], maxBuffer = 512_000): Promise<string> {
  const { stdout, stderr } = await execFileAsync("git", args, { cwd: cwd(), maxBuffer });
  return (stdout || stderr).trim();
}

async function gh(args: string[], maxBuffer = 512_000): Promise<string> {
  const env = { ...process.env };
  if (process.env.GITHUB_TOKEN?.trim()) {
    env.GH_TOKEN = process.env.GITHUB_TOKEN.trim();
  }
  const { stdout, stderr } = await execFileAsync("gh", args, { cwd: cwd(), env, maxBuffer });
  return (stdout || stderr).trim();
}

export async function ensureCleanMain(): Promise<void> {
  await git(["fetch", "origin"]);
  const dirty = await git(["status", "--porcelain"]);
  if (dirty) {
    await git(["stash", "push", "-u", "-m", "sag-dev-autostash"]).catch(() => undefined);
  }
  let branch = await git(["rev-parse", "--abbrev-ref", "HEAD"]);
  if (branch !== "main" && branch !== "master") {
    await git(["checkout", "main"]).catch(async () => git(["checkout", "master"]));
    branch = await git(["rev-parse", "--abbrev-ref", "HEAD"]);
  }
  await git(["pull", "--ff-only", "origin", branch]);
}

export async function createWorkBranch(label: string): Promise<string> {
  await ensureCleanMain();
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  const branch = `sag/auto-${Date.now()}${slug ? `-${slug}` : ""}`;
  await git(["checkout", "-b", branch]);
  return branch;
}

export async function getGitStatus(): Promise<string> {
  const branch = await git(["rev-parse", "--abbrev-ref", "HEAD"]);
  const status = await git(["status", "--short"]);
  const log = await git(["log", "--oneline", "-5"]);
  return [`Branch: ${branch}`, "", status || "(clean)", "", log].join("\n");
}

export async function getGitDiff(staged = false): Promise<string> {
  return (await git(staged ? ["diff", "--cached"] : ["diff"], 1_000_000)) || "(no diff)";
}

export async function stageAndCommit(relativePaths: string[], message: string): Promise<string> {
  assertPathsWritable(relativePaths);
  const normalized = relativePaths.map(normalizeRelativePath);
  for (const file of normalized) {
    await git(["add", "--", file]);
  }
  await git(["commit", "-m", message.trim().slice(0, 500)]);
  return `Committed: ${normalized.join(", ")}`;
}

export async function pushCurrentBranch(): Promise<string> {
  const branch = await git(["rev-parse", "--abbrev-ref", "HEAD"]);
  await git(["push", "-u", "origin", branch]);
  return `Pushed ${branch}`;
}

export async function createPullRequest(title: string, body: string): Promise<{ number: number; url: string }> {
  const branch = await git(["rev-parse", "--abbrev-ref", "HEAD"]);
  const output = await gh([
    "pr", "create", "--title", title.slice(0, 200), "--body", body.slice(0, 4000),
    "--head", branch, "--base", "main",
  ]);
  const url = output.match(/https:\/\/\S+/)?.[0] ?? output;
  const number = Number(url.match(/\/pull\/(\d+)/)?.[1] ?? 0);
  return { number, url };
}

export async function mergePullRequest(prNumber: number): Promise<{ merged: boolean; title: string; wasDraft?: boolean }> {
  const info = JSON.parse(await gh(["pr", "view", String(prNumber), "--json", "title,state,isDraft"])) as {
    title: string;
    state: string;
    isDraft: boolean;
  };
  if (info.state !== "OPEN") {
    return { merged: false, title: info.title };
  }

  let wasDraft = false;
  if (info.isDraft) {
    await gh(["pr", "ready", String(prNumber)]);
    wasDraft = true;
  }

  try {
    await gh(["pr", "merge", String(prNumber), "--merge", "--delete-branch"]);
    return { merged: true, title: info.title, wasDraft };
  } catch {
    return { merged: false, title: info.title, wasDraft };
  }
}

export async function listOpenPullRequests(): Promise<string> {
  try {
    const raw = await gh(["pr", "list", "--limit", "10", "--json", "number,title,headRefName"]);
    const pulls = JSON.parse(raw) as Array<{ number: number; title: string; headRefName: string }>;
    return pulls.length ? pulls.map((p) => `#${p.number} ${p.title}`).join("\n") : "No open pull requests.";
  } catch {
    return "Could not list PRs.";
  }
}

export async function runBuild(): Promise<{ ok: boolean; output: string }> {
  try {
    const { stdout, stderr } = await execFileAsync("npm", ["run", "build"], { cwd: cwd(), maxBuffer: 2_000_000 });
    return { ok: true, output: (stdout + stderr).trim().slice(-2000) };
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; message?: string };
    return { ok: false, output: [err.stdout, err.stderr, err.message].filter(Boolean).join("\n").slice(-3000) };
  }
}

export async function pullMainAndCheckout(): Promise<string> {
  await ensureCleanMain();
  return `On ${await git(["rev-parse", "--abbrev-ref", "HEAD"])}, up to date.`;
}

export async function getRecentMerges(): Promise<string> {
  try {
    return (await git(["log", "--merges", "--oneline", "-n", "5"])) || "(none)";
  } catch {
    return "(none)";
  }
}
