import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";

const DATA_DIR = path.resolve(process.cwd(), "data");
const PROFILE_FILE = path.join(DATA_DIR, "profile.yaml");
const PROFILE_TEMPLATE = path.resolve(process.cwd(), "config/agent-profile.template.yaml");

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
  await mkdir(DATA_DIR, { recursive: true });
  try {
    await stat(PROFILE_FILE);
  } catch {
    await copyFile(PROFILE_TEMPLATE, PROFILE_FILE);
  }
}

export async function loadAgentProfile(): Promise<AgentProfile> {
  await ensureProfileFile();
  const raw = await readFile(PROFILE_FILE, "utf8");
  return parse(raw) as AgentProfile;
}

export function formatProfileForPrompt(profile: AgentProfile): string {
  const lines: string[] = ["User profile (stable preferences — treat as ground truth):"];
  const identity = profile.identity ?? {};
  const communication = profile.communication ?? {};
  const work = profile.work ?? {};
  const preferences = profile.preferences ?? {};
  const agentBehavior = profile.agent_behavior ?? {};
  const personalContext = profile.personal_context ?? {};

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

  appendList(lines, "Operating principles", profile.operating_principles);

  if (profile.business_goals && typeof profile.business_goals === "object") {
    for (const [horizon, goals] of Object.entries(profile.business_goals)) {
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
  const fileStat = await stat(PROFILE_FILE);
  return fileStat.mtimeMs;
}

const SEED_MARKER = path.join(DATA_DIR, "mem0", "profile-seed.json");

export async function getProfileSeedState(): Promise<{ mtimeMs: number } | null> {
  try {
    const raw = await readFile(SEED_MARKER, "utf8");
    return JSON.parse(raw) as { mtimeMs: number };
  } catch {
    return null;
  }
}

export async function markProfileSeeded(mtimeMs: number): Promise<void> {
  await mkdir(path.dirname(SEED_MARKER), { recursive: true });
  await writeFile(SEED_MARKER, JSON.stringify({ mtimeMs }, null, 2));
}
