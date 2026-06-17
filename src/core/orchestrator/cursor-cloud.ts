import { Agent, Cursor } from "@cursor/sdk";
import type { RunResult } from "@cursor/sdk";
import {
  getCloudModelId,
  getCloudPollIntervalMs,
  getCloudTimeoutMs,
  getCursorApiKey,
  getGithubRepoUrl,
} from "./config.js";

export interface CloudRunOutcome {
  agentId: string;
  runId: string;
  status: RunResult["status"];
  summary?: string;
  prUrl?: string;
  branch?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractPrFromResult(result: RunResult): { prUrl?: string; branch?: string } {
  for (const branch of result.git?.branches ?? []) {
    if (branch.prUrl) return { prUrl: branch.prUrl, branch: branch.branch };
  }
  return {};
}

export async function pingCursor(): Promise<{ apiKeyName: string; modelCount: number; repoCount: number }> {
  const apiKey = getCursorApiKey();
  if (!apiKey) throw new Error("CURSOR_API_KEY is not configured.");
  const me = await Cursor.me({ apiKey });
  const models = await Cursor.models.list({ apiKey });
  const repos = await Cursor.repositories.list({ apiKey });
  return { apiKeyName: me.apiKeyName, modelCount: models.length, repoCount: repos.length };
}

export async function runCursorCloudAgent(prompt: string): Promise<CloudRunOutcome> {
  const apiKey = getCursorApiKey();
  if (!apiKey) throw new Error("CURSOR_API_KEY is not configured.");

  const agent = await Agent.create({
    apiKey,
    model: { id: getCloudModelId() },
    cloud: {
      repos: [{ url: getGithubRepoUrl() }],
      autoCreatePR: true,
      skipReviewerRequest: true,
    },
  });

  try {
    const run = await agent.send(prompt);
    const deadline = Date.now() + getCloudTimeoutMs();
    let result: RunResult | undefined;

    while (Date.now() < deadline) {
      if (run.supports("wait")) {
        result = await run.wait();
        break;
      }
      await sleep(getCloudPollIntervalMs());
    }

    if (!result) {
      throw new Error(`Cursor cloud run timed out after ${getCloudTimeoutMs()}ms (agent ${agent.agentId}).`);
    }

    const git = extractPrFromResult(result);
    return {
      agentId: agent.agentId,
      runId: result.id,
      status: result.status,
      summary: result.result?.trim(),
      prUrl: git.prUrl,
      branch: git.branch,
    };
  } finally {
    agent.close();
  }
}
