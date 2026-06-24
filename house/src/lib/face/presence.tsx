"use client";

import type { FaceRendererProps } from "@/lib/face/types";
import type { FaceState } from "@/lib/types";

export function PresenceFaceRenderer({ state, amplitude }: FaceRendererProps) {
  return (
    <div className="relative flex h-52 w-52 items-center justify-center">
      <div
        className="absolute inset-0 rounded-full blur-3xl transition-opacity duration-150"
        style={{
          opacity: 0.2 + amplitude * 0.45,
          background: "radial-gradient(circle, rgba(154,168,190,0.35) 0%, transparent 70%)",
        }}
      />
      <div
        className="relative flex h-36 w-36 items-center justify-center rounded-full border border-sag-border bg-gradient-to-br from-white/[0.06] to-white/[0.02] shadow-soft transition-transform duration-75"
        style={{ transform: `scale(${1 + amplitude * 0.25})` }}
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
