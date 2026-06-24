import type { Room } from "livekit-client";

export const SAG_SPEAK_RPC_METHOD = "sag.speak";

export function isAvatarVideoParticipant(identity: string): boolean {
  const id = identity.toLowerCase();
  return id.includes("simli-avatar") || (id.includes("avatar") && id.includes("agent"));
}

export function resolveVoiceAgentIdentity(room: Room): string | null {
  for (const participant of room.remoteParticipants.values()) {
    if (isAvatarVideoParticipant(participant.identity)) {
      continue;
    }
    if (participant.identity.startsWith("sag-user-")) {
      continue;
    }
    return participant.identity;
  }
  return null;
}

export async function speakTextViaAgent(room: Room, text: string): Promise<void> {
  const cleaned = text.trim();
  if (!cleaned) {
    return;
  }

  const agentIdentity = resolveVoiceAgentIdentity(room);
  if (!agentIdentity) {
    throw new Error("Voice agent not connected to the room yet.");
  }

  await room.localParticipant.performRpc({
    destinationIdentity: agentIdentity,
    method: SAG_SPEAK_RPC_METHOD,
    payload: JSON.stringify({ text: cleaned }),
    responseTimeout: 60_000,
  });
}
