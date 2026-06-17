import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import { getRepoRoot } from "../assistant/repo-tools.js";

function getProfilePaths(): {
  dataDir: string;
  profileFile: string;
  profileTemplate: string;
  seedMarker: string;
} {
  const root = getRepoRoot();
  return {
    dataDir: path.join(root, "data"),
    profileFile: path.join(root, "data/profile.yaml"),
    profileTemplate: path.join(root, "config/agent-profile.template.yaml"),
    seedMarker: path.join(root, "data/mem0/profile-seed.json"),
  };
}

export interface AgentProfile {
  profileVersion?: number;
  identity?: Record<string, unknown>;
  communication?: Record<string, unknown>;
  work?: Record<string, unknown>;
  preferences?: Record<string, unknown>;
  operating_principles?: string[];
  business_goals?: Record<string, string[]>;
  agent_behavior?: Record<string, unknown>;
  personal_context?: Record<string, unknown>;
}

function asString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  return undefined;
}

function appendScalar(lines: string[], label: string, value: unknown): void {
  const text = asString(value);
  if (text) {
    lines.push(`- ${label}: ${text}`);
  }
}

function appendList(lines: string[], label: string, value: unknown): void {
  if (!Array.isArray(value) || value.length === 0) {
    return;
  }

  lines.push(`- ${label}:`);
  for (const item of value) {
    if (typeof item === "string" && item.trim()) {
      lines.push(`  - ${item.trim()}`);
    }
  }
}

function appendBlock(lines: string[], label: string, value: unknown): void {
  const text = asString(value);
  if (!text) {
    return;
  }

  lines.push(`- ${label}:`);
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed) {
      lines.push(`  ${trimmed}`);
    }
  }
}

async function ensureProfileFile(): Promise<void> {
  const { dataDir, profileFile, profileTemplate } = getProfilePaths();
  await mkdir(dataDir, { recursive: true });
  try {
    await stat(profileFile);
    return;
  } catch {
    // profile.yaml missing — seed from template
  }

  try {
    await stat(profileTemplate);
  } catch {
    throw new Error(`Profile template missing: ${profileTemplate}`);
  }

  await copyFile(profileTemplate, profileFile);
}

function normalizeProfile(parsed: unknown): AgentProfile {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {};
  }
  return parsed as AgentProfile;
}

export async function loadAgentProfile(): Promise<AgentProfile> {
  await ensureProfileFile();
  const { profileFile } = getProfilePaths();

  let raw: string;
  try {
    raw = await readFile(profileFile, "utf8");
  } catch (error) {
    throw new Error(`Could not read profile file: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    return normalizeProfile(parse(raw));
  } catch (error) {
    throw new Error(`Invalid profile YAML: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function formatProfileForPrompt(profile: AgentProfile | null | undefined): string {
  const safeProfile = normalizeProfile(profile);
  const lines: string[] = ["User profile (stable preferences — treat as ground truth):"];
  const identity = safeProfile.identity ?? {};
  const communication = safeProfile.communication ?? {};
  const work = safeProfile.work ?? {};
  const preferences = safeProfile.preferences ?? {};
  const agentBehavior = safeProfile.agent_behavior ?? {};
  const personalContext = safeProfile.personal_context ?? {};

  appendScalar(lines, "Name", identity.name);
  appendScalar(lines, "Role", identity.role);
  appendScalar(lines, "Business", identity.business);
  appendScalar(lines, "Location", identity.location);
  appendScalar(lines, "Timezone", identity.timezone ?? preferences.timezone);

  appendScalar(lines, "Tone", communication.tone);
  appendScalar(lines, "Response length", communication.default_length);
  appendBlock(lines, "Communication style", communication.style_notes);

  appendScalar(lines, "Default project root", work.default_project_root);
  appendScalar(lines, "Agency project root", work.agency_project_root);
  appendList(lines, "Core services", work.core_services);
  appendList(lines, "Active clients", work.active_clients);
  appendList(lines, "Internal products", work.internal_products);

  const techStack = work.tech_stack;
  if (techStack && typeof techStack === "object") {
    for (const [group, items] of Object.entries(techStack as Record<string, unknown>)) {
      appendList(lines, `Tech stack (${group})`, items);
    }
  }

  appendBlock(lines, "Spec structure", work.spec_style);
  appendBlock(lines, "Handoff style", work.handoff_style);

  appendList(lines, "Operating principles", safeProfile.operating_principles);

  if (safeProfile.business_goals && typeof safeProfile.business_goals === "object") {
    for (const [horizon, goals] of Object.entries(safeProfile.business_goals)) {
      appendList(lines, `Business goals (${horizon.replace(/_/g, " ")})`, goals);
    }
  }

  appendScalar(lines, "Agent mode", agentBehavior.default_mode);
  appendList(lines, "Should remember", agentBehavior.should_remember);
  appendList(lines, "Avoid over-focusing on", agentBehavior.should_not_overfocus_on);
  appendBlock(lines, "When user is uncertain", agentBehavior.when_user_is_uncertain);
  appendBlock(lines, "When working on code", agentBehavior.when_working_on_code);
  appendBlock(lines, "When working on business", agentBehavior.when_working_on_business);
  appendBlock(lines, "When working on finances", agentBehavior.when_working_on_finances);

  appendScalar(lines, "Lifestyle", personalContext.lifestyle);
  appendList(lines, "Planning tools", personalContext.planning_tools);
  appendList(lines, "Current focus", personalContext.current_focus);

  if (preferences.confirm_before_file_writes === true) {
    lines.push("- Confirm before file writes: yes");
  }

  if (lines.length === 1) {
    lines.push("- (Profile file exists but is mostly empty — edit data/profile.yaml)");
  }

  return lines.join("\n");
}

export function formatProfileSummary(profile: AgentProfile): string {
  return [
    "Your SAG profile (data/profile.yaml):",
    "",
    formatProfileForPrompt(profile),
    "",
    "Edit data/profile.yaml on your Mac to update. Use /remember for one-off facts Mem0 should retain.",
  ].join("\n");
}

export async function getProfileSeedText(): Promise<string> {
  const profile = await loadAgentProfile();
  return formatProfileForPrompt(profile);
}

export async function getProfileFileMtimeMs(): Promise<number> {
  await ensureProfileFile();
  const { profileFile } = getProfilePaths();
  const fileStat = await stat(profileFile);
  return fileStat.mtimeMs;
}

export async function getProfileSeedState(): Promise<{ mtimeMs: number } | null> {
  const { seedMarker } = getProfilePaths();
  try {
    const raw = await readFile(seedMarker, "utf8");
    return JSON.parse(raw) as { mtimeMs: number };
  } catch {
    return null;
  }
}

export async function markProfileSeeded(mtimeMs: number): Promise<void> {
  const { seedMarker } = getProfilePaths();
  await mkdir(path.dirname(seedMarker), { recursive: true });
  await writeFile(seedMarker, JSON.stringify({ mtimeMs }, null, 2));
}
