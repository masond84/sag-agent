"use client";

import { useState } from "react";
import { SkillDetailPanel } from "@/components/SkillDetailPanel";
import type { SkillTreeBranch, SkillTreeNode } from "@/lib/types";
import { BRANCH_THEMES, UI_ACCENT, UI_ACCENT_BRIGHT } from "@/lib/types";

interface ConstellationCardProps {
  branch: SkillTreeBranch;
  expandedNode?: SkillTreeNode | null;
  selectedNodeId?: string | null;
  onNodeSelect?: (node: SkillTreeNode, branch: SkillTreeBranch) => void;
  onCloseDetail?: () => void;
  onSkillUpdated?: () => void;
}

export function ConstellationCard({
  branch,
  expandedNode,
  selectedNodeId,
  onNodeSelect,
  onCloseDetail,
  onSkillUpdated,
}: ConstellationCardProps) {
  const theme = BRANCH_THEMES[branch.theme];
  const xpPercent = branch.xpMax > 0 ? (branch.xp / branch.xpMax) * 100 : 0;
  const [hoveredNode, setHoveredNode] = useState<SkillTreeNode | null>(null);
  const isExpanded = Boolean(expandedNode);

  return (
    <article
      className={`group relative flex flex-col transition-colors duration-300 ${
        isExpanded
          ? "min-h-[440px] bg-sag-elevated/60 sm:col-span-2 xl:col-span-2 2xl:col-span-2"
          : "min-h-[260px] hover:bg-white/[0.02]"
      }`}
    >
      <div className="flex min-h-0 flex-1 flex-col p-5 md:p-6">
        {isExpanded && expandedNode ? (
          <SkillDetailPanel
            embedded
            node={expandedNode}
            branch={branch}
            onClose={() => onCloseDetail?.()}
            onUpdated={() => onSkillUpdated?.()}
          />
        ) : (
          <>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-sag-muted">
                  {branch.name}
                </p>
                <p className="mt-0.5 font-mono text-xs text-sag-muted/80">
                  {branch.perksUnlocked}/{branch.perksTotal} perks
                </p>
              </div>
              <span className="font-mono text-sm tabular-nums text-sag-text/70">{branch.level}</span>
            </div>

            <div className="relative flex flex-1 items-center justify-center py-2">
              <ConstellationSvg
                branch={branch}
                accent={theme.accent}
                accentBright={UI_ACCENT_BRIGHT}
                selectedNodeId={selectedNodeId}
                onHover={setHoveredNode}
                onSelect={(node) => onNodeSelect?.(node, branch)}
              />
              {hoveredNode && <NodeTooltip node={hoveredNode} />}
            </div>

            <footer className="mt-4 space-y-2.5">
              <div className="h-px w-full bg-gradient-to-r from-transparent via-sag-border to-transparent" />
              <div className="h-[3px] overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-sag-muted/40 to-sag-accent/80 transition-all duration-700"
                  style={{ width: `${xpPercent}%` }}
                />
              </div>
            </footer>
          </>
        )}
      </div>
    </article>
  );
}

function NodeTooltip({ node }: { node: SkillTreeNode }) {
  return (
    <div
      className="pointer-events-none absolute bottom-0 left-1/2 z-20 w-[min(100%,240px)] -translate-x-1/2 rounded-lg border border-sag-border bg-sag-bg/95 px-4 py-3 shadow-soft backdrop-blur-md"
      role="tooltip"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-sag-text">{node.label}</p>
        <StatusChip status={node.status} />
      </div>
      {node.skillName && (
        <p className="mt-1.5 text-[10px] uppercase tracking-wider text-sag-muted">
          {node.skillName}
          {node.skillKind ? ` · ${node.skillKind}` : ""}
        </p>
      )}
      <p className="mt-2 text-xs leading-relaxed text-sag-muted">{node.description}</p>
    </div>
  );
}

function StatusChip({ status }: { status: SkillTreeNode["status"] }) {
  const styles: Record<SkillTreeNode["status"], string> = {
    unlocked: "text-sag-glow bg-white/[0.08]",
    locked: "text-sag-muted bg-white/[0.04]",
    planned: "text-sag-muted/70 bg-white/[0.03]",
  };
  const labels: Record<SkillTreeNode["status"], string> = {
    unlocked: "Active",
    locked: "Locked",
    planned: "Planned",
  };

  return (
    <span className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] uppercase tracking-wide ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

function ConstellationSvg({
  branch,
  accent,
  accentBright,
  selectedNodeId,
  onHover,
  onSelect,
}: {
  branch: SkillTreeBranch;
  accent: string;
  accentBright: string;
  selectedNodeId?: string | null;
  onHover: (node: SkillTreeNode | null) => void;
  onSelect: (node: SkillTreeNode) => void;
}) {
  const nodeMap = new Map(branch.nodes.map((node) => [node.id, node]));

  return (
    <svg viewBox="0 0 100 100" className="h-full w-full max-h-[160px]">
      {branch.edges.map(([from, to]) => {
        const a = nodeMap.get(from);
        const b = nodeMap.get(to);
        if (!a || !b) {
          return null;
        }
        const lit = a.unlocked && b.unlocked;
        return (
          <line
            key={`${from}-${to}`}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            stroke={lit ? accent : UI_ACCENT}
            strokeOpacity={lit ? 0.55 : 0.15}
            strokeWidth={lit ? 0.5 : 0.35}
          />
        );
      })}
      {branch.nodes.map((node) => (
        <g
          key={node.id}
          onMouseEnter={() => onHover(node)}
          onMouseLeave={() => onHover(null)}
          onClick={() => onSelect(node)}
          className="cursor-pointer"
        >
          {node.unlocked && (
            <circle cx={node.x} cy={node.y} r={3.5} fill={accent} opacity={0.2} />
          )}
          {selectedNodeId === node.id && (
            <circle
              cx={node.x}
              cy={node.y}
              r={5.5}
              fill="none"
              stroke={accentBright}
              strokeOpacity={0.7}
              strokeWidth={0.6}
            />
          )}
          <circle cx={node.x} cy={node.y} r={5} fill="transparent" />
          <circle
            cx={node.x}
            cy={node.y}
            r={node.unlocked ? 2 : 1.2}
            fill={node.unlocked ? accentBright : "rgba(255,255,255,0.25)"}
            opacity={node.unlocked ? 0.95 : 0.5}
          />
        </g>
      ))}
    </svg>
  );
}
