"use client";

import { useState } from "react";
import type { SkillTreeBranch, SkillTreeNode } from "@/lib/types";
import { tooltipCopy } from "@/lib/node-tooltip";
import { BRANCH_THEMES, UI_ACCENT, UI_ACCENT_BRIGHT } from "@/lib/types";

interface ConstellationCardProps {
  branch: SkillTreeBranch;
  isActive?: boolean;
  onNodeSelect?: (node: SkillTreeNode, branch: SkillTreeBranch) => void;
}

export function ConstellationCard({ branch, isActive = false, onNodeSelect }: ConstellationCardProps) {
  const theme = BRANCH_THEMES[branch.theme];
  const xpPercent = branch.xpMax > 0 ? (branch.xp / branch.xpMax) * 100 : 0;
  const [hoveredNode, setHoveredNode] = useState<SkillTreeNode | null>(null);

  return (
    <article
      className={`group relative flex min-h-[240px] flex-col transition-colors duration-200 ${
        isActive ? "bg-white/[0.03]" : "hover:bg-white/[0.02]"
      }`}
    >
      <div className="flex min-h-0 flex-1 flex-col p-4 md:p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-sag-muted">
              {branch.name}
            </p>
            <p className="mt-0.5 font-mono text-[11px] text-sag-muted/80">
              {branch.perksUnlocked}/{branch.perksTotal}
            </p>
          </div>
          <span className="font-mono text-sm tabular-nums text-sag-text/70">{branch.level}</span>
        </div>

        <div
          className="relative flex flex-1 items-center justify-center py-1"
          onMouseLeave={() => setHoveredNode(null)}
        >
          <ConstellationSvg
            branch={branch}
            accent={theme.accent}
            accentBright={UI_ACCENT_BRIGHT}
            onHover={setHoveredNode}
            onSelect={(node) => {
              setHoveredNode(null);
              onNodeSelect?.(node, branch);
            }}
          />
          {hoveredNode && <NodeTooltip node={hoveredNode} />}
        </div>

        <footer className="mt-3 space-y-2">
          <div className="h-px w-full bg-gradient-to-r from-transparent via-sag-border to-transparent" />
          <div className="h-[3px] overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-sag-muted/40 to-sag-accent/80 transition-all duration-700"
              style={{ width: `${xpPercent}%` }}
            />
          </div>
        </footer>
      </div>
      {isActive && (
        <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-sag-accent/50 to-transparent" />
      )}
    </article>
  );
}

function NodeTooltip({ node }: { node: SkillTreeNode }) {
  const meta = [node.skillName, node.skillKind].filter(Boolean).join(" · ");
  const copy = tooltipCopy(node.id, node.description);
  const showBelow = node.y < 30;

  return (
    <div
      className="pointer-events-none absolute z-30 min-w-[160px] max-w-[240px] rounded-md border border-sag-border bg-sag-bg/95 px-3 py-2.5 shadow-soft backdrop-blur-md"
      style={{
        left: `${node.x}%`,
        top: `${node.y}%`,
        transform: showBelow
          ? "translate(-50%, calc(100% + 10px))"
          : "translate(-50%, calc(-100% - 10px))",
      }}
      role="tooltip"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium leading-snug text-sag-text">{node.label}</p>
        <StatusChip status={node.status} />
      </div>
      {meta && (
        <p className="mt-1 text-[10px] uppercase tracking-wide text-sag-muted">{meta}</p>
      )}
      <p className="mt-1.5 text-[11px] leading-snug text-sag-muted">{copy}</p>
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
    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] uppercase tracking-wide ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

function ConstellationSvg({
  branch,
  accent,
  accentBright,
  onHover,
  onSelect,
}: {
  branch: SkillTreeBranch;
  accent: string;
  accentBright: string;
  onHover: (node: SkillTreeNode | null) => void;
  onSelect: (node: SkillTreeNode) => void;
}) {
  const nodeMap = new Map(branch.nodes.map((node) => [node.id, node]));

  return (
    <svg
      viewBox="0 0 100 100"
      className="h-full w-full max-h-[140px] select-none outline-none [&_*]:outline-none"
    >
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
