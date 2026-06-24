import { ConnectionState, RoomEvent, type RemoteParticipant, type Room } from "livekit-client";

export const SAG_SPEAK_RPC_METHOD = "sag.speak";

const VOICE_AGENT_WAIT_MS = 30_000;
const VOICE_AGENT_POLL_MS = 250;

export function isAvatarVideoParticipant(identity: string): boolean {
  const id = identity.toLowerCase();
  return id.includes("simli-avatar") || (id.includes("avatar") && id.includes("agent"));
}

export function isVoiceAgentParticipant(participant: RemoteParticipant): boolean {
  if (isAvatarVideoParticipant(participant.identity)) {
    return false;
  }
  if (participant.identity.startsWith("sag-user-")) {
    return false;
  }
  return participant.isAgent || participant.identity.startsWith("agent-");
}

export function findVoiceAgentParticipant(room: Room): RemoteParticipant | null {
  for (const participant of room.remoteParticipants.values()) {
    if (isVoiceAgentParticipant(participant)) {
      return participant;
    }
  }
  return null;
}

export function resolveVoiceAgentIdentity(room: Room): string | null {
  return findVoiceAgentParticipant(room)?.identity ?? null;
}

async function waitForRoomConnected(room: Room, timeoutMs = VOICE_AGENT_WAIT_MS): Promise<void> {
  if (room.state === ConnectionState.Connected) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Face session is still connecting."));
    }, timeoutMs);

    const onStateChange = (state: ConnectionState) => {
      if (state === ConnectionState.Connected) {
        cleanup();
        resolve();
      }
      if (state === ConnectionState.Disconnected) {
        cleanup();
        reject(new Error("Face session disconnected before it was ready."));
      }
    };

    const cleanup = () => {
      clearTimeout(timer);
      room.off(RoomEvent.ConnectionStateChanged, onStateChange);
    };

    room.on(RoomEvent.ConnectionStateChanged, onStateChange);
  });
}

async function waitForVoiceAgent(room: Room, timeoutMs = VOICE_AGENT_WAIT_MS): Promise<RemoteParticipant> {
  await waitForRoomConnected(room, timeoutMs);

  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (room.state !== ConnectionState.Connected) {
      throw new Error("Face session disconnected while waiting for the voice agent.");
    }

    const agent = findVoiceAgentParticipant(room);
    if (agent) {
      await agent.waitUntilActive();
      return agent;
    }

    await new Promise((resolve) => setTimeout(resolve, VOICE_AGENT_POLL_MS));
  }

  throw new Error("Voice agent not connected to the room yet.");
}

export async function speakTextViaAgent(room: Room, text: string): Promise<void> {
  const cleaned = text.trim();
  if (!cleaned) {
    return;
  }

  const agent = await waitForVoiceAgent(room);

  await room.localParticipant.performRpc({
    destinationIdentity: agent.identity,
    method: SAG_SPEAK_RPC_METHOD,
    payload: JSON.stringify({ text: cleaned }),
    responseTimeout: 60_000,
  });
}
