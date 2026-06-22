import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ActivityEvent } from "../activity-log.js";
import { getRecentActivity } from "../activity-log.js";
import { getSkillDescription } from "../skill-catalog.js";
import type { SkillSummary } from "../../types.js";
import { listAllSkillConfigs } from "./skill-config.js";
import { getSkillMeta } from "./skill-meta.js";
import {
  findTreeNode,
  getDescendantNodes,
  getNodesForSkill,
  type TreeNodeRef,
} from "./skill-tree.js";

const execFileAsync = promisify(execFile);

export interface SkillNodeDetail {
  nodeId: string;
  label: string;
  description: string;
  status: "unlocked" | "locked" | "planned";
  branchId: string;
  branchName: string;
  skillId?: string;
  skillName?: string;
  skillKind?: string;
  configurable: boolean;
  enabled?: boolean;
  configPath?: string;
  implementationPath?: string;
  activityTypes: string[];
  recentActivity: ActivityEvent[];
  telegramCommands: string[];
  relatedNodes: TreeNodeRef[];
  disableImpact?: DisableImpact;
}

export interface DisableImpact {
  affectedNodes: TreeNodeRef[];
  relatedEnabledSkills: Array<{ id: string; name: string }>;
  warnings: string[];
  critical: boolean;
}

export async function buildSkillNodeDetail(
  nodeId: string,
  activeSkills: SkillSummary[],
): Promise<SkillNodeDetail | null> {
  const found = findTreeNode(nodeId);
  if (!found) {
    return null;
  }

  const { branch, def } = found;
  const activeById = new Map(activeSkills.map((skill) => [skill.id, skill]));
  const skill = def.skillId ? activeById.get(def.skillId) : undefined;
  const allConfigs = await listAllSkillConfigs();
  const config = def.skillId ? allConfigs.find((entry) => entry.id === def.skillId) : undefined;
  const meta = def.skillId ? getSkillMeta(def.skillId) : undefined;

  const activityTypes = meta?.activityTypes ?? [];
  const recentActivity = await getRecentActivity({
    limit: 8,
    sinceHours: 168,
    types: activityTypes.length > 0 ? activityTypes : undefined,
  });

  const filteredActivity =
    activityTypes.length > 0
      ? recentActivity
      : await filterActivityBySkillMeta(recentActivity, def.skillId);

  const status = resolveDetailStatus(def, config, activeById);
  const relatedNodes = def.skillId ? getNodesForSkill(def.skillId) : [];

  const detail: SkillNodeDetail = {
    nodeId: def.id,
    label: def.label,
    description: def.skillId
      ? (getSkillDescription(def.skillId) ?? def.description)
      : def.description,
    status,
    branchId: branch.id,
    branchName: branch.name,
    skillId: def.skillId ?? undefined,
    skillName: config?.name ?? skill?.name,
    skillKind: config?.kind ?? skill?.kind,
    configurable: Boolean(def.skillId && config),
    enabled: config?.enabled,
    configPath: config?.configPath,
    implementationPath: meta?.implementationPath,
    activityTypes: activityTypes.map(String),
    recentActivity: filteredActivity.slice(-8).reverse(),
    telegramCommands: meta?.telegramCommands ?? [],
    relatedNodes: relatedNodes.filter((node) => node.nodeId !== def.id),
  };

  if (def.skillId && config?.enabled) {
    detail.disableImpact = analyzeDisableImpact(def.skillId, allConfigs);
  }

  return detail;
}

function resolveDetailStatus(
  def: { skillId?: string | null; alwaysUnlocked?: boolean },
  config: { enabled: boolean } | undefined,
  activeById: Map<string, SkillSummary>,
): SkillNodeDetail["status"] {
  if (!def.skillId) {
    return "planned";
  }
  if (config?.enabled && activeById.has(def.skillId)) {
    return "unlocked";
  }
  if (config && !config.enabled) {
    return "locked";
  }
  return "planned";
}

