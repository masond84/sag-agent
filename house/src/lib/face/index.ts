export { speakTextViaAgent, resolveVoiceAgentIdentity, SAG_SPEAK_RPC_METHOD } from "./agent-speak";
export { speakText } from "./tts";
export type {
  AvatarConnectionStatus,
  FaceMode,
  FaceRendererProps,
  FaceSessionConfig,
  FaceSessionStartResult,
  LiveKitAvatarHandle,
} from "./types";
export { PresenceFaceRenderer } from "./presence";
export { LiveKitAvatarRenderer } from "./livekit-avatar";
export { fetchFaceSessionConfig, startFaceSession, endFaceSession } from "./session";
