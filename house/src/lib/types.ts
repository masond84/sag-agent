export type HouseEventKind = "speech" | "activity" | "status" | "connected";

export interface HouseEvent {
  id: string;
  at: string;
  kind: HouseEventKind;
  text?: string;
  speech?: string;
  meta?: Record<string, string | number | boolean>;
}

export interface SkillTreeNode {
  id: string;
  label: string;
  x: number;
  y: number;
  unlocked: boolean;
  skillId?: string;
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

export interface ActivityEvent {
  at: string;
  type: string;
  summary: string;
  meta?: Record<string, string | number | boolean>;
}

export type FaceState = "idle" | "listening" | "speaking" | "thinking";

export const BRANCH_THEMES: Record<
  SkillTreeBranch["theme"],
  { from: string; via: string; to: string; accent: string }
> = {
  warm: { from: "#3d1a08", via: "#8a3a12", to: "#d4742a", accent: "#ffb86a" },
  cool: { from: "#0a1a3d", via: "#1a4a8a", to: "#3a7ad4", accent: "#7eb8ff" },
  teal: { from: "#0a2a2a", via: "#1a6a6a", to: "#2a9a9a", accent: "#6ee7d8" },
  green: { from: "#0a2a14", via: "#1a6a32", to: "#3a9a52", accent: "#8ee7a0" },
  purple: { from: "#1a0a3d", via: "#4a1a8a", to: "#7a3ad4", accent: "#c8a0ff" },
};
