import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import { findTreeNode } from "./skill-tree.js";

export interface SkillGoal {
  nodeId: string;
  title: string;
  proposedSkillId: string | null;
  priority: "low" | "medium" | "high";
  summary: string;
  acceptance: string[];
}

interface SkillGoalsFile {
  goals?: SkillGoal[];
}

const GOALS_PATH = path.resolve(process.cwd(), "config/skill-goals.yaml");

let cachedGoals: SkillGoal[] | null = null;

export async function loadSkillGoals(): Promise<SkillGoal[]> {
  if (cachedGoals) {
    return cachedGoals;
  }

  try {
    const raw = await readFile(GOALS_PATH, "utf8");
    const parsed = parse(raw) as SkillGoalsFile;
    cachedGoals = (parsed.goals ?? []).filter((goal) => goal.nodeId && goal.title);
    return cachedGoals;
  } catch {
    cachedGoals = [];
    return [];
  }
}

export async function getSkillGoalForNode(nodeId: string): Promise<SkillGoal | null> {
  const goals = await loadSkillGoals();
  return goals.find((goal) => goal.nodeId === nodeId) ?? null;
}

export function buildSkillGoalDevTask(goal: SkillGoal): string {
  const found = findTreeNode(goal.nodeId);
  const branchName = found?.branch.name ?? "Unknown";
  const nodeLabel = found?.def.label ?? goal.title;

  const skillLine = goal.proposedSkillId
    ? `Proposed skill id: ${goal.proposedSkillId}`
    : "No new skill yaml required — implement as extension to existing modules if appropriate.";

  return [
    `Implement planned skill-tree perk: ${nodeLabel} (${branchName} branch).`,
    "",
    goal.summary,
    "",
    skillLine,
    "",
    "Acceptance criteria:",
    ...goal.acceptance.map((item) => `- ${item}`),
    "",
    "Skill scaffold checklist:",
    "- config/skills/<id>.yaml (if new skill)",
    "- src/skills/<id>/index.ts + register in src/core/registry.ts",
    `- Update src/core/house/skill-tree.ts node skillId for ${goal.nodeId}`,
    "- Update src/core/house/skill-meta.ts if needed",
    "- npm run build && house npm run build if house/ touched",
    "- Open PR targeting main; merge when checks pass.",
  ].join("\n");
}
