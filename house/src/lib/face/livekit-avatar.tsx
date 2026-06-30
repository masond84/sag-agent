"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import {
  ConnectionState,
  Room,
  RoomEvent,
  Track,
  type RemoteTrack,
  type RemoteTrackPublication,
  type RemoteParticipant,
} from "livekit-client";
import { isAvatarVideoParticipant, speakTextViaAgent } from "@/lib/face/agent-speak";
import type { AvatarConnectionStatus, FaceRendererProps, LiveKitAvatarHandle } from "@/lib/face/types";
import type { FaceState } from "@/lib/types";
import { endFaceSession, fetchFaceSessionConfig, startFaceSession } from "@/lib/face/session";
import { stripMarkdownForSpeech } from "@/lib/worker";

const AUTO_RECONNECT_DELAY_MS = 4_000;
const AVATAR_LOSS_GRACE_MS = 8_000;
const MAX_AUTO_RECONNECTS = 12;

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
      expanded,
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
  const audioRef = useRef<HTMLAudioElement>(null);
  const roomRef = useRef<Room | null>(null);
  const pendingAudioUnlockRef = useRef(false);
  const sessionIdRef = useRef<string | null>(null);
  const connectGenerationRef = useRef(0);
  const autoReconnectCountRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const avatarLossTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  const [audioBlocked, setAudioBlocked] = useState(false);

  const unlockRoomAudio = useCallback(async () => {
    pendingAudioUnlockRef.current = true;
    const room = roomRef.current;
    if (!room || room.state !== ConnectionState.Connected) {
      return;
    }

    try {
      await room.startAudio();
      setAudioBlocked(false);
      pendingAudioUnlockRef.current = false;
    } catch {
      setAudioBlocked(true);
    }
  }, []);

  const tryUnlockAfterConnect = useCallback(async (room: Room) => {
    if (!pendingAudioUnlockRef.current) {
      return;
    }
    try {
      await room.startAudio();
      setAudioBlocked(false);
      pendingAudioUnlockRef.current = false;
    } catch {
      setAudioBlocked(!room.canPlaybackAudio);
    }
  }, []);

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

  const clearAvatarLossTimer = useCallback(() => {
    if (avatarLossTimerRef.current) {
      clearTimeout(avatarLossTimerRef.current);
      avatarLossTimerRef.current = null;
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
      setAudioBlocked(true);
    });
  }, []);

  const attachAudioTrack = useCallback(async (track: RemoteTrack) => {
    if (track.kind !== Track.Kind.Audio) {
      return;
    }

    const room = roomRef.current;
    if (room) {
      try {
        await room.startAudio();
      } catch {
        setAudioBlocked(true);
      }
    }

    const element = audioRef.current;
    if (element) {
      track.attach(element);
      element.muted = false;
      void element.play().catch(() => {
        setAudioBlocked(true);
      });
      setAudioBlocked(false);
      return;
    }

    track.attach();
    setAudioBlocked(false);
  }, []);

  const syncRemoteAvatarTracks = useCallback((room: Room) => {
    for (const participant of room.remoteParticipants.values()) {
      if (!isAvatarVideoParticipant(participant.identity)) {
        continue;
      }
      for (const publication of participant.trackPublications.values()) {
        const track = publication.track;
        if (!track || track.kind === Track.Kind.Video) {
          if (track?.kind === Track.Kind.Video) {
            attachVideoTrack(track as RemoteTrack);
          }
          continue;
        }
        if (track.kind === Track.Kind.Audio) {
          void attachAudioTrack(track as RemoteTrack);
        }
      }
    }
  }, [attachAudioTrack, attachVideoTrack]);

  const attachAvatarTrack = useCallback((track: RemoteTrack, participant: RemoteParticipant) => {
    if (!isAvatarVideoParticipant(participant.identity)) {
      return;
    }
    if (track.kind === Track.Kind.Video) {
      attachVideoTrack(track);
      return;
    }
    if (track.kind === Track.Kind.Audio) {
      void attachAudioTrack(track);
    }
  }, [attachAudioTrack, attachVideoTrack]);

  const teardownCurrentSession = useCallback(async () => {
    clearReconnectTimer();
    clearAvatarLossTimer();

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
  }, [clearAvatarLossTimer, clearReconnectTimer, detachVideo]);

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

  const scheduleAvatarLossCheck = useCallback(() => {
    if (!sessionActive) {
      return;
    }

    clearAvatarLossTimer();
    setAvatarStatus((current) => {
      const next: AvatarConnectionStatus = current === "live" ? "waiting" : current;
      onConnectionStatusRef.current?.(next);
      return next;
    });

    avatarLossTimerRef.current = setTimeout(() => {
      const room = roomRef.current;
      if (!room || room.state !== ConnectionState.Connected) {
        detachVideo();
        scheduleAutoReconnect();
        return;
      }

      if (roomHasAvatar(room)) {
        syncRemoteAvatarTracks(room);
        autoReconnectCountRef.current = 0;
        setStatus("live");
        return;
      }

      detachVideo();
      scheduleAutoReconnect();
    }, AVATAR_LOSS_GRACE_MS);
  }, [
    clearAvatarLossTimer,
    detachVideo,
    scheduleAutoReconnect,
    sessionActive,
    setStatus,
    syncRemoteAvatarTracks,
  ]);

  const disconnect = useCallback(async () => {
    connectGenerationRef.current += 1;
    await teardownCurrentSession();
    setConnectionState(ConnectionState.Disconnected);
    setStatus("off");
    onStateChangeRef.current?.("idle");
  }, [setStatus, teardownCurrentSession]);

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
        onStateChangeRef.current?.("idle");
      }
    });
  }, []);

  useImperativeHandle(ref, () => ({
    speak: enqueueAgentSpeech,
    unlockAudio: async () => {
      pendingAudioUnlockRef.current = true;
      await unlockRoomAudio();
    },
  }), [enqueueAgentSpeech, unlockRoomAudio]);

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
      if (cancelled || generation !== connectGenerationRef.current) {
        return;
      }

      await teardownCurrentSession();
      if (cancelled || generation !== connectGenerationRef.current) {
        return;
      }

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
          clearAvatarLossTimer();
          setStatus("live");
          return;
        }
        setStatus("waiting");
      };

      room.on(RoomEvent.ConnectionStateChanged, (state) => {
        setConnectionState(state);
        if (state === ConnectionState.Connected) {
          onStateChangeRef.current?.("idle");
          syncAvatarPresence();
        }
        if (state === ConnectionState.Disconnected) {
          onStateChangeRef.current?.("idle");
          clearAvatarLossTimer();
          if (sessionActive && generation === connectGenerationRef.current) {
            detachVideo();
            scheduleAutoReconnect();
          }
        }
      });

      room.on(RoomEvent.TrackSubscribed, (track, _publication, participant) => {
        if (isAvatarVideoParticipant(participant.identity) && track.kind === Track.Kind.Video) {
          autoReconnectCountRef.current = 0;
          clearReconnectTimer();
          clearAvatarLossTimer();
          setStatus("live");
          onStateChangeRef.current?.("idle");
        }
        attachAvatarTrack(track, participant);
      });

      room.on(RoomEvent.TrackPublished, (publication, participant) => {
        if (!isAvatarVideoParticipant(participant.identity)) {
          return;
        }
        if (publication.kind === Track.Kind.Audio && !publication.isSubscribed) {
          publication.setSubscribed(true);
        }
      });

      room.on(RoomEvent.TrackUnsubscribed, (track, _publication, participant) => {
        track.detach();
        if (track.kind === Track.Kind.Video && isAvatarVideoParticipant(participant.identity)) {
          scheduleAvatarLossCheck();
        }
      });

      room.on(RoomEvent.AudioPlaybackStatusChanged, () => {
        const room = roomRef.current;
        if (room) {
          setAudioBlocked(!room.canPlaybackAudio);
        }
      });

      room.on(RoomEvent.ParticipantConnected, (participant) => {
        if (isAvatarVideoParticipant(participant.identity)) {
          clearAvatarLossTimer();
          syncAvatarPresence();
          syncRemoteAvatarTracks(room);
        }
      });

      room.on(RoomEvent.ParticipantDisconnected, (participant) => {
        if (isAvatarVideoParticipant(participant.identity)) {
          scheduleAvatarLossCheck();
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
        await tryUnlockAfterConnect(room);
        syncRemoteAvatarTracks(room);
        setAudioBlocked(!room.canPlaybackAudio);
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
      clearAvatarLossTimer();
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
    <div
      className={`flex w-full flex-col items-center gap-4 transition-all duration-300 ${
        expanded ? "max-w-2xl" : "max-w-sm"
      }`}
    >
      <div
        className="relative aspect-[3/4] w-full overflow-hidden rounded-2xl border border-sag-border bg-black/40 shadow-soft"
        onPointerDown={() => {
          void unlockRoomAudio();
        }}
      >
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          playsInline
          autoPlay
        />
        <audio ref={audioRef} autoPlay playsInline style={{ position: "absolute", width: 0, height: 0, opacity: 0 }} />
        {overlayMessage && sessionActive && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 px-6 text-center text-sm text-sag-muted">
            {overlayMessage}
          </div>
        )}
        {audioBlocked && sessionActive && avatarStatus === "live" && !overlayMessage && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-black/70 px-4 py-2 text-center text-xs text-amber-100/90">
            Tap the face or Test voice to enable sound
          </div>
        )}
      </div>
      <p
        className={`text-center leading-relaxed text-sag-muted ${
          expanded ? "min-h-[3rem] max-w-lg text-base" : "min-h-[3rem] max-w-[280px] text-sm"
        }`}
      >
        {caption || "Telegram and House activity play through the avatar. Mic input is off."}
      </p>
      <span className="rounded-md border border-sag-border bg-white/[0.03] px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-sag-muted">
        {statusLabel[avatarStatus]}
      </span>
    </div>
  );
},
);
