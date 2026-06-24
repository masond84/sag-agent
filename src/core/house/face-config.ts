export type AvatarProvider = "simli" | "tavus" | "did" | "heygen";

export interface FaceSessionEnv {
  enabled: boolean;
  livekitUrl: string;
  livekitApiKey: string;
  livekitApiSecret: string;
  agentName: string;
  avatarProvider: AvatarProvider;
}

function readAvatarProvider(): AvatarProvider {
  const raw = (process.env.FACE_AVATAR_PROVIDER ?? "simli").trim().toLowerCase();
  if (raw === "tavus" || raw === "did" || raw === "heygen" || raw === "simli") {
    return raw;
  }
  return "simli";
}

export function getFaceSessionEnv(): FaceSessionEnv {
  const livekitUrl = process.env.LIVEKIT_URL?.trim() ?? "";
  const livekitApiKey = process.env.LIVEKIT_API_KEY?.trim() ?? "";
  const livekitApiSecret = process.env.LIVEKIT_API_SECRET?.trim() ?? "";

  return {
    enabled: Boolean(livekitUrl && livekitApiKey && livekitApiSecret),
    livekitUrl,
    livekitApiKey,
    livekitApiSecret,
    agentName: process.env.LIVEKIT_AGENT_NAME?.trim() || "sag-face-agent",
    avatarProvider: readAvatarProvider(),
  };
}
