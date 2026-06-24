import type { FaceState } from "@/lib/types";

export type FaceMode = "presence" | "photoreal";

export interface FaceRendererProps {
  state: FaceState;
  caption: string;
  amplitude: number;
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
}
