"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import {
  ConnectionState,
  Room,
  RoomEvent,
  Track,
  type RemoteTrack,
  type RemoteTrackPublication,
} from "livekit-client";
import { isAvatarVideoParticipant, speakTextViaAgent } from "@/lib/face/agent-speak";
import type { AvatarConnectionStatus, FaceRendererProps, LiveKitAvatarHandle } from "@/lib/face/types";
import type { FaceState } from "@/lib/types";
import { endFaceSession, fetchFaceSessionConfig, startFaceSession } from "@/lib/face/session";
import { stripMarkdownForSpeech } from "@/lib/worker";

const AUTO_RECONNECT_DELAY_MS = 4_000;
const MAX_AUTO_RECONNECTS = 2;

function roomHasAvatar(room: Room): boolean {
  return [...room.remoteParticipants.values()].some((p) => isAvatarVideoParticipant(p.identity));
}

interface LiveKitAvatarRendererProps extends FaceRendererProps {
  sessionActive: boolean;
  reconnectToken: number;
  onStateChange?: (state: FaceState) => void;
  onError?: (message: string) => void;
  onConnectionStatusChange?: (status: AvatarConnectionStatus) => void;
  onRequestReconnect?: () => void;
}

export const LiveKitAvatarRenderer = forwardRef<LiveKitAvatarHandle, LiveKitAvatarRendererProps>(
  function LiveKitAvatarRenderer(
    {
      caption,
      sessionActive,
      reconnectToken,
      onStateChange,
      onError,
      onConnectionStatusChange,
      onRequestReconnect,
    },
    ref,
  ) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const roomRef = useRef<Room | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const connectGenerationRef = useRef(0);
  const autoReconnectCountRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speechQueueRef = useRef<Promise<void>>(Promise.resolve());

  const onStateChangeRef = useRef(onStateChange);
  const onErrorRef = useRef(onError);
  const onConnectionStatusRef = useRef(onConnectionStatusChange);
  const onRequestReconnectRef = useRef(onRequestReconnect);

  onStateChangeRef.current = onStateChange;
  onErrorRef.current = onError;
  onConnectionStatusRef.current = onConnectionStatusChange;
  onRequestReconnectRef.current = onRequestReconnect;

  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.Disconnected);
  const [avatarStatus, setAvatarStatus] = useState<AvatarConnectionStatus>("off");

  const setStatus = useCallback((status: AvatarConnectionStatus) => {
    setAvatarStatus(status);
    onConnectionStatusRef.current?.(status);
  }, []);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const detachVideo = useCallback(() => {
    const element = videoRef.current;
    if (element) {
      element.srcObject = null;
    }
  }, []);

  const attachVideoTrack = useCallback((track: RemoteTrack) => {
    const element = videoRef.current;
    if (!element || track.kind !== Track.Kind.Video) {
      return;
    }
    track.attach(element);
    element.muted = false;
    void element.play().catch(() => {
      // autoplay may require user gesture
    });
  }, []);

  const scheduleAutoReconnect = useCallback(() => {
    if (!sessionActive) {
      return;
    }
    if (autoReconnectCountRef.current >= MAX_AUTO_RECONNECTS) {
      setStatus("lost");
      return;
    }

    clearReconnectTimer();
    setStatus("reconnecting");
    reconnectTimerRef.current = setTimeout(() => {
      autoReconnectCountRef.current += 1;
      onRequestReconnectRef.current?.();
    }, AUTO_RECONNECT_DELAY_MS);
  }, [clearReconnectTimer, sessionActive, setStatus]);

  const handleAvatarLost = useCallback(() => {
    detachVideo();
    if (sessionActive && connectionState === ConnectionState.Connected) {
      scheduleAutoReconnect();
    } else {
      setStatus("lost");
    }
  }, [connectionState, detachVideo, scheduleAutoReconnect, sessionActive, setStatus]);

  const disconnect = useCallback(async () => {
    clearReconnectTimer();
    connectGenerationRef.current += 1;

    const room = roomRef.current;
    roomRef.current = null;

    if (room) {
      room.removeAllListeners();
      await room.disconnect();
    }

    const sessionId = sessionIdRef.current;
    sessionIdRef.current = null;
    if (sessionId) {
      await endFaceSession(sessionId);
    }

    detachVideo();
    setConnectionState(ConnectionState.Disconnected);
    setStatus("off");
    onStateChangeRef.current?.("idle");
  }, [clearReconnectTimer, detachVideo, setStatus]);

  const enqueueAgentSpeech = useCallback((text: string) => {
    const cleaned = stripMarkdownForSpeech(text);
    if (!cleaned) {
      return;
    }

    speechQueueRef.current = speechQueueRef.current.then(async () => {
      const room = roomRef.current;
      if (!room) {
        onErrorRef.current?.("Avatar speech failed: face session is not active.");
        return;
      }

      onStateChangeRef.current?.("speaking");
      try {
        await speakTextViaAgent(room, cleaned);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        onErrorRef.current?.(`Avatar speech failed: ${detail}`);
      } finally {
        onStateChangeRef.current?.("listening");
      }
    });
  }, []);

  useImperativeHandle(ref, () => ({
    speak: enqueueAgentSpeech,
  }), [enqueueAgentSpeech]);

  useEffect(() => {
    if (!sessionActive) {
      autoReconnectCountRef.current = 0;
      void disconnect();
      return;
    }

    const generation = connectGenerationRef.current + 1;
    connectGenerationRef.current = generation;
    clearReconnectTimer();
    setStatus("connecting");

    let cancelled = false;

    async function connect() {
      const config = await fetchFaceSessionConfig();
      if (!config?.enabled) {
        onErrorRef.current?.("Photoreal sessions are not configured on the worker.");
        setStatus("lost");
        return;
      }

      const session = await startFaceSession();
      if (!session?.ok || !session.token) {
        onErrorRef.current?.(session?.error ?? "Could not start face session.");
        setStatus("lost");
        return;
      }

      if (cancelled || generation !== connectGenerationRef.current) {
        await endFaceSession(session.sessionId);
        return;
      }

      sessionIdRef.current = session.sessionId;
      onStateChangeRef.current?.("thinking");

      const room = new Room({
        adaptiveStream: false,
        dynacast: false,
      });
      roomRef.current = room;

      const syncAvatarPresence = () => {
        if (roomHasAvatar(room)) {
          autoReconnectCountRef.current = 0;
          clearReconnectTimer();
          setStatus("live");
          return;
        }
        setStatus("waiting");
      };

      room.on(RoomEvent.ConnectionStateChanged, (state) => {
        setConnectionState(state);
        if (state === ConnectionState.Connected) {
          onStateChangeRef.current?.("listening");
          syncAvatarPresence();
        }
        if (state === ConnectionState.Disconnected) {
          onStateChangeRef.current?.("idle");
          if (sessionActive && generation === connectGenerationRef.current) {
            handleAvatarLost();
          }
        }
      });

      room.on(RoomEvent.TrackSubscribed, (track, _publication, participant) => {
        if (isAvatarVideoParticipant(participant.identity) && track.kind === Track.Kind.Video) {
          autoReconnectCountRef.current = 0;
          clearReconnectTimer();
          setStatus("live");
          onStateChangeRef.current?.("idle");
        }
        attachVideoTrack(track);
      });

      room.on(RoomEvent.TrackUnsubscribed, (track, _publication, participant) => {
        if (track.kind === Track.Kind.Video) {
          track.detach();
          if (isAvatarVideoParticipant(participant.identity)) {
            handleAvatarLost();
          }
        }
      });

      room.on(RoomEvent.ParticipantConnected, (participant) => {
        if (isAvatarVideoParticipant(participant.identity)) {
          syncAvatarPresence();
        }
      });

      room.on(RoomEvent.ParticipantDisconnected, (participant) => {
        if (isAvatarVideoParticipant(participant.identity)) {
          handleAvatarLost();
          return;
        }
        syncAvatarPresence();
      });

      try {
        await room.connect(session.livekitUrl, session.token);
        if (cancelled || generation !== connectGenerationRef.current) {
          await room.disconnect();
          await endFaceSession(session.sessionId);
          return;
        }
        await room.localParticipant.setMicrophoneEnabled(true);
        syncAvatarPresence();
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        onErrorRef.current?.(`LiveKit connect failed: ${detail}`);
        setStatus("lost");
        await disconnect();
      }
    }

    void connect();

    return () => {
      cancelled = true;
      clearReconnectTimer();
      void disconnect();
    };
    // reconnectToken intentionally triggers a fresh room when user/auto reconnects
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionActive, reconnectToken]);

  const overlayMessage =
    avatarStatus === "reconnecting"
      ? "Avatar disconnected — reconnecting…"
      : avatarStatus === "lost"
        ? "Avatar disconnected. Tap Reconnect face below."
        : avatarStatus === "waiting"
          ? "Waiting for avatar video…"
          : avatarStatus === "connecting"
            ? "Connecting face-to-face session…"
            : null;

  const statusLabel: Record<AvatarConnectionStatus, string> = {
    off: "Session off",
    connecting: "Connecting…",
    waiting: "Waiting for avatar…",
    live: "Face-to-face live",
    reconnecting: "Reconnecting avatar…",
    lost: "Avatar disconnected",
  };

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-4">
      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-2xl border border-sag-border bg-black/40 shadow-soft">
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          playsInline
          autoPlay
        />
        {overlayMessage && sessionActive && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 px-6 text-center text-sm text-sag-muted">
            {overlayMessage}
          </div>
        )}
      </div>
      <p className="min-h-[3rem] max-w-[280px] text-center text-sm leading-relaxed text-sag-muted">
        {caption || "Speak in the room, or let Telegram messages play through the avatar."}
      </p>
      <span className="rounded-md border border-sag-border bg-white/[0.03] px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-sag-muted">
        {statusLabel[avatarStatus]}
      </span>
    </div>
  );
},
);
