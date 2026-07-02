import { randomBytes } from "node:crypto";
import { AccessToken, AgentDispatchClient, RoomServiceClient } from "livekit-server-sdk";
import { getFaceSessionEnv } from "./face-config.js";

export type FaceAvatarStatus = "pending" | "ready" | "error";

export interface FaceSessionRecord {
  sessionId: string;
  roomName: string;
  createdAt: string;
  participantIdentity: string;
  participantName: string;
  avatarStatus: FaceAvatarStatus;
  avatarError?: string;
  avatarUpdatedAt?: string;
}

export interface FaceSessionStartPayload {
  participantName?: string;
  /** Tear down any existing room and create a fresh LiveKit + Simli session. */
  forceNew?: boolean;
}

export interface FaceSessionStartResponse {
  ok: boolean;
  sessionId: string;
  roomName: string;
  token: string;
  livekitUrl: string;
  avatarProvider: string;
  reused?: boolean;
  error?: string;
}

export interface FaceSessionConfigResponse {
  enabled: boolean;
  livekitUrl: string;
  avatarProvider: string;
}

export interface FaceSessionStatusResponse {
  sessionId: string;
  avatarStatus: FaceAvatarStatus;
  avatarError?: string;
  avatarUpdatedAt?: string;
}

const activeSessions = new Map<string, FaceSessionRecord>();
let lastNewRoomAt = 0;

const NEW_ROOM_COOLDOWN_MS = Number(process.env.FACE_SESSION_COOLDOWN_MS ?? 20_000);
const SESSION_REUSE_MAX_AGE_MS = Number(process.env.FACE_SESSION_REUSE_MAX_AGE_MS ?? 7_200_000);

function createSessionId(): string {
  return randomBytes(8).toString("hex");
}

function createRoomName(sessionId: string): string {
  return `sag-face-${sessionId}`;
}

function getReusableSession(): FaceSessionRecord | null {
  const sessions = [...activeSessions.values()];
  if (sessions.length !== 1) {
    return null;
  }

  const session = sessions[0]!;
  const ageMs = Date.now() - new Date(session.createdAt).getTime();
  if (ageMs > SESSION_REUSE_MAX_AGE_MS) {
    return null;
  }

  return session;
}

async function issueParticipantToken(
  record: FaceSessionRecord,
): Promise<string> {
  const env = getFaceSessionEnv();
  const token = new AccessToken(env.livekitApiKey, env.livekitApiSecret, {
    identity: record.participantIdentity,
    name: record.participantName,
    ttl: "2h",
  });
  token.addGrant({
    roomJoin: true,
    room: record.roomName,
    canPublish: false,
    canSubscribe: true,
    canPublishData: true,
  });
  return token.toJwt();
}

export function getFaceSessionConfig(): FaceSessionConfigResponse {
  const env = getFaceSessionEnv();
  return {
    enabled: env.enabled,
    livekitUrl: env.livekitUrl,
    avatarProvider: env.avatarProvider,
  };
}

export function getFaceSessionStatus(sessionId: string): FaceSessionStatusResponse | null {
  const record = activeSessions.get(sessionId);
  if (!record) {
    return null;
  }

  return {
    sessionId: record.sessionId,
    avatarStatus: record.avatarStatus,
    avatarError: record.avatarError,
    avatarUpdatedAt: record.avatarUpdatedAt,
  };
}

export function setFaceSessionAvatarStatus(
  sessionId: string,
  status: FaceAvatarStatus,
  error?: string,
): { ok: boolean; error?: string } {
  const record = activeSessions.get(sessionId);
  if (!record) {
    return { ok: false, error: "Session not found" };
  }

  record.avatarStatus = status;
  record.avatarUpdatedAt = new Date().toISOString();
  if (error) {
    record.avatarError = error.slice(0, 500);
  } else {
    delete record.avatarError;
  }

  activeSessions.set(sessionId, record);
  return { ok: true };
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

  const forceNew = payload.forceNew ?? false;
  const participantName = payload.participantName?.trim() || "Devin";

  if (!forceNew) {
    const reusable = getReusableSession();
    if (reusable) {
      const token = await issueParticipantToken(reusable);
      return {
        ok: true,
        sessionId: reusable.sessionId,
        roomName: reusable.roomName,
        token,
        livekitUrl: env.livekitUrl,
        avatarProvider: env.avatarProvider,
        reused: true,
      };
    }
  }

  const sinceLastRoomMs = Date.now() - lastNewRoomAt;
  if (forceNew && sinceLastRoomMs < NEW_ROOM_COOLDOWN_MS && activeSessions.size > 0) {
    const reusable = getReusableSession();
    if (reusable) {
      const token = await issueParticipantToken(reusable);
      return {
        ok: true,
        sessionId: reusable.sessionId,
        roomName: reusable.roomName,
        token,
        livekitUrl: env.livekitUrl,
        avatarProvider: env.avatarProvider,
        reused: true,
        error: `New session cooldown active (${Math.ceil((NEW_ROOM_COOLDOWN_MS - sinceLastRoomMs) / 1000)}s) — reusing current room`,
      };
    }
  }

  await endAllFaceSessions();

  const sessionId = createSessionId();
  const roomName = createRoomName(sessionId);
  const participantIdentity = `sag-user-${sessionId}`;

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

  const jwt = await issueParticipantToken({
    sessionId,
    roomName,
    createdAt: new Date().toISOString(),
    participantIdentity,
    participantName,
    avatarStatus: "pending",
  });

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
    participantName,
    avatarStatus: "pending",
  });
  lastNewRoomAt = Date.now();

  return {
    ok: true,
    sessionId,
    roomName,
    token: jwt,
    livekitUrl: env.livekitUrl,
    avatarProvider: env.avatarProvider,
    reused: false,
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
