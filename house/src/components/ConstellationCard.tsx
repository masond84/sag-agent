"use client";

import { useState } from "react";
import type { SkillTreeBranch, SkillTreeNode } from "@/lib/types";
import { BRANCH_THEMES } from "@/lib/types";

interface ConstellationCardProps {
  branch: SkillTreeBranch;
  selectedNodeId?: string | null;
  onNodeSelect?: (node: SkillTreeNode, branch: SkillTreeBranch) => void;
}

export function ConstellationCard({ branch, selectedNodeId, onNodeSelect }: ConstellationCardProps) {
  const theme = BRANCH_THEMES[branch.theme];
  const xpPercent = branch.xpMax > 0 ? (branch.xp / branch.xpMax) * 100 : 0;
  const [hoveredNode, setHoveredNode] = useState<SkillTreeNode | null>(null);

  return (
    <article
      className="relative flex min-h-[280px] flex-col overflow-hidden rounded-xl border border-white/10 shadow-nebula"
      style={{
        background: `linear-gradient(160deg, ${theme.from} 0%, ${theme.via} 45%, ${theme.to} 100%)`,
      }}
    >
      <div className="absolute inset-0 opacity-30">
        <Starfield />
      </div>

      <div className="relative flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between">
          <span className="font-mono text-xs text-white/80">
            {branch.perksUnlocked}/{branch.perksTotal}
          </span>
          <span className="font-mono text-xs text-white/60">{branch.level}</span>
        </div>

        <div className="relative my-2 flex flex-1 items-center justify-center">
          <ConstellationSvg
            branch={branch}
            accent={theme.accent}
            selectedNodeId={selectedNodeId}
            onHover={setHoveredNode}
            onSelect={(node) => onNodeSelect?.(node, branch)}
          />
          {hoveredNode && (
            <NodeTooltip node={hoveredNode} accent={theme.accent} />
          )}
        </div>

        <footer className="relative mt-auto space-y-2">
          <div className="flex items-end justify-between gap-2">
            <h3 className="font-display text-sm font-bold uppercase tracking-widest text-white">
              {branch.name}
            </h3>
            <span className="font-mono text-lg text-white/90">{branch.level}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-black/30">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${xpPercent}%`, backgroundColor: theme.accent }}
            />
          </div>
        </footer>
      </div>
    </article>
  );
}

function NodeTooltip({ node, accent }: { node: SkillTreeNode; accent: string }) {
  return (
    <div
      className="pointer-events-none absolute bottom-2 left-1/2 z-20 w-[min(100%,220px)] -translate-x-1/2 rounded-lg border border-white/15 bg-black/85 px-3 py-2.5 text-left shadow-lg backdrop-blur-sm"
      role="tooltip"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="font-display text-sm font-semibold text-white">{node.label}</p>
        <StatusChip status={node.status} accent={accent} />
      </div>
      {node.skillName && (
        <p className="mt-1 text-[10px] uppercase tracking-wider text-white/45">
          {node.skillName}
          {node.skillKind ? ` · ${node.skillKind}` : ""}
        </p>
      )}
      <p className="mt-1.5 text-xs leading-relaxed text-white/75">{node.description}</p>
    </div>
  );
}

function StatusChip({ status, accent }: { status: SkillTreeNode["status"]; accent: string }) {
  const styles: Record<SkillTreeNode["status"], string> = {
    unlocked: "text-emerald-200 bg-emerald-500/20",
    locked: "text-amber-200 bg-amber-500/20",
    planned: "text-white/50 bg-white/10",
  };
  const labels: Record<SkillTreeNode["status"], string> = {
    unlocked: "Active",
    locked: "Locked",
    planned: "Planned",
  };

  return (
    <span
      className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${styles[status]}`}
      style={status === "unlocked" ? { boxShadow: `0 0 8px ${accent}33` } : undefined}
    >
      {labels[status]}
    </span>
  );
}

function ConstellationSvg({
  branch,
  accent,
  selectedNodeId,
  onHover,
  onSelect,
}: {
  branch: SkillTreeBranch;
  accent: string;
  selectedNodeId?: string | null;
  onHover: (node: SkillTreeNode | null) => void;
  onSelect: (node: SkillTreeNode) => void;
}) {
  const nodeMap = new Map(branch.nodes.map((node) => [node.id, node]));

  return (
    <svg viewBox="0 0 100 100" className="h-full w-full max-h-[180px]">
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
            stroke={lit ? accent : "rgba(255,255,255,0.15)"}
            strokeWidth={lit ? 0.6 : 0.35}
            opacity={lit ? 0.9 : 0.4}
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
            <circle cx={node.x} cy={node.y} r={4} fill={accent} opacity={0.25} />
          )}
          {selectedNodeId === node.id && (
            <circle
              cx={node.x}
              cy={node.y}
              r={6}
              fill="none"
              stroke={accent}
              strokeWidth={0.8}
              opacity={0.9}
            />
          )}
          <circle
            cx={node.x}
            cy={node.y}
            r={5}
            fill="transparent"
            className="pointer-events-auto"
          />
          <circle
            cx={node.x}
            cy={node.y}
            r={node.unlocked ? 2.2 : 1.2}
            fill={node.unlocked ? "#f5f0dc" : "rgba(255,255,255,0.35)"}
            className="pointer-events-none"
            style={
              node.unlocked
                ? { filter: `drop-shadow(0 0 4px ${accent})` }
                : undefined
            }
          />
        </g>
      ))}
    </svg>
  );
}

function Starfield() {
  const stars = [
    [12, 18], [78, 24], [45, 12], [88, 55], [22, 72], [62, 80], [35, 45], [70, 38],
  ];
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full">
      {stars.map(([x, y], index) => (
        <circle key={index} cx={x} cy={y} r={0.4} fill="white" opacity={0.5} />
      ))}
    </svg>
  );
}
