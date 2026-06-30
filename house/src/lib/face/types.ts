import type { FaceState } from "@/lib/types";

export type FaceMode = "presence" | "pixel" | "photoreal";

export interface FaceRendererProps {
  state: FaceState;
  caption: string;
  amplitude: number;
  expanded?: boolean;
}

export interface FaceSessionConfig {
  enabled: boolean;
  livekitUrl: string;
  avatarProvider: string;
}

export interface FaceSessionStartResult {
  ok: boolean;
  sessionId: string;
  roomName: string;
  token: string;
  livekitUrl: string;
  avatarProvider: string;
  error?: string;
}

export type AvatarConnectionStatus =
  | "off"
  | "connecting"
  | "waiting"
  | "live"
  | "reconnecting"
  | "lost";

export interface LiveKitAvatarHandle {
  speak: (text: string) => void;
  unlockAudio: () => Promise<void>;
}
