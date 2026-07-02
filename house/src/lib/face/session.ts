import type { FaceSessionConfig, FaceSessionStartResult, FaceSessionStatusResult } from "@/lib/face/types";

function getFetchBase(): string {
  if (typeof window !== "undefined") {
    return "/api/worker";
  }
  return (process.env.SAG_WORKER_URL ?? "http://127.0.0.1:9473").replace(/\/$/, "");
}

export async function fetchFaceSessionConfig(): Promise<FaceSessionConfig | null> {
  try {
    const response = await fetch(`${getFetchBase()}/face-session/config`, { cache: "no-store" });
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as FaceSessionConfig;
  } catch {
    return null;
  }
}

export async function startFaceSession(
  options: { participantName?: string; forceNew?: boolean } = {},
): Promise<FaceSessionStartResult | null> {
  try {
    const response = await fetch(`${getFetchBase()}/face-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(options),
      cache: "no-store",
    });
    return (await response.json()) as FaceSessionStartResult;
  } catch {
    return null;
  }
}

export async function fetchFaceSessionStatus(sessionId: string): Promise<FaceSessionStatusResult | null> {
  try {
    const response = await fetch(
      `${getFetchBase()}/face-session/${encodeURIComponent(sessionId)}/status`,
      { cache: "no-store" },
    );
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as FaceSessionStatusResult;
  } catch {
    return null;
  }
}

export async function endFaceSession(sessionId: string): Promise<void> {
  try {
    await fetch(`${getFetchBase()}/face-session/${encodeURIComponent(sessionId)}`, {
      method: "DELETE",
      cache: "no-store",
    });
  } catch {
    // best effort
  }
}
