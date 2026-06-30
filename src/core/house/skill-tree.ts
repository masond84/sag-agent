import { getSkillDescription } from "../skill-catalog.js";
import type { SkillSummary } from "../../types.js";

export type SkillNodeStatus = "unlocked" | "locked" | "planned";

export interface SkillTreeNode {
  id: string;
  label: string;
  x: number;
  y: number;
  unlocked: boolean;
  status: SkillNodeStatus;
  description: string;
  skillId?: string;
  skillName?: string;
  skillKind?: string;
}

export interface SkillTreeBranch {
  id: string;
  name: string;
  theme: "warm" | "cool" | "teal" | "green" | "purple";
  level: number;
  xp: number;
  xpMax: number;
  perksUnlocked: number;
  perksTotal: number;
  nodes: SkillTreeNode[];
  edges: Array<[string, string]>;
}

export interface SkillTreePayload {
  generatedAt: string;
  branches: SkillTreeBranch[];
}

interface BranchDef {
  id: string;
  name: string;
  theme: SkillTreeBranch["theme"];
  nodes: Array<{
    id: string;
    label: string;
    description: string;
    x: number;
    y: number;
    requires: string[];
    skillId?: string | null;
    alwaysUnlocked?: boolean;
  }>;
}

const BRANCH_DEFS: BranchDef[] = [
  {
    id: "companion",
    name: "Companion",
    theme: "warm",
    nodes: [
      {
        id: "comp-root",
        label: "Presence",
        description: "Baseline companion mode — SAG checks in and chats like a co-conspirator, not a help desk.",
        x: 50,
        y: 88,
        requires: [],
        alwaysUnlocked: true,
      },
      {
        id: "comp-focus",
        label: "Focus",
        description: "Work focus check-ins at anchor hours (configurable, default 8am/1pm/9pm) tied to your daily goal.",
        x: 35,
        y: 62,
        requires: ["comp-root"],
        skillId: "focus-companion",
      },
      {
        id: "comp-life",
        label: "Life Texts",
        description: "Random personal check-ins throughout the day (up to 5/day, 8am-10pm window).",
        x: 65,
        y: 58,
        requires: ["comp-root"],
        skillId: "focus-companion",
      },
      {
        id: "comp-morning",
        label: "Morning",
        description: "Daily morning briefing at a configured time to start the day.",
        x: 50,
        y: 38,
        requires: ["comp-focus"],
        skillId: "morning-briefing",
      },
      {
        id: "comp-voice",
        label: "Voice TTS",
        description: "Text-to-speech for House UI presence shell and future voice hardware integration.",
        x: 28,
        y: 28,
        requires: ["comp-morning"],
        skillId: null,
      },
    ],
  },
  {
    id: "memory",
    name: "Memory",
    theme: "cool",
    nodes: [
      {
        id: "mem-root",
        label: "Recall",
        description: "Ground-truth activity log — what SAG actually did, when.",
        x: 50,
        y: 88,
        requires: [],
        alwaysUnlocked: true,
      },
      {
        id: "mem-user",
        label: "User Mem",
        description: "Mem0 memories about you — preferences, facts, relationships. Use /remember to add, /memories to view.",
        x: 30,
        y: 65,
        requires: ["mem-root"],
        skillId: "telegram-commands",
      },
      {
        id: "mem-agent",
        label: "Diary",
        description: "SAG's Mem0 diary — distills activity log into agent memories (runs at 1pm and 9pm).",
        x: 70,
        y: 65,
        requires: ["mem-root"],
        skillId: "reflection",
      },
      {
        id: "mem-activity",
        label: "Timeline",
        description: "Activity log tracking polls, check-ins, and dev cycles. View recent events in House feed.",
        x: 50,
        y: 42,
        requires: ["mem-user", "mem-agent"],
        skillId: "reflection",
      },
      {
        id: "mem-persona",
        label: "Persona",
        description: "Co-created personality over time — tone, opinions, and who SAG is becoming.",
        x: 50,
        y: 18,
        requires: ["mem-activity"],
        skillId: null,
      },
    ],
  },
  {
    id: "communication",
    name: "Dialogue",
    theme: "teal",
    nodes: [
      {
        id: "com-root",
        label: "Chat",
        description: "Telegram chat — natural language, slash commands, and assistant tools.",
        x: 50,
        y: 88,
        requires: [],
        skillId: "telegram-commands",
      },
      {
        id: "com-tools",
        label: "Tools",
        description: "Assistant tools: bills, focus, status, memories, activity, MCP connectors (Gmail search, etc).",
        x: 32,
        y: 60,
        requires: ["com-root"],
        skillId: "telegram-commands",
      },
      {
        id: "com-mcp",
        label: "MCP",
        description: "Model Context Protocol connectors for external tools (Gmail, GitHub, etc).",
        x: 68,
        y: 55,
        requires: ["com-root"],
        skillId: null,
      },
      {
        id: "com-house",
        label: "House UI",
        description: "This web home — skill tree, live feed, and Tier 1 presence shell.",
        x: 50,
        y: 30,
        requires: ["com-tools"],
        alwaysUnlocked: true,
      },
    ],
  },
  {
    id: "monitoring",
    name: "Watch",
    theme: "green",
    nodes: [
      {
        id: "mon-root",
        label: "Pulse",
        description: "Daily heartbeat (every 24h) — SAG reports online status and recovers gracefully after downtime.",
        x: 50,
        y: 88,
        requires: [],
        skillId: "heartbeat",
      },
      {
        id: "mon-gmail",
        label: "Gmail",
        description: "OAuth Gmail polling (every 10 min) — enables email-triggered skills like bills.",
        x: 28,
        y: 62,
        requires: ["mon-root"],
        skillId: "gmail-poll",
      },
      {
        id: "mon-bills",
        label: "Bills",
        description: "Watches for Conservice utility statements via Gmail. Parses charges and texts summary.",
        x: 72,
        y: 58,
        requires: ["mon-gmail"],
        skillId: "conservice-statement",
      },
      {
        id: "mon-health",
        label: "Status",
        description: "Health check via /status — shows Gmail, Telegram, Mem0, MCP status and skill counts.",
        x: 50,
        y: 35,
        requires: ["mon-root"],
        skillId: "heartbeat",
      },
    ],
  },
  {
    id: "evolution",
    name: "Evolution",
    theme: "purple",
    nodes: [
      {
        id: "evo-root",
        label: "Cadence",
        description: "Scheduled capability audit (every 6h) — finds small, high-value improvements to existing features.",
        x: 50,
        y: 88,
        requires: [],
        skillId: "dev-runner",
      },
      {
        id: "evo-linear",
        label: "Linear",
        description: "Work tracked as Linear issues in SAG workspace with scope, acceptance criteria, and labels.",
        x: 30,
        y: 58,
        requires: ["evo-root"],
        skillId: "dev-runner",
      },
      {
        id: "evo-cloud",
        label: "Cursor",
        description: "Cursor Cloud agents implement changes on feature branches with full repo context.",
        x: 70,
        y: 54,
        requires: ["evo-linear"],
        skillId: "dev-runner",
      },
      {
        id: "evo-merge",
        label: "Auto-merge",
        description: "PRs auto-merge when checks pass. Worker pulls latest main on next cycle and restarts.",
        x: 50,
        y: 28,
        requires: ["evo-cloud"],
        skillId: "dev-runner",
      },
    ],
  },
];

