import type {
  ActivityEvent,
  HouseEvent,
  SkillNodeDetail,
  SkillTreePayload,
  ToggleSkillResult,
  WorkerHealth,
} from "./types";

export function getWorkerBaseUrl(): string {
  return (process.env.SAG_WORKER_URL ?? "http://127.0.0.1:9473").replace(/\/$/, "");
}

function getFetchBase(): string {
  if (typeof window !== "undefined") {
    return "/api/worker";
  }
  return getWorkerBaseUrl();
}

export async function fetchWorkerJson<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(`${getFetchBase()}${path}`, {
      cache: "no-store",
    });
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export async function fetchWorkerHealth(): Promise<WorkerHealth | null> {
  return fetchWorkerJson<WorkerHealth>("/health");
}

export async function fetchSkillTree(): Promise<SkillTreePayload | null> {
  return fetchWorkerJson<SkillTreePayload>("/skill-tree");
}

export async function fetchSkillNodeDetail(nodeId: string): Promise<SkillNodeDetail | null> {
  return fetchWorkerJson<SkillNodeDetail>(`/skill-node/${encodeURIComponent(nodeId)}`);
}

export async function toggleSkill(
  skillId: string,
  enabled: boolean,
): Promise<ToggleSkillResult | null> {
  try {
    const response = await fetch(`${getFetchBase()}/skills/${encodeURIComponent(skillId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
      cache: "no-store",
    });
    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      throw new Error(payload.error ?? "Toggle failed");
    }
    return (await response.json()) as ToggleSkillResult;
  } catch (error) {
    throw error;
  }
}

export async function fetchActivity(limit = 30): Promise<ActivityEvent[]> {
  const payload = await fetchWorkerJson<{ events: ActivityEvent[] }>(`/activity?limit=${limit}`);
  return payload?.events ?? [];
}

export function createWorkerEventSource(onEvent: (event: HouseEvent) => void): EventSource | null {
  if (typeof window === "undefined") {
    return null;
  }

  const source = new EventSource("/api/worker/events");

  source.onmessage = (message) => {
    try {
      onEvent(JSON.parse(message.data) as HouseEvent);
    } catch {
      // ignore malformed events
    }
  };

  return source;
}

export function stripMarkdownForSpeech(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^#+\s+/gm, "")
    .replace(/^[-*]\s+/gm, "")
    .replace(/\n+/g, " ")
    .trim();
}
