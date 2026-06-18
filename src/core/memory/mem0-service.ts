import { mkdir } from "node:fs/promises";
import path from "node:path";
import { MemoryClient } from "mem0ai";
import { Memory as OssMemory } from "mem0ai/oss";
import {
  getProfileFileMtimeMs,
  getProfileSeedState,
  getProfileSeedText,
  markProfileSeeded,
} from "./profile.js";

const DATA_DIR = path.resolve(process.cwd(), "data/mem0");

type Mem0Backend = OssMemory | MemoryClient;

let backend: Mem0Backend | null | undefined;
let initError: string | undefined;

function isMem0Configured(): boolean {
  if ((process.env.MEM0_ENABLED ?? "true").toLowerCase() === "false") {
    return false;
  }

  if (process.env.MEM0_API_KEY?.trim()) {
    return true;
  }

  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

function logMem0Warn(message: string): void {
  if ((process.env.LOG_LEVEL ?? "info") !== "error") {
    console.warn(`[warn] Mem0: ${message}`);
  }
}

async function createBackend(): Promise<Mem0Backend | null> {
  const platformKey = process.env.MEM0_API_KEY?.trim();
  if (platformKey) {
    return new MemoryClient({
      apiKey: platformKey,
      host: process.env.MEM0_HOST?.trim() || "https://api.mem0.ai",
    });
  }

  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  if (!openaiKey) {
    return null;
  }

  await mkdir(DATA_DIR, { recursive: true });

  const llmModel = process.env.MEM0_LLM_MODEL?.trim() || process.env.ASSISTANT_MODEL?.trim() || "gpt-4o-mini";
  const embedModel = process.env.MEM0_EMBED_MODEL?.trim() || "text-embedding-3-small";
  const baseUrl = process.env.OPENAI_BASE_URL?.trim();

  return new OssMemory({
    embedder: {
      provider: "openai",
      config: {
        apiKey: openaiKey,
        model: embedModel,
        baseURL: baseUrl,
      },
    },
    vectorStore: {
      provider: "memory",
      config: {
        collectionName: "sag_memories",
        dimension: 1536,
        dbPath: path.join(DATA_DIR, "vectors"),
      },
    },
    llm: {
      provider: "openai",
      config: {
        apiKey: openaiKey,
        model: llmModel,
        baseURL: baseUrl,
      },
    },
    historyDbPath: path.join(DATA_DIR, "history.db"),
    customInstructions:
      "Extract durable facts about the user: identity, preferences, clients, projects, goals, and decisions. Skip greetings and filler.",
  });
}

async function getBackend(): Promise<Mem0Backend | null> {
  if (!isMem0Configured()) {
    return null;
  }

  if (backend !== undefined) {
    return backend;
  }

  try {
    backend = await createBackend();
    return backend;
  } catch (error) {
    initError = error instanceof Error ? error.message : String(error);
    logMem0Warn(`init failed: ${initError}`);
    backend = null;
    return null;
  }
}

function mem0UserFilters(userId: string): Record<string, string> {
  return { user_id: userId };
}

function mem0AgentFilters(agentId: string): Record<string, string> {
  return { agent_id: agentId };
}

export function resolveAgentId(): string {
  return process.env.SAG_AGENT_ID?.trim() || "sag";
}

function formatMemoryResults(
  results: Array<{ memory?: string; score?: number }>,
  emptyLabel: string,
): string {
  const lines = results
    .map((entry) => entry.memory?.trim())
    .filter((memory): memory is string => Boolean(memory));

  if (lines.length === 0) {
    return emptyLabel;
  }

  return lines.map((line) => `- ${line}`).join("\n");
}

export function isMem0Enabled(): boolean {
  return isMem0Configured();
}

export function getMem0InitError(): string | undefined {
  return initError;
}

export interface AgentMemoryEntry {
  id: string;
  memory: string;
}

export function resolveMemoryUserId(chatId?: number | string): string {
  const override = process.env.SAG_USER_ID?.trim();
  if (override) {
    return override;
  }

  if (chatId !== undefined) {
    return `telegram-${chatId}`;
  }

  const chatEnv = process.env.TELEGRAM_CHAT_ID?.trim();
  if (chatEnv) {
    return `telegram-${chatEnv}`;
  }

  return "sag-default-user";
}

export async function searchUserMemories(userId: string, query: string, topK = 6): Promise<string> {
  const client = await getBackend();
  if (!client) {
    return "";
  }

  try {
    const result = await client.search(query, {
      filters: mem0UserFilters(userId),
      topK,
    });

    const formatted = formatMemoryResults(result.results ?? [], "");
    return formatted ? `Relevant memories about the user:\n${formatted}` : "";
  } catch (error) {
    logMem0Warn(`search failed: ${error instanceof Error ? error.message : String(error)}`);
    return "";
  }
}

export async function searchAgentMemories(query: string, topK = 6): Promise<string> {
  const client = await getBackend();
  if (!client) {
    return "";
  }

  const agentId = resolveAgentId();

  try {
    const result = await client.search(query, {
      filters: mem0AgentFilters(agentId),
      topK,
    });

    const formatted = formatMemoryResults(result.results ?? [], "");
    return formatted ? `What SAG remembers about itself:\n${formatted}` : "";
  } catch (error) {
    logMem0Warn(`agent search failed: ${error instanceof Error ? error.message : String(error)}`);
    return "";
  }
}

export async function searchMemoriesForChat(userId: string, query: string, topK = 6): Promise<string> {
  const [userBlock, agentBlock] = await Promise.all([
    searchUserMemories(userId, query, topK),
    searchAgentMemories(query, topK),
  ]);

  return [userBlock, agentBlock].filter(Boolean).join("\n\n");
}

export async function addConversationToMem0(
  userId: string,
  userText: string,
  assistantText: string,
): Promise<void> {
  const client = await getBackend();
  if (!client) {
    return;
  }

  const agentId = resolveAgentId();

  try {
    await client.add(
      [
        { role: "user", content: userText },
        { role: "assistant", content: assistantText },
      ],
      {
        userId,
        metadata: { source: "telegram", type: "conversation" },
      },
    );

    await client.add(
      [
        { role: "assistant", content: assistantText },
        { role: "user", content: userText },
      ],
      {
        agentId,
        metadata: { source: "telegram", type: "agent_conversation" },
      },
    );
  } catch (error) {
    logMem0Warn(`add failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function addAgentDiary(
  text: string,
  metadata?: Record<string, string>,
): Promise<void> {
  const client = await getBackend();
  if (!client) {
    return;
  }

  const agentId = resolveAgentId();

  try {
    await client.add([{ role: "assistant", content: text }], {
      agentId,
      infer: true,
      metadata: { source: "reflection", type: "agent_diary", ...metadata },
    });
  } catch (error) {
    logMem0Warn(`agent diary add failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function addAgentSeedMemory(
  text: string,
  metadata?: Record<string, string>,
): Promise<void> {
  const client = await getBackend();
  if (!client) {
    throw new Error("Mem0 is not configured");
  }

  const agentId = resolveAgentId();

  await client.add([{ role: "assistant", content: text }], {
    agentId,
    infer: false,
    metadata: { source: "seed", type: "agent_persona", ...metadata },
  });
}

export async function addUserSeedMemory(userId: string, text: string): Promise<void> {
  const client = await getBackend();
  if (!client) {
    throw new Error("Mem0 is not configured");
  }

  await client.add([{ role: "user", content: text }], {
    userId,
    infer: false,
    metadata: { source: "seed", type: "user_persona" },
  });
}

async function fetchAgentMemoryEntries(limit = 50): Promise<AgentMemoryEntry[]> {
  const client = await getBackend();
  if (!client) {
    return [];
  }

  const agentId = resolveAgentId();

  let results: Array<{ id?: string; memory?: string }> = [];

  if (client instanceof MemoryClient) {
    const page = await client.getAll({
      filters: mem0AgentFilters(agentId),
      pageSize: limit,
    });
    results = page.results ?? [];
  } else {
    const page = await client.getAll({
      filters: mem0AgentFilters(agentId),
      topK: limit,
    });
    results = page.results ?? [];
  }

  return results
    .filter((entry): entry is { id: string; memory: string } => Boolean(entry.id && entry.memory))
    .map((entry) => ({ id: entry.id, memory: entry.memory }));
}

export async function listAgentMemoryEntries(limit = 50): Promise<AgentMemoryEntry[]> {
  try {
    return await fetchAgentMemoryEntries(limit);
  } catch (error) {
    logMem0Warn(`list agent entries failed: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

export async function deleteAgentMemory(memoryId: string): Promise<void> {
  const client = await getBackend();
  if (!client) {
    throw new Error("Mem0 is not configured");
  }

  await client.delete(memoryId);
}

const GENERIC_AGENT_MEMORY_PATTERNS = [
  /hanging out and keeping things ready/i,
  /ready for any questions or tasks/i,
  /night owl/i,
  /operates when the user is active/i,
  /stays in the background until needed/i,
  /here to assist/i,
  /keeping things interesting during the chat/i,
  /monitoring tasks/i,
  /when you need me/i,
  /testing the new assistant/i,
  /^user inquired/i,
  /^user asked/i,
  /^user is testing/i,
  /conservice bill/i,
  /as an ai/i,
  /language model/i,
  /virtual assistant/i,
  /i don't have feelings/i,
];

export function isGenericAgentMemory(text: string): boolean {
  return GENERIC_AGENT_MEMORY_PATTERNS.some((pattern) => pattern.test(text));
}

export async function purgeGenericAgentMemories(): Promise<{ deleted: number; kept: number }> {
  const entries = await listAgentMemoryEntries(100);
  let deleted = 0;
  let kept = 0;

  for (const entry of entries) {
    if (isGenericAgentMemory(entry.memory)) {
      await deleteAgentMemory(entry.id);
      deleted += 1;
    } else {
      kept += 1;
    }
  }

  return { deleted, kept };
}

export async function addExplicitMemory(userId: string, text: string): Promise<void> {
  const client = await getBackend();
  if (!client) {
    throw new Error("Mem0 is not configured");
  }

  await client.add([{ role: "user", content: text }], {
    userId,
    infer: true,
    metadata: { source: "telegram", type: "explicit_remember" },
  });
}

export async function listUserMemories(userId: string, limit = 10): Promise<string> {
  const client = await getBackend();
  if (!client) {
    return "Mem0 is not configured.";
  }

  try {
    let results: Array<{ memory?: string }> = [];

    if (client instanceof MemoryClient) {
      const page = await client.getAll({
        filters: mem0UserFilters(userId),
        pageSize: limit,
      });
      results = page.results ?? [];
    } else {
      const page = await client.getAll({
        filters: mem0UserFilters(userId),
        topK: limit,
      });
      results = page.results ?? [];
    }

    const formatted = formatMemoryResults(results, "No memories stored yet.");
    return ["Stored memories:", formatted].join("\n");
  } catch (error) {
    logMem0Warn(`getAll failed: ${error instanceof Error ? error.message : String(error)}`);
    return "Could not load memories right now.";
  }
}

export async function listAgentMemories(limit = 10): Promise<string> {
  const client = await getBackend();
  if (!client) {
    return "Mem0 is not configured.";
  }

  const agentId = resolveAgentId();

  try {
    let results: Array<{ memory?: string }> = [];

    if (client instanceof MemoryClient) {
      const page = await client.getAll({
        filters: mem0AgentFilters(agentId),
        pageSize: limit,
      });
      results = page.results ?? [];
    } else {
      const page = await client.getAll({
        filters: mem0AgentFilters(agentId),
        topK: limit,
      });
      results = page.results ?? [];
    }

    const formatted = formatMemoryResults(results, "No agent memories stored yet.");
    return ["SAG's stored memories:", formatted].join("\n");
  } catch (error) {
    logMem0Warn(`agent getAll failed: ${error instanceof Error ? error.message : String(error)}`);
    return "Could not load agent memories right now.";
  }
}

export async function ensureProfileSeededInMem0(userId: string): Promise<void> {
  const client = await getBackend();
  if (!client) {
    return;
  }

  try {
    const [mtimeMs, seedState, seedText] = await Promise.all([
      getProfileFileMtimeMs(),
      getProfileSeedState(),
      getProfileSeedText(),
    ]);

    if (seedState?.mtimeMs === mtimeMs) {
      return;
    }

    await client.add([{ role: "user", content: seedText }], {
      userId,
      infer: false,
      metadata: { source: "profile", type: "stable_profile" },
    });

    await markProfileSeeded(mtimeMs);
  } catch (error) {
    logMem0Warn(`profile seed failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}