async function filterActivityBySkillMeta(
  events: ActivityEvent[],
  skillId?: string | null,
): Promise<ActivityEvent[]> {
  if (!skillId) {
    return [];
  }
  return events.filter((event) => event.meta?.skill === skillId);
}

export function analyzeDisableImpact(
  skillId: string,
  allConfigs: Awaited<ReturnType<typeof listAllSkillConfigs>>,
): DisableImpact {
  const meta = getSkillMeta(skillId);
  const anchorNodes = getNodesForSkill(skillId);
  const affectedMap = new Map<string, TreeNodeRef>();

  for (const anchor of anchorNodes) {
    for (const descendant of getDescendantNodes(anchor.nodeId)) {
      affectedMap.set(descendant.nodeId, descendant);
    }
  }

  const affectedNodes = [...affectedMap.values()];
  const relatedSkillIds = new Set(
    affectedNodes.map((node) => node.skillId).filter((id): id is string => Boolean(id)),
  );
  relatedSkillIds.delete(skillId);

  const relatedEnabledSkills = allConfigs
    .filter((config) => relatedSkillIds.has(config.id) && config.enabled)
    .map((config) => ({ id: config.id, name: config.name }));

  const warnings: string[] = [];

  if (meta?.critical) {
    warnings.push("This is a core skill — disabling it stops Telegram chat for SAG.");
  }

  if (affectedNodes.length > 0) {
    const labels = affectedNodes.map((node) => `${node.label} (${node.branchName})`).join(", ");
    warnings.push(`Tree perks that depend on this skill will go inactive: ${labels}.`);
  }

  for (const related of relatedEnabledSkills) {
    warnings.push(
      `${related.name} stays enabled in config but may show as inactive in the tree until prerequisites return.`,
    );
  }

  if (skillId === "focus-companion") {
    warnings.push("Life texts and focus check-ins stop. Morning briefing can still run if enabled separately.");
  }

  if (skillId === "heartbeat") {
    warnings.push("Worker recovery alerts and daily heartbeat reports stop.");
  }

  return {
    affectedNodes,
    relatedEnabledSkills,
    warnings,
    critical: Boolean(meta?.critical),
  };
}

export interface ToggleSkillResult {
  ok: boolean;
  skillId: string;
  enabled: boolean;
  configPath: string;
  restart: { attempted: boolean; success: boolean; message: string };
  disableImpact?: DisableImpact;
}

export async function toggleSkillEnabled(
  skillId: string,
  enabled: boolean,
): Promise<ToggleSkillResult> {
  const { setSkillEnabled } = await import("./skill-config.js");
  const record = await setSkillEnabled(skillId, enabled);
  const allConfigs = await listAllSkillConfigs();
  const restart = await tryRestartWorker();

  return {
    ok: true,
    skillId,
    enabled: record.enabled,
    configPath: record.configPath,
    restart,
    disableImpact: enabled ? undefined : analyzeDisableImpact(skillId, allConfigs),
  };
}

async function tryRestartWorker(): Promise<{ attempted: boolean; success: boolean; message: string }> {
  const label = process.env.LAUNCHD_LABEL?.trim() || "com.masond84.sag-agent";
  const uid = process.getuid?.() ?? 501;

  try {
    await execFileAsync("launchctl", ["print", `gui/${uid}/${label}`]);
  } catch {
    return {
      attempted: false,
      success: false,
      message: "Worker not managed by launchd — restart npm run dev or launchctl manually to apply.",
    };
  }

  try {
    await execFileAsync("launchctl", ["kickstart", "-k", `gui/${uid}/${label}`]);
    return {
      attempted: true,
      success: true,
      message: "Worker restarted via launchd.",
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      attempted: true,
      success: false,
      message: `launchctl restart failed: ${detail}`,
    };
  }
}

export async function getSkillNodeDetailBySkillId(
  skillId: string,
  activeSkills: SkillSummary[],
): Promise<SkillNodeDetail | null> {
  const nodes = getNodesForSkill(skillId);
  if (nodes.length === 0) {
    return null;
  }
  return buildSkillNodeDetail(nodes[0]!.nodeId, activeSkills);
}
