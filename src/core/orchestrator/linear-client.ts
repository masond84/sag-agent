import { LinearClient } from "@linear/sdk";
import type { DevTriggerKind } from "../dev/state.js";
import { getGithubRepo, getLinearApiKey, getLinearProjectName, getLinearTeamKey } from "./config.js";

export interface LinearIssueRef {
  id: string;
  identifier: string;
  url: string;
  title: string;
}

export interface LinearWorkspaceInfo {
  teamKey: string;
  teamId: string;
  teamName?: string;
  projectName: string;
  projectId?: string;
  viewer?: string;
  orchestratorLabels: string[];
}

const ORCHESTRATOR_LABELS = ["orchestrator", "implementation", "post-merge-audit", "cadence"] as const;

let cachedTeamId: string | undefined;
let cachedProjectId: string | undefined;
let cachedDoneStateId: string | undefined;
const cachedLabelIds = new Map<string, string>();

function getClient(): LinearClient {
  const apiKey = getLinearApiKey();
  if (!apiKey) throw new Error("LINEAR_API_KEY is not configured.");
  return new LinearClient({ apiKey });
}

export async function resolveLinearTeamId(): Promise<string> {
  if (cachedTeamId) return cachedTeamId;
  const teamKey = getLinearTeamKey();
  if (!teamKey) throw new Error("LINEAR_TEAM_KEY is not configured.");
  const team = (await getClient().teams()).nodes.find((entry) => entry.key?.toLowerCase() === teamKey.toLowerCase());
  if (!team?.id) throw new Error(`Linear team not found for key "${teamKey}".`);
  cachedTeamId = team.id;
  return team.id;
}

export async function resolveLinearProjectId(): Promise<string | undefined> {
  if (cachedProjectId) return cachedProjectId;
  const project = (await getClient().projects({ filter: { name: { eq: getLinearProjectName() } } })).nodes[0];
  if (!project?.id) return undefined;
  cachedProjectId = project.id;
  return project.id;
}

function triggerLabelName(kind: DevTriggerKind): string {
  if (kind === "post_merge") return "post-merge-audit";
  if (kind === "cadence") return "cadence";
  return "implementation";
}

async function resolveLabelId(name: string, teamId: string): Promise<string | undefined> {
  const cached = cachedLabelIds.get(name);
  if (cached) return cached;
  const label = (await getClient().issueLabels({
    filter: { name: { eq: name }, team: { id: { eq: teamId } } },
  })).nodes[0];
  if (!label?.id) return undefined;
  cachedLabelIds.set(name, label.id);
  return label.id;
}

async function resolveIssueLabelIds(kind: DevTriggerKind, teamId: string): Promise<string[]> {
  const ids: string[] = [];
  for (const name of ["orchestrator", triggerLabelName(kind)]) {
    const id = await resolveLabelId(name, teamId);
    if (id) ids.push(id);
  }
  return ids;
}

export async function resolveDoneStateId(): Promise<string> {
  if (cachedDoneStateId) return cachedDoneStateId;
  const teamId = await resolveLinearTeamId();
  const state = (await getClient().workflowStates({
    filter: { team: { id: { eq: teamId } }, type: { eq: "completed" } },
  })).nodes[0];
  if (!state?.id) throw new Error('Linear "Done" workflow state not found for team.');
  cachedDoneStateId = state.id;
  return state.id;
}

export async function completeLinearIssue(
  issue: Pick<LinearIssueRef, "id" | "identifier">,
  details?: { mergedPrNumbers?: number[] },
): Promise<void> {
  const client = getClient();
  const stateId = await resolveDoneStateId();
  await client.updateIssue(issue.id, { stateId });

  const merged = details?.mergedPrNumbers?.filter((n) => Number.isFinite(n)) ?? [];
  if (merged.length === 0) return;

  const repo = getGithubRepo();
  const lines = [
    "SAG orchestrator completed after merge.",
    ...merged.map((n) => `- PR #${n}: https://github.com/${repo}/pull/${n}`),
  ];
  await client.createComment({ issueId: issue.id, body: lines.join("\n") });
}

export async function createLinearIssue(title: string, description: string, kind: DevTriggerKind): Promise<LinearIssueRef> {
  const client = getClient();
  const teamId = await resolveLinearTeamId();
  const projectId = await resolveLinearProjectId();
  const labelIds = await resolveIssueLabelIds(kind, teamId);
  const payload = await client.createIssue({
    teamId,
    title: title.slice(0, 240),
    description,
    ...(projectId ? { projectId } : {}),
    ...(labelIds.length > 0 ? { labelIds } : {}),
  });
  const issue = await payload.issue;
  if (!issue?.id || !issue.identifier || !issue.url) {
    throw new Error("Linear issue creation returned an incomplete payload.");
  }
  return { id: issue.id, identifier: issue.identifier, url: issue.url, title: issue.title };
}

export async function pingLinear(): Promise<LinearWorkspaceInfo> {
  const client = getClient();
  const teamId = await resolveLinearTeamId();
  const viewer = await client.viewer;
  const team = (await client.teams()).nodes.find((entry) => entry.id === teamId);
  const foundLabels: string[] = [];
  for (const name of ORCHESTRATOR_LABELS) {
    if (await resolveLabelId(name, teamId)) foundLabels.push(name);
  }
  return {
    teamKey: getLinearTeamKey() ?? "",
    teamId,
    teamName: team?.name,
    projectName: getLinearProjectName(),
    projectId: await resolveLinearProjectId(),
    viewer: viewer?.name ?? viewer?.email ?? undefined,
    orchestratorLabels: foundLabels,
  };
}
