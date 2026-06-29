import { randomBytes } from "node:crypto";
import { AccessToken, AgentDispatchClient, RoomServiceClient } from "livekit-server-sdk";
import { getFaceSessionEnv } from "./face-config.js";

export interface FaceSessionRecord {
  sessionId: string;
  roomName: string;
  createdAt: string;
  participantIdentity: string;
}

export interface FaceSessionStartPayload {
  participantName?: string;
}

export interface FaceSessionStartResponse {
  ok: boolean;
  sessionId: string;
  roomName: string;
  token: string;
  livekitUrl: string;
  avatarProvider: string;
  error?: string;
}

export interface FaceSessionConfigResponse {
  enabled: boolean;
  livekitUrl: string;
  avatarProvider: string;
}

const activeSessions = new Map<string, FaceSessionRecord>();

function createSessionId(): string {
  return randomBytes(8).toString("hex");
}

function createRoomName(sessionId: string): string {
  return `sag-face-${sessionId}`;
}

export function getFaceSessionConfig(): FaceSessionConfigResponse {
  const env = getFaceSessionEnv();
  return {
    enabled: env.enabled,
    livekitUrl: env.livekitUrl,
    avatarProvider: env.avatarProvider,
  };
}

export async function startFaceSession(
  payload: FaceSessionStartPayload = {},
): Promise<FaceSessionStartResponse> {
  const env = getFaceSessionEnv();
  if (!env.enabled) {
    return {
      ok: false,
      sessionId: "",
      roomName: "",
      token: "",
      livekitUrl: "",
      avatarProvider: env.avatarProvider,
      error: "Photoreal face sessions are not configured. Set LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET.",
    };
  }

  await endAllFaceSessions();

  const sessionId = createSessionId();
  const roomName = createRoomName(sessionId);
  const participantIdentity = `sag-user-${sessionId}`;
  const participantName = payload.participantName?.trim() || "Devin";

  const roomClient = new RoomServiceClient(env.livekitUrl, env.livekitApiKey, env.livekitApiSecret);
  await roomClient.createRoom({
    name: roomName,
    emptyTimeout: 600,
    maxParticipants: 4,
    metadata: JSON.stringify({
      sessionId,
      avatarProvider: env.avatarProvider,
      source: "sag-house",
    }),
  });

  const token = new AccessToken(env.livekitApiKey, env.livekitApiSecret, {
    identity: participantIdentity,
    name: participantName,
    ttl: "2h",
  });
  token.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: false,
    canSubscribe: true,
    canPublishData: true,
  });

  const jwt = await token.toJwt();

  try {
    const dispatch = new AgentDispatchClient(env.livekitUrl, env.livekitApiKey, env.livekitApiSecret);
    await dispatch.createDispatch(roomName, env.agentName, {
      metadata: JSON.stringify({
        sessionId,
        avatarProvider: env.avatarProvider,
      }),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.warn(`[warn] Face session agent dispatch failed: ${detail}`);
  }

  activeSessions.set(sessionId, {
    sessionId,
    roomName,
    createdAt: new Date().toISOString(),
    participantIdentity,
  });

  return {
    ok: true,
    sessionId,
    roomName,
    token: jwt,
    livekitUrl: env.livekitUrl,
    avatarProvider: env.avatarProvider,
  };
}

export async function endFaceSession(sessionId: string): Promise<{ ok: boolean; error?: string }> {
  const record = activeSessions.get(sessionId);
  if (!record) {
    return { ok: true };
  }

  const env = getFaceSessionEnv();
  if (env.enabled) {
    try {
      const roomClient = new RoomServiceClient(env.livekitUrl, env.livekitApiKey, env.livekitApiSecret);
      await roomClient.deleteRoom(record.roomName);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      console.warn(`[warn] Face session room delete failed: ${detail}`);
    }
  }

  activeSessions.delete(sessionId);
  return { ok: true };
}

export async function endAllFaceSessions(): Promise<void> {
  const sessionIds = [...activeSessions.keys()];
  for (const sessionId of sessionIds) {
    await endFaceSession(sessionId);
  }
}
