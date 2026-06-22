"use client";

import { useEffect, useRef, useState } from "react";
import type { FaceState } from "@/lib/types";
import { stripMarkdownForSpeech } from "@/lib/worker";

interface PresenceAvatarProps {
  state: FaceState;
  amplitude: number;
}

export function PresenceAvatar({ state, amplitude }: PresenceAvatarProps) {
  const scale = 1 + amplitude * 0.25;
  const glow = 0.2 + amplitude * 0.45;

  return (
    <div className="relative flex h-52 w-52 items-center justify-center">
      <div
        className="absolute inset-0 rounded-full blur-3xl transition-opacity duration-150"
        style={{
          opacity: glow,
          background:
            "radial-gradient(circle, rgba(154,168,190,0.35) 0%, transparent 70%)",
        }}
      />
      <div
        className="relative flex h-36 w-36 items-center justify-center rounded-full border border-sag-border bg-gradient-to-br from-white/[0.06] to-white/[0.02] shadow-soft transition-transform duration-75"
        style={{ transform: `scale(${scale})` }}
      >
        <div className="absolute inset-3 rounded-full border border-white/[0.04]" />
        <div className="flex flex-col items-center gap-3">
          <div className="flex gap-4">
            <Eye state={state} />
            <Eye state={state} />
          </div>
          <Mouth amplitude={amplitude} state={state} />
        </div>
      </div>
      <OrbitalRing />
    </div>
  );
}

function Eye({ state }: { state: FaceState }) {
  const blink = state === "idle";
  return (
    <div
      className={`h-2.5 w-2.5 rounded-full bg-sag-glow shadow-[0_0_10px_rgba(180,192,212,0.5)] transition-all duration-300 ${
        blink ? "animate-pulse" : ""
      }`}
    />
  );
}

function Mouth({ amplitude, state }: { amplitude: number; state: FaceState }) {
  const open = state === "speaking" ? 4 + amplitude * 16 : state === "thinking" ? 3 : 2;
  return (
    <div
      className="rounded-full bg-sag-glow/90 transition-all duration-75"
      style={{
        width: state === "speaking" ? 16 + amplitude * 8 : 12,
        height: open,
      }}
    />
  );
}

function OrbitalRing() {
  return (
    <svg className="absolute inset-0 h-full w-full animate-[spin_28s_linear_infinite]" viewBox="0 0 200 200">
      <circle
        cx="100"
        cy="100"
        r="92"
        fill="none"
        stroke="rgba(154,168,190,0.12)"
        strokeDasharray="3 10"
        strokeWidth="0.75"
      />
    </svg>
  );
}

interface FacePanelProps {
  caption: string;
  state: FaceState;
  onAmplitude?: (value: number) => void;
}

export function FacePanel({ caption, state }: FacePanelProps) {
  const [amplitude, setAmplitude] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (state !== "speaking") {
      setAmplitude(0);
      return;
    }

    let tick = 0;
    const animate = () => {
      tick += 0.15;
      setAmplitude(0.25 + Math.abs(Math.sin(tick)) * 0.55 + Math.random() * 0.1);
      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [state]);

  return (
    <section className="flex flex-col items-center gap-6 border-b border-sag-border pb-8">
      <header className="w-full space-y-1 text-center">
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-sag-muted">
          SAG Presence
        </p>
        <h2 className="text-lg font-medium tracking-tight text-sag-text">Tier 1 — Voice Shell</h2>
      </header>
      <PresenceAvatar state={state} amplitude={amplitude} />
      <p className="min-h-[4rem] max-w-[260px] text-center text-sm leading-relaxed text-sag-muted">
        {caption || "Waiting for SAG to speak…"}
      </p>
      <StatusBadge state={state} />
    </section>
  );
}

function StatusBadge({ state }: { state: FaceState }) {
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

export async function speakText(text: string, onStart?: () => void, onEnd?: () => void): Promise<void> {
  const cleaned = stripMarkdownForSpeech(text);
  if (!cleaned) {
    return;
  }

  onStart?.();

  try {
    const response = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: cleaned }),
    });

    if (response.ok && response.headers.get("Content-Type")?.includes("audio")) {
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      await playAudioUrl(url);
      URL.revokeObjectURL(url);
      onEnd?.();
      return;
    }
  } catch {
    // fall through to Web Speech API
  }

  await speakWithWebSpeech(cleaned);
  onEnd?.();
}

function playAudioUrl(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const audio = new Audio(url);
    audio.onended = () => resolve();
    audio.onerror = () => reject(new Error("Audio playback failed"));
    void audio.play().catch(reject);
  });
}

function speakWithWebSpeech(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      resolve();
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    window.speechSynthesis.speak(utterance);
  });
}
