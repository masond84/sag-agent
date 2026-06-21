"use client";

import { useEffect, useRef, useState } from "react";
import type { FaceState } from "@/lib/types";
import { stripMarkdownForSpeech } from "@/lib/worker";

interface PresenceAvatarProps {
  state: FaceState;
  amplitude: number;
}

export function PresenceAvatar({ state, amplitude }: PresenceAvatarProps) {
  const scale = 1 + amplitude * 0.35;
  const glow = 0.35 + amplitude * 0.65;

  return (
    <div className="relative flex h-56 w-56 items-center justify-center">
      <div
        className="absolute inset-0 rounded-full blur-3xl transition-opacity duration-150"
        style={{
          opacity: glow,
          background:
            state === "speaking"
              ? "radial-gradient(circle, rgba(255,184,106,0.55) 0%, transparent 70%)"
              : "radial-gradient(circle, rgba(126,184,255,0.45) 0%, transparent 70%)",
        }}
      />
      <div
        className="relative flex h-40 w-40 items-center justify-center rounded-full border border-white/10 bg-gradient-to-br from-slate-800/80 to-slate-950/90 shadow-nebula transition-transform duration-75"
        style={{ transform: `scale(${scale})` }}
      >
        <div className="absolute inset-3 rounded-full border border-white/5" />
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
      className={`h-3 w-3 rounded-full bg-sag-star shadow-[0_0_12px_rgba(245,240,220,0.8)] transition-all duration-300 ${
        blink ? "animate-pulse" : ""
      }`}
    />
  );
}

function Mouth({ amplitude, state }: { amplitude: number; state: FaceState }) {
  const open = state === "speaking" ? 4 + amplitude * 18 : state === "thinking" ? 3 : 2;
  return (
    <div
      className="rounded-full bg-sag-star/90 transition-all duration-75"
      style={{
        width: state === "speaking" ? 18 + amplitude * 10 : 14,
        height: open,
      }}
    />
  );
}

function OrbitalRing() {
  return (
    <svg className="absolute inset-0 h-full w-full animate-[spin_24s_linear_infinite]" viewBox="0 0 200 200">
      <circle
        cx="100"
        cy="100"
        r="92"
        fill="none"
        stroke="rgba(126,184,255,0.15)"
        strokeDasharray="4 8"
        strokeWidth="1"
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
    <section className="flex flex-col items-center gap-6 rounded-2xl border border-white/10 bg-sag-panel/80 p-8 backdrop-blur-sm">
      <header className="w-full text-center">
        <p className="text-xs uppercase tracking-[0.35em] text-sag-glow/70">SAG Presence</p>
        <h2 className="mt-1 font-display text-2xl text-sag-star">Tier 1 — Voice Shell</h2>
      </header>
      <PresenceAvatar state={state} amplitude={amplitude} />
      <p className="min-h-[4.5rem] max-w-md text-center text-sm leading-relaxed text-white/75">
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
  const colors: Record<FaceState, string> = {
    idle: "bg-white/10 text-white/60",
    listening: "bg-teal-500/20 text-teal-200",
    speaking: "bg-amber-500/20 text-amber-200",
    thinking: "bg-blue-500/20 text-blue-200",
  };

  return (
    <span className={`rounded-full px-3 py-1 text-xs uppercase tracking-wider ${colors[state]}`}>
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
