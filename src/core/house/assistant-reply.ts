import { buildTelegramReply } from "../telegram-handlers.js";
import { getAuthorizedChatId } from "../telegram.js";
import type { InteractiveSkillContext } from "../../types.js";
import { publishHouseEvent } from "./events.js";
import { resolveSpeakableText } from "./speech-policy.js";

function resolveAssistantChatId(chatId?: number | string): number {
  if (chatId !== undefined && chatId !== "") {
    const parsed = Number(chatId);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  const fromEnv = getAuthorizedChatId();
  if (!fromEnv) {
    throw new Error("TELEGRAM_CHAT_ID is required for the assistant bridge");
  }

  const parsed = Number(fromEnv);
  if (!Number.isFinite(parsed)) {
    throw new Error("TELEGRAM_CHAT_ID must be a numeric chat id");
  }

  return parsed;
}

function resolveFaceSpeakable(reply: string): string | null {
  const speakable = resolveSpeakableText(reply, { source: "face" });
  if (speakable) {
    return speakable;
  }

  const stripped = reply.replace(/[#*_`]/g, "").trim();
  if (!stripped) {
    return null;
  }

  const firstLine = stripped.split("\n").find((line) => line.trim())?.trim();
  if (firstLine && firstLine.length <= 320) {
    return firstLine;
  }

  return stripped.length <= 320 ? stripped : `${stripped.slice(0, 317)}...`;
}

export interface AssistantReplyResult {
  reply: string;
  speakable: string | null;
}

export async function buildAssistantReply(
  text: string,
  getContext: () => Promise<InteractiveSkillContext>,
  chatId?: number | string,
): Promise<AssistantReplyResult> {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("Missing text");
  }

  const resolvedChatId = resolveAssistantChatId(chatId);
  const context = await getContext();
  const reply = await buildTelegramReply(trimmed, context, resolvedChatId);
  const speakable = resolveFaceSpeakable(reply);

  if (speakable) {
    publishHouseEvent("speech", {
      speech: speakable,
      text: speakable,
      meta: { source: "face", avatarSpeak: false },
    });
  }

  return { reply, speakable };
}
