import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ChatMessage } from "../llm.js";

const DATA_DIR = path.resolve(process.cwd(), "data/conversations");
const MAX_MESSAGES = Number(process.env.CONVERSATION_MAX_MESSAGES ?? 24);

interface StoredThread {
  userId: string;
  updatedAt: string;
  messages: ChatMessage[];
}

function threadFile(userId: string): string {
  const safe = userId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(DATA_DIR, `${safe}.json`);
}

async function readThread(userId: string): Promise<StoredThread> {
  await mkdir(DATA_DIR, { recursive: true });
  try {
    const raw = await readFile(threadFile(userId), "utf8");
    return JSON.parse(raw) as StoredThread;
  } catch {
    return { userId, updatedAt: new Date().toISOString(), messages: [] };
  }
}

async function writeThread(thread: StoredThread): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(threadFile(thread.userId), JSON.stringify(thread, null, 2));
}

function trimThreadMessages(messages: ChatMessage[]): ChatMessage[] {
  const conversational = messages.filter(
    (message) => message.role === "user" || message.role === "assistant",
  );
  return conversational.slice(-MAX_MESSAGES);
}

export async function getConversationMessages(userId: string): Promise<ChatMessage[]> {
  const thread = await readThread(userId);
  return trimThreadMessages(thread.messages);
}

export async function appendConversationTurn(
  userId: string,
  userText: string,
  assistantText: string,
): Promise<void> {
  const thread = await readThread(userId);
  thread.messages.push({ role: "user", content: userText });
  thread.messages.push({ role: "assistant", content: assistantText });
  thread.messages = trimThreadMessages(thread.messages);
  thread.updatedAt = new Date().toISOString();
  await writeThread(thread);
}

export async function clearConversation(userId: string): Promise<void> {
  await writeThread({ userId, updatedAt: new Date().toISOString(), messages: [] });
}
