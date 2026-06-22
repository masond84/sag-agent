"use client";

import type { SkillTreeBranch, SkillTreeNode, SkillTreePayload } from "@/lib/types";
import { ConstellationCard } from "./ConstellationCard";

interface SkillTreeGridProps {
  payload: SkillTreePayload | null;
  loading?: boolean;
  selectedBranchId?: string | null;
  selectedNode?: SkillTreeNode | null;
  onNodeSelect?: (node: SkillTreeNode, branch: SkillTreeBranch) => void;
  onCloseDetail?: () => void;
  onSkillUpdated?: () => void;
}

export function SkillTreeGrid({
  payload,
  loading,
  selectedBranchId,
  selectedNode,
  onNodeSelect,
  onCloseDetail,
  onSkillUpdated,
}: SkillTreeGridProps) {
  if (loading) {
    return (
      <div className="grid gap-px overflow-hidden rounded-xl border border-sag-border bg-sag-border sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="min-h-[260px] animate-pulse bg-sag-bg/80" />
        ))}
      </div>
    );
  }

  if (!payload || payload.branches.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-sag-border px-8 py-16 text-center text-sag-muted">
        Skill tree unavailable — start the worker with{" "}
        <code className="rounded bg-white/[0.05] px-1.5 py-0.5 font-mono text-xs text-sag-glow">
          HOUSE_SERVER_ENABLED=true
        </code>
      </div>
    );
  }

  return (
    <section className="space-y-8">
      <header className="space-y-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.25em] text-sag-muted">
          Skill constellation
        </p>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 className="text-2xl font-medium tracking-tight text-sag-text md:text-3xl">
            SAG capabilities
          </h2>
          <p className="text-xs text-sag-muted">
            Updated {new Date(payload.generatedAt).toLocaleString()}
          </p>
        </div>
        <p className="max-w-xl text-sm text-sag-muted">
          Hover for a preview. Click a node to inspect and configure within its branch.
        </p>
      </header>

      <div className="overflow-hidden rounded-xl border border-sag-border bg-sag-surface shadow-soft backdrop-blur-sm">
        <div className="grid auto-rows-fr gap-px bg-sag-border sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-6">
          {payload.branches.map((branch) => (
            <div key={branch.id} className="bg-sag-bg/90">
              <ConstellationCard
                branch={branch}
                expandedNode={selectedBranchId === branch.id ? selectedNode : null}
                selectedNodeId={selectedBranchId === branch.id ? selectedNode?.id : null}
                onNodeSelect={onNodeSelect}
                onCloseDetail={onCloseDetail}
                onSkillUpdated={onSkillUpdated}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
