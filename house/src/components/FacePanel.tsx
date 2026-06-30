"use client";

import { useEffect, useRef, useState } from "react";
import { PresenceExpandButton } from "@/components/PresenceExpandButton";
import {
  LiveKitAvatarRenderer,
  PixelHouseRenderer,
  PresenceFaceRenderer,
  type AvatarConnectionStatus,
  type FaceMode,
  type LiveKitAvatarHandle,
} from "@/lib/face";
import type { FaceState } from "@/lib/types";

interface FacePanelProps {
  caption: string;
  state: FaceState;
  mode: FaceMode;
  photorealActive: boolean;
  photorealAvailable: boolean;
  reconnectToken: number;
  expanded?: boolean;
  onToggleExpand?: () => void;
  avatarSpeakRef?: React.RefObject<LiveKitAvatarHandle | null>;
  onFaceStateChange?: (state: FaceState) => void;
  onPhotorealError?: (message: string) => void;
  onAvatarStatusChange?: (status: AvatarConnectionStatus) => void;
  onRequestReconnect?: () => void;
}

export function FacePanel({
  caption,
  state,
  mode,
  photorealActive,
  photorealAvailable,
  reconnectToken,
  expanded = false,
  onToggleExpand,
  avatarSpeakRef,
  onFaceStateChange,
  onPhotorealError,
  onAvatarStatusChange,
  onRequestReconnect,
}: FacePanelProps) {
  const [amplitude, setAmplitude] = useState(0);
  const [avatarStatus, setAvatarStatus] = useState<AvatarConnectionStatus>("off");
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (mode === "photoreal" || state !== "speaking") {
      setAmplitude(0);
      return;
    }

    let tick = 0;
    const animate = () => {
      tick += expanded ? 0.2 : 0.15;
      setAmplitude(0.25 + Math.abs(Math.sin(tick)) * 0.55 + Math.random() * 0.1);
      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [expanded, mode, state]);

  const tierLabel =
    mode === "photoreal"
      ? "Tier 3 — Photoreal Face"
      : mode === "pixel"
        ? "Tier 2 — Pixel House"
        : "Tier 1 — Voice Shell";

  return (
    <section
      className={`flex flex-col items-center gap-6 transition-all duration-300 ${
        expanded
          ? "min-h-[min(72vh,720px)] justify-center rounded-xl border border-sag-border bg-white/[0.02] px-6 py-10 md:px-10"
          : "border-b border-sag-border pb-8"
      }`}
    >
      <header className="relative w-full space-y-1 text-center">
        {onToggleExpand && (
          <div className="absolute right-0 top-0">
            <PresenceExpandButton expanded={expanded} onClick={onToggleExpand} />
          </div>
        )}
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-sag-muted">
          SAG Presence
        </p>
        <h2 className="text-lg font-medium tracking-tight text-sag-text md:text-xl">{tierLabel}</h2>
        {mode === "photoreal" && !photorealAvailable && (
          <p className="text-xs text-amber-200/80">
            LiveKit not configured — set LIVEKIT_* in worker .env
          </p>
        )}
      </header>

      {mode === "photoreal" ? (
        <>
          <LiveKitAvatarRenderer
            ref={avatarSpeakRef}
            state={state}
            caption={caption}
            amplitude={amplitude}
            expanded={expanded}
            sessionActive={photorealActive}
            reconnectToken={reconnectToken}
            onStateChange={onFaceStateChange}
            onError={onPhotorealError}
            onConnectionStatusChange={(status) => {
              setAvatarStatus(status);
              onAvatarStatusChange?.(status);
            }}
            onRequestReconnect={onRequestReconnect}
          />
          {photorealActive && (avatarStatus === "lost" || avatarStatus === "reconnecting") && (
            <button
              type="button"
              onClick={onRequestReconnect}
              disabled={avatarStatus === "reconnecting"}
              className="rounded-md border border-sag-border bg-white/[0.06] px-4 py-2 text-xs font-medium text-sag-text transition hover:bg-white/[0.1] disabled:opacity-50"
            >
              {avatarStatus === "reconnecting" ? "Reconnecting…" : "Reconnect face"}
            </button>
          )}
        </>
      ) : mode === "pixel" ? (
        <PixelHouseRenderer
          state={state}
          caption={caption}
          amplitude={amplitude}
          expanded={expanded}
        />
      ) : (
        <>
          <PresenceFaceRenderer
            state={state}
            caption={caption}
            amplitude={amplitude}
            expanded={expanded}
          />
          <p
            className={`text-center leading-relaxed text-sag-muted ${
              expanded ? "min-h-[3rem] max-w-xl text-base" : "min-h-[4rem] max-w-[260px] text-sm"
            }`}
          >
            {caption || "Waiting for SAG to speak…"}
          </p>
        </>
      )}

      <StatusBadge state={state} mode={mode} photorealActive={photorealActive} />
    </section>
  );
}

function StatusBadge({
  state,
  mode,
  photorealActive,
}: {
  state: FaceState;
  mode: FaceMode;
  photorealActive: boolean;
}) {
  if (mode === "photoreal") {
    const label = photorealActive ? "Face-to-face session" : "Session ended";
    return (
      <span className="rounded-md border border-sag-border bg-white/[0.03] px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-sag-muted">
        {label}
      </span>
    );
  }

  const labels: Record<FaceState, string> = {
    idle: "Idle",
    listening: "Listening",
    speaking: "Speaking",
    thinking: "Thinking",
  };

  return (
    <span className="rounded-md border border-sag-border bg-white/[0.03] px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-sag-muted">
      {labels[state]}
    </span>
  );
}

export { speakText } from "@/lib/face";
