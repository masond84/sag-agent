import { resolveSpeakableText } from "./speech-policy.js";

export type HouseEventKind = "speech" | "activity" | "status" | "connected";

export interface HouseEvent {
  id: string;
  at: string;
  kind: HouseEventKind;
  text?: string;
  speech?: string;
  meta?: Record<string, string | number | boolean>;
}

type HouseListener = (event: HouseEvent) => void;

const listeners = new Set<HouseListener>();
let eventCounter = 0;

function nextId(): string {
  eventCounter += 1;
  return `he-${Date.now()}-${eventCounter}`;
}

export function subscribeHouseEvents(listener: HouseListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function publishHouseEvent(
  kind: HouseEventKind,
  payload: Omit<HouseEvent, "id" | "at" | "kind"> = {},
): void {
  if (!isHouseServerEnabled()) {
    return;
  }

  const event: HouseEvent = {
    id: nextId(),
    at: new Date().toISOString(),
    kind,
    ...payload,
  };

  for (const listener of listeners) {
    listener(event);
  }
}

export function publishHouseSpeech(
  speech: string,
  meta?: Record<string, string | number | boolean>,
): void {
  const speakable = resolveSpeakableText(speech, meta);
  if (!speakable) {
    return;
  }

  publishHouseEvent("speech", {
    speech: speakable,
    text: speakable,
    meta,
  });
}

export function isHouseServerEnabled(): boolean {
  return (process.env.HOUSE_SERVER_ENABLED ?? "false").toLowerCase() === "true";
}

export function getHouseServerPort(): number {
  return Number(process.env.HOUSE_SERVER_PORT ?? 9473);
}

export function getHouseServerHost(): string {
  return process.env.HOUSE_SERVER_HOST?.trim() || "127.0.0.1";
}
