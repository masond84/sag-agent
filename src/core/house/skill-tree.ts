import type { SkillSummary } from "../../types.js";

export interface SkillTreeNode {
  id: string;
  label: string;
  x: number;
  y: number;
  unlocked: boolean;
  skillId?: string | null;
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
      { id: "comp-root", label: "Presence", x: 50, y: 88, requires: [], alwaysUnlocked: true },
      { id: "comp-focus", label: "Focus", x: 35, y: 62, requires: ["comp-root"], skillId: "focus-companion" },
      { id: "comp-life", label: "Life Texts", x: 65, y: 58, requires: ["comp-root"], skillId: "focus-companion" },
      { id: "comp-morning", label: "Morning", x: 50, y: 38, requires: ["comp-focus"], skillId: "morning-briefing" },
      { id: "comp-voice", label: "Voice", x: 28, y: 28, requires: ["comp-life"], skillId: null },
    ],
  },
  {
    id: "memory",
    name: "Memory",
    theme: "cool",
    nodes: [
      { id: "mem-root", label: "Recall", x: 50, y: 88, requires: [], alwaysUnlocked: true },
      { id: "mem-user", label: "User Mem", x: 30, y: 65, requires: ["mem-root"], skillId: "telegram-commands" },
      { id: "mem-agent", label: "Diary", x: 70, y: 65, requires: ["mem-root"], skillId: "reflection" },
      { id: "mem-activity", label: "Timeline", x: 50, y: 42, requires: ["mem-user", "mem-agent"], skillId: "reflection" },
      { id: "mem-persona", label: "Persona", x: 50, y: 18, requires: ["mem-activity"], skillId: null },
    ],
  },
  {
    id: "communication",
    name: "Dialogue",
    theme: "teal",
    nodes: [
      { id: "com-root", label: "Chat", x: 50, y: 88, requires: [], skillId: "telegram-commands" },
      { id: "com-tools", label: "Tools", x: 32, y: 60, requires: ["com-root"], skillId: "telegram-commands" },
      { id: "com-voice-hw", label: "Read Aloud", x: 68, y: 55, requires: ["com-root"], skillId: null },
      { id: "com-house", label: "House UI", x: 50, y: 30, requires: ["com-tools"], alwaysUnlocked: true },
    ],
  },
  {
    id: "monitoring",
    name: "Watch",
    theme: "green",
    nodes: [
      { id: "mon-root", label: "Pulse", x: 50, y: 88, requires: [], skillId: "heartbeat" },
      { id: "mon-gmail", label: "Gmail", x: 28, y: 62, requires: ["mon-root"], skillId: null },
      { id: "mon-bills", label: "Bills", x: 72, y: 58, requires: ["mon-gmail"], skillId: "conservice-statement" },
      { id: "mon-health", label: "Audit", x: 50, y: 35, requires: ["mon-root"], skillId: "heartbeat" },
    ],
  },
  {
    id: "evolution",
    name: "Evolution",
    theme: "purple",
    nodes: [
      { id: "evo-root", label: "Audit", x: 50, y: 88, requires: [], skillId: "dev-runner" },
      { id: "evo-linear", label: "Linear", x: 30, y: 58, requires: ["evo-root"], skillId: "dev-runner" },
      { id: "evo-cloud", label: "Cloud Dev", x: 70, y: 54, requires: ["evo-linear"], skillId: "dev-runner" },
      { id: "evo-merge", label: "Auto Merge", x: 50, y: 28, requires: ["evo-cloud"], skillId: "dev-runner" },
    ],
  },
];

export function buildSkillTreePayload(skills: SkillSummary[]): SkillTreePayload {
  const enabled = new Set(skills.map((skill) => skill.id));

  const branches = BRANCH_DEFS.map((branch) => {
    const nodes: SkillTreeNode[] = branch.nodes.map((node) => ({
      id: node.id,
      label: node.label,
      x: node.x,
      y: node.y,
      skillId: node.skillId ?? undefined,
      unlocked: Boolean(
        node.alwaysUnlocked || (node.skillId ? enabled.has(node.skillId) : false),
      ),
    }));

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
