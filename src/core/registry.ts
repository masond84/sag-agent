import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import type {
  EmailSkill,
  EmailSkillConfig,
  InteractiveSkill,
  InteractiveSkillConfig,
  LoadedSkills,
  ScheduledSkill,
  ScheduledSkillConfig,
  SkillConfig,
  SkillSummary,
} from "../types.js";
import { isInteractiveSkillConfig, isScheduledSkillConfig } from "../types.js";
import { conserviceSkill } from "../skills/conservice/index.js";
import { devRunnerSkill } from "../skills/dev-runner/index.js";
import { heartbeatSkill } from "../skills/heartbeat/index.js";
import { morningSkill } from "../skills/morning/index.js";
import { focusCompanionSkill } from "../skills/focus/index.js";
import { reflectionSkill } from "../skills/reflection/index.js";
import { commandsSkill } from "../skills/commands/index.js";

const CONFIG_DIR = path.resolve(process.cwd(), "config/skills");

const emailSkillFactories: Record<string, () => EmailSkill> = {
  "conservice-statement": () => conserviceSkill,
};

const scheduledSkillFactories: Record<string, () => ScheduledSkill> = {
  heartbeat: () => heartbeatSkill,
  "dev-runner": () => devRunnerSkill,
  "morning-briefing": () => morningSkill,
  "focus-companion": () => focusCompanionSkill,
  reflection: () => reflectionSkill,
};

const interactiveSkillFactories: Record<string, () => InteractiveSkill> = {
  "telegram-commands": () => commandsSkill,
};

function buildEmailSkill(config: EmailSkillConfig): EmailSkill {
  const factory = emailSkillFactories[config.id];
  if (!factory) {
    throw new Error(`No email skill implementation registered for id: ${config.id}`);
  }

  return {
    ...factory(),
    config,
  };
}

function buildScheduledSkill(config: ScheduledSkillConfig): ScheduledSkill {
  const factory = scheduledSkillFactories[config.id];
  if (!factory) {
    throw new Error(`No scheduled skill implementation registered for id: ${config.id}`);
  }

  return {
    ...factory(),
    config,
  };
}

function buildInteractiveSkill(config: InteractiveSkillConfig): InteractiveSkill {
  const factory = interactiveSkillFactories[config.id];
  if (!factory) {
    throw new Error(`No interactive skill implementation registered for id: ${config.id}`);
  }

  return {
    ...factory(),
    config,
  };
}

export async function loadSkills(): Promise<LoadedSkills> {
  const files = await readdir(CONFIG_DIR);
  const yamlFiles = files.filter((file) => file.endsWith(".yaml") || file.endsWith(".yml"));

  const email: EmailSkill[] = [];
  const scheduled: ScheduledSkill[] = [];
  const interactive: InteractiveSkill[] = [];

  for (const file of yamlFiles) {
    const raw = await readFile(path.join(CONFIG_DIR, file), "utf8");
    const config = parse(raw) as SkillConfig;

    if (!config.enabled) {
      continue;
    }

    if (isScheduledSkillConfig(config)) {
      scheduled.push(buildScheduledSkill(config));
      continue;
    }

    if (isInteractiveSkillConfig(config)) {
      interactive.push(buildInteractiveSkill(config));
      continue;
    }

    email.push(buildEmailSkill(config as EmailSkillConfig));
  }

  return { email, scheduled, interactive };
}

export function summarizeSkills(skills: LoadedSkills): SkillSummary[] {
  return [
    ...skills.email.map((skill) => ({
      id: skill.config.id,
      name: skill.config.name,
      kind: "email" as const,
    })),
    ...skills.scheduled.map((skill) => ({
      id: skill.config.id,
      name: skill.config.name,
      kind: "scheduled" as const,
    })),
    ...skills.interactive.map((skill) => ({
      id: skill.config.id,
      name: skill.config.name,
      kind: "interactive" as const,
    })),
  ];
}
