/**
 * Bots registry schema for the growing-brain system.
 * 
 * Registry metadata does NOT confer authority or actually connect/change bots.
 * No bot gets connected without lane+loop. Progression: read-only -> draft -> scheduled.
 */

export type BotPlatform = "x-grok" | "telegram" | "claude-muse" | "local";

export type AuthMethod = "pointer-only" | "oauth" | "api-key" | "none";

export interface BotCapabilities {
  canRead: boolean;
  canDraft: boolean;
  canSend: boolean;
  canSpendMoney: boolean;
  canDelete: boolean;
}

export interface BotRegistry {
  bots: Bot[];
  updatedAt: string;
  updatedBy: "z" | "sag";
}

export interface Bot {
  id: string;
  name: string;
  platform: BotPlatform;
  purpose: string;
  lane: string;
  capabilities: BotCapabilities;
  forbiddenActions: string[];
  monthlyCostUsd: number | null;
  authMethod: AuthMethod;
  authPointer?: string;
  reportsTo: "sag" | "devin" | "z";
  status: "proposed" | "configured" | "active" | "paused";
  notes?: string;
}

export const DEFAULT_CAPABILITIES: BotCapabilities = {
  canRead: true,
  canDraft: true,
  canSend: false,
  canSpendMoney: false,
  canDelete: false,
};

export function validateBot(bot: unknown): string[] {
  const errors: string[] = [];

  if (!bot || typeof bot !== "object") {
    errors.push("Bot must be an object");
    return errors;
  }

  const b = bot as Record<string, unknown>;

  if (!b.id || typeof b.id !== "string" || !/^[a-z0-9-]+$/.test(b.id)) {
    errors.push("id must be a lowercase kebab-case string");
  }

  if (!b.name || typeof b.name !== "string") {
    errors.push("name is required");
  }

  if (!["x-grok", "telegram", "claude-muse", "local"].includes(b.platform as string)) {
    errors.push("platform must be x-grok|telegram|claude-muse|local");
  }

  if (!b.purpose || typeof b.purpose !== "string") {
    errors.push("purpose is required");
  }

  if (!b.lane || typeof b.lane !== "string") {
    errors.push("lane is required");
  }

  if (!["pointer-only", "oauth", "api-key", "none"].includes(b.authMethod as string)) {
    errors.push("authMethod must be pointer-only|oauth|api-key|none");
  }

  if (!["sag", "devin", "z"].includes(b.reportsTo as string)) {
    errors.push("reportsTo must be sag|devin|z");
  }

  if (!["proposed", "configured", "active", "paused"].includes(b.status as string)) {
    errors.push("status must be proposed|configured|active|paused");
  }

  if (b.monthlyCostUsd !== null && typeof b.monthlyCostUsd !== "number") {
    errors.push("monthlyCostUsd must be a number or null");
  }

  return errors;
}
