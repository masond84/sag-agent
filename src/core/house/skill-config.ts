import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import type { SkillConfig } from "../../types.js";

const CONFIG_DIR = path.resolve(process.cwd(), "config/skills");

export interface SkillConfigRecord {
  id: string;
  name: string;
  enabled: boolean;
  kind: string;
  configPath: string;
}

export async function listAllSkillConfigs(): Promise<SkillConfigRecord[]> {
  const files = await readdir(CONFIG_DIR);
  const yamlFiles = files.filter((file) => file.endsWith(".yaml") || file.endsWith(".yml"));
  const records: SkillConfigRecord[] = [];

  for (const file of yamlFiles) {
    const configPath = path.join(CONFIG_DIR, file);
    const raw = await readFile(configPath, "utf8");
    const config = parse(raw) as SkillConfig & { kind?: string };
    if (!config.id) {
      continue;
    }
    records.push({
      id: config.id,
      name: config.name ?? config.id,
      enabled: Boolean(config.enabled),
      kind: config.kind ?? "email",
      configPath: `config/skills/${file}`,
    });
  }

  return records.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getSkillConfigById(skillId: string): Promise<SkillConfigRecord | null> {
  const all = await listAllSkillConfigs();
  return all.find((record) => record.id === skillId) ?? null;
}

export async function setSkillEnabled(skillId: string, enabled: boolean): Promise<SkillConfigRecord> {
  const record = await getSkillConfigById(skillId);
  if (!record) {
    throw new Error(`Unknown skill: ${skillId}`);
  }

  const absolute = path.join(process.cwd(), record.configPath);
  const raw = await readFile(absolute, "utf8");
  const pattern = /^enabled:\s*(true|false)\s*$/m;
  if (!pattern.test(raw)) {
    throw new Error(`Could not find enabled flag in ${record.configPath}`);
  }

  const updated = raw.replace(pattern, `enabled: ${enabled}`);
  await writeFile(absolute, updated, "utf8");

  return { ...record, enabled };
}
