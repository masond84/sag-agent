/**
 * Bot registry store - manages the bots.json file in z-sync.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Bot, BotRegistry } from "./schema.js";
import { validateBot } from "./schema.js";

const BOTS_FILE = path.resolve(process.cwd(), "z-sync/bots.json");

export async function loadBots(): Promise<BotRegistry | null> {
  try {
    const raw = await readFile(BOTS_FILE, "utf8");
    return JSON.parse(raw) as BotRegistry;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export async function saveBots(registry: BotRegistry): Promise<void> {
  for (const bot of registry.bots) {
    const errors = validateBot(bot);
    if (errors.length > 0) {
      throw new Error(`Bot ${bot.id} validation failed: ${errors.join(", ")}`);
    }
  }

  await mkdir(path.dirname(BOTS_FILE), { recursive: true });
  await writeFile(BOTS_FILE, JSON.stringify(registry, null, 2) + "\n", "utf8");
}

export async function getBot(botId: string): Promise<Bot | null> {
  const registry = await loadBots();
  if (!registry) return null;
  return registry.bots.find(b => b.id === botId) || null;
}

export async function addBot(bot: Bot): Promise<void> {
  const errors = validateBot(bot);
  if (errors.length > 0) {
    throw new Error(`Bot validation failed: ${errors.join(", ")}`);
  }

  const registry = await loadBots() || {
    bots: [],
    updatedAt: new Date().toISOString(),
    updatedBy: "sag" as const,
  };

  if (registry.bots.some(b => b.id === bot.id)) {
    throw new Error(`Bot ${bot.id} already exists`);
  }

  registry.bots.push(bot);
  registry.updatedAt = new Date().toISOString();
  registry.updatedBy = "sag";

  await saveBots(registry);
}
