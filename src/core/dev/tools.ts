import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { readRepoFile, searchRepo } from "../assistant/repo-tools.js";
import { normalizeRelativePath, resolveWritePath } from "./guardrails.js";
import {
  createPullRequest, createWorkBranch, formatPullRequestMergeMessage, getGitDiff, getGitStatus,
  getRecentMerges, listOpenPullRequests, mergePullRequest, pushCurrentBranch, runBuild, stageAndCommit,
} from "./git.js";
import type { ToolDefinition } from "../llm.js";

export interface DevSession {
  branch?: string;
  writtenFiles: Set<string>;
  mergedPrs: number[];
  buildPassed: boolean;
  completionBrief?: string;
}

export const devTools: ToolDefinition[] = [
  { name: "read_repo_file", description: "Read a repo file.", parameters: { type: "object", properties: { path: { type: "string" }, start_line: { type: "number" }, end_line: { type: "number" } }, required: ["path"], additionalProperties: false } },
  { name: "search_repo", description: "Search repo with ripgrep.", parameters: { type: "object", properties: { query: { type: "string" }, glob: { type: "string" } }, required: ["query"], additionalProperties: false } },
  { name: "write_repo_file", description: "Write a repo file.", parameters: { type: "object", properties: { path: { type: "string" }, content: { type: "string" } }, required: ["path", "content"], additionalProperties: false } },
  { name: "create_work_branch", description: "Branch from main.", parameters: { type: "object", properties: { label: { type: "string" } }, additionalProperties: false } },
  { name: "git_status", description: "Git status.", parameters: { type: "object", properties: {}, additionalProperties: false } },
  { name: "git_diff", description: "Git diff.", parameters: { type: "object", properties: { staged: { type: "boolean" } }, additionalProperties: false } },
  { name: "commit_changes", description: "Commit files.", parameters: { type: "object", properties: { message: { type: "string" }, paths: { type: "array", items: { type: "string" } } }, required: ["message"], additionalProperties: false } },
  { name: "push_branch", description: "Push branch.", parameters: { type: "object", properties: {}, additionalProperties: false } },
  { name: "run_build", description: "npm run build — required before PR/merge.", parameters: { type: "object", properties: {}, additionalProperties: false } },
  { name: "create_pull_request", description: "Open PR.", parameters: { type: "object", properties: { title: { type: "string" }, body: { type: "string" } }, required: ["title", "body"], additionalProperties: false } },
  { name: "merge_pull_request", description: "Merge PR.", parameters: { type: "object", properties: { pr_number: { type: "number" } }, required: ["pr_number"], additionalProperties: false } },
  { name: "list_open_prs", description: "List open PRs.", parameters: { type: "object", properties: {}, additionalProperties: false } },
  { name: "recent_merges", description: "Recent merges.", parameters: { type: "object", properties: {}, additionalProperties: false } },
  { name: "complete_dev_run", description: "Finish with evolution brief.", parameters: { type: "object", properties: { brief: { type: "string" } }, required: ["brief"], additionalProperties: false } },
];

export async function executeDevTool(name: string, argsJson: string, session: DevSession): Promise<string> {
  const args = argsJson ? (JSON.parse(argsJson) as Record<string, unknown>) : {};
  switch (name) {
    case "read_repo_file":
      return readRepoFile(String(args.path ?? ""), args.start_line ? Number(args.start_line) : 1, args.end_line ? Number(args.end_line) : undefined);
    case "search_repo":
      return searchRepo(String(args.query ?? ""), args.glob ? String(args.glob) : undefined);
    case "write_repo_file": {
      const rel = normalizeRelativePath(String(args.path ?? ""));
      const absolute = resolveWritePath(rel);
      await mkdir(path.dirname(absolute), { recursive: true });
      await writeFile(absolute, String(args.content ?? ""), "utf8");
      session.writtenFiles.add(rel);
      session.buildPassed = false;
      return `Wrote ${rel}`;
    }
    case "create_work_branch":
      session.branch = await createWorkBranch(args.label ? String(args.label) : "auto");
      return `On ${session.branch}`;
    case "git_status": return getGitStatus();
    case "git_diff": return getGitDiff(Boolean(args.staged));
    case "commit_changes":
      return stageAndCommit(Array.isArray(args.paths) && args.paths.length ? args.paths.map(String) : [...session.writtenFiles], String(args.message ?? "SAG update"));
    case "push_branch": return pushCurrentBranch();
    case "run_build": {
      const r = await runBuild();
      session.buildPassed = r.ok;
      return r.ok ? `Build passed.\n${r.output}` : `Build failed.\n${r.output}`;
    }
    case "create_pull_request":
      if (!session.buildPassed) return "Run run_build first.";
      { const pr = await createPullRequest(String(args.title ?? ""), String(args.body ?? "")); return `PR #${pr.number}: ${pr.url}`; }
    case "merge_pull_request":
      if (!session.buildPassed) return "Run run_build first.";
      if (session.mergedPrs.length >= Number(process.env.DEV_MAX_MERGES_PER_RUN ?? 3)) return "Merge limit reached.";
      {
        const prNumber = Number(args.pr_number);
        const r = await mergePullRequest(prNumber);
        if (r.merged) {
          session.mergedPrs.push(prNumber);
          session.buildPassed = false;
        }
        return formatPullRequestMergeMessage(prNumber, r);
      }
    case "list_open_prs": return listOpenPullRequests();
    case "recent_merges": return getRecentMerges();
    case "complete_dev_run":
      session.completionBrief = String(args.brief ?? "").trim();
      return "Done.";
    default: return `Unknown tool: ${name}`;
  }
}