export interface TreeNodeRef {
  nodeId: string;
  label: string;
  branchId: string;
  branchName: string;
  skillId?: string;
}

export function findTreeNode(nodeId: string): {
  branch: BranchDef;
  def: BranchDef["nodes"][number];
} | null {
  for (const branch of BRANCH_DEFS) {
    const def = branch.nodes.find((node) => node.id === nodeId);
    if (def) {
      return { branch, def };
    }
  }
  return null;
}

export function getNodesForSkill(skillId: string): TreeNodeRef[] {
  const refs: TreeNodeRef[] = [];
  for (const branch of BRANCH_DEFS) {
    for (const node of branch.nodes) {
      if (node.skillId === skillId) {
        refs.push({
          nodeId: node.id,
          label: node.label,
          branchId: branch.id,
          branchName: branch.name,
          skillId,
        });
      }
    }
  }
  return refs;
}

export function getDescendantNodes(nodeId: string): TreeNodeRef[] {
  const found = findTreeNode(nodeId);
  if (!found) {
    return [];
  }

  const descendants: TreeNodeRef[] = [];
  const queue = [nodeId];
  const seen = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (seen.has(current)) {
      continue;
    }
    seen.add(current);

    for (const branch of BRANCH_DEFS) {
      for (const node of branch.nodes) {
        if (node.requires.includes(current) && node.id !== nodeId) {
          descendants.push({
            nodeId: node.id,
            label: node.label,
            branchId: branch.id,
            branchName: branch.name,
            skillId: node.skillId ?? undefined,
          });
          queue.push(node.id);
        }
      }
    }
  }

  return descendants;
}

