export type HouseEventKind = "speech" | "activity" | "status" | "connected";

export interface HouseEvent {
  id: string;
  at: string;
  kind: HouseEventKind;
  text?: string;
  speech?: string;
  meta?: Record<string, string | number | boolean>;
}

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

export interface WorkerHealth {
  ok: boolean;
  at: string;
  dryRun: boolean;
  gmailConfigured: boolean;
  telegramConfigured: boolean;
  skills: Array<{ id: string; name: string; kind: string }>;
}

export interface SkillNodeDetail {
  nodeId: string;
  label: string;
  description: string;
  status: SkillNodeStatus;
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
  relatedNodes: Array<{
    nodeId: string;
    label: string;
    branchId: string;
    branchName: string;
    skillId?: string;
  }>;
  disableImpact?: {
    affectedNodes: Array<{
      nodeId: string;
      label: string;
      branchId: string;
      branchName: string;
      skillId?: string;
    }>;
    relatedEnabledSkills: Array<{ id: string; name: string }>;
    warnings: string[];
    critical: boolean;
  };
}

export interface ToggleSkillResult {
  ok: boolean;
  skillId: string;
  enabled: boolean;
  configPath: string;
  restart: { attempted: boolean; success: boolean; message: string };
  disableImpact?: SkillNodeDetail["disableImpact"];
}

export interface ActivityEvent {
  at: string;
  type: string;
  summary: string;
  meta?: Record<string, string | number | boolean>;
}

export type FaceState = "idle" | "listening" | "speaking" | "thinking";

/** Monochrome accent palette — subtle blue-grey shifts per branch */
export const BRANCH_THEMES: Record<
  SkillTreeBranch["theme"],
  { accent: string; accentDim: string; progress: string }
> = {
  warm: { accent: "#a8b0c0", accentDim: "#6b7280", progress: "#9aa8be" },
  cool: { accent: "#9aa8be", accentDim: "#64748b", progress: "#8b9cb3" },
  teal: { accent: "#94a3b8", accentDim: "#64748b", progress: "#7d8fa8" },
  green: { accent: "#9ca3af", accentDim: "#6b7280", progress: "#8b95a8" },
  purple: { accent: "#a1a9b8", accentDim: "#6b7280", progress: "#9aa8be" },
};

export const UI_ACCENT = "#9aa8be";
export const UI_ACCENT_BRIGHT = "#c8d0de";
