"use client";

import type { SkillTreePayload } from "@/lib/types";
import { ConstellationCard } from "./ConstellationCard";

interface SkillTreeGridProps {
  payload: SkillTreePayload | null;
  loading?: boolean;
}

export function SkillTreeGrid({ payload, loading }: SkillTreeGridProps) {
  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            key={index}
            className="min-h-[280px] animate-pulse rounded-xl border border-white/5 bg-white/5"
          />
        ))}
      </div>
    );
  }

  if (!payload || payload.branches.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-white/15 p-12 text-center text-white/50">
        Skill tree unavailable — start the worker with{" "}
        <code className="text-sag-glow">HOUSE_SERVER_ENABLED=true</code>
      </div>
    );
  }

  return (
    <section>
      <header className="mb-6 flex items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-sag-glow/70">Constellation Map</p>
          <h2 className="font-display text-3xl text-sag-star">SAG Skill Tree</h2>
        </div>
        <p className="text-xs text-white/40">
          Updated {new Date(payload.generatedAt).toLocaleString()}
        </p>
      </header>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
        {payload.branches.map((branch) => (
          <ConstellationCard key={branch.id} branch={branch} />
        ))}
      </div>
    </section>
  );
}