function isNodeEffectivelyUnlocked(
  branch: BranchDef,
  nodeId: string,
  enabled: Set<string>,
  cache: Map<string, boolean>,
): boolean {
  const cached = cache.get(nodeId);
  if (cached !== undefined) {
    return cached;
  }

  const def = branch.nodes.find((node) => node.id === nodeId);
  if (!def) {
    cache.set(nodeId, false);
    return false;
  }

  let result = false;
  if (def.alwaysUnlocked) {
    result = true;
  } else if (def.skillId && enabled.has(def.skillId)) {
    result = def.requires.every((req) => isNodeEffectivelyUnlocked(branch, req, enabled, cache));
  }

  cache.set(nodeId, result);
  return result;
}

function resolveNodeStatus(
  def: BranchDef["nodes"][number],
  enabled: Set<string>,
  skillById: Map<string, SkillSummary>,
): { unlocked: boolean; status: SkillNodeStatus } {
  if (def.alwaysUnlocked) {
    return { unlocked: true, status: "unlocked" };
  }

  if (!def.skillId) {
    return { unlocked: false, status: "planned" };
  }

  if (enabled.has(def.skillId)) {
    return { unlocked: true, status: "unlocked" };
  }

  if (skillById.has(def.skillId)) {
    return { unlocked: false, status: "locked" };
  }

  return { unlocked: false, status: "planned" };
}

function resolveNodeDescription(def: BranchDef["nodes"][number], skill?: SkillSummary): string {
  if (def.skillId) {
    return getSkillDescription(def.skillId) ?? def.description;
  }
  return def.description;
}

export function buildSkillTreePayload(skills: SkillSummary[]): SkillTreePayload {
  const enabled = new Set(skills.map((skill) => skill.id));
  const skillById = new Map(skills.map((skill) => [skill.id, skill]));

  const branches = BRANCH_DEFS.map((branch) => {
    const unlockCache = new Map<string, boolean>();
    const nodes: SkillTreeNode[] = branch.nodes.map((def) => {
      const skill = def.skillId ? skillById.get(def.skillId) : undefined;
      const effectivelyUnlocked = isNodeEffectivelyUnlocked(branch, def.id, enabled, unlockCache);
      const { status: baseStatus } = resolveNodeStatus(def, enabled, skillById);

      let status = baseStatus;
      if (def.skillId && enabled.has(def.skillId) && !effectivelyUnlocked && !def.alwaysUnlocked) {
        status = "locked";
      }

      return {
        id: def.id,
        label: def.label,
        x: def.x,
        y: def.y,
        unlocked: effectivelyUnlocked || Boolean(def.alwaysUnlocked),
        status,
        description: resolveNodeDescription(def, skill),
        skillId: def.skillId ?? undefined,
        skillName: skill?.name,
        skillKind: skill?.kind,
      };
    });

    const edges: Array<[string, string]> = [];
    for (const node of branch.nodes) {
      for (const req of node.requires) {
        edges.push([req, node.id]);
      }
    }

    const unlockedCount = nodes.filter((node) => node.unlocked).length;

    return {
      id: branch.id,
      name: branch.name,
      theme: branch.theme,
      level: Math.min(100, 20 + unlockedCount * 16),
      xp: unlockedCount,
      xpMax: nodes.length,
      perksUnlocked: unlockedCount,
      perksTotal: nodes.length,
      nodes,
      edges,
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    branches,
  };
}
