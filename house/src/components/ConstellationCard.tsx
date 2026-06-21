"use client";

import type { SkillTreeBranch } from "@/lib/types";
import { BRANCH_THEMES } from "@/lib/types";

interface ConstellationCardProps {
  branch: SkillTreeBranch;
}

export function ConstellationCard({ branch }: ConstellationCardProps) {
  const theme = BRANCH_THEMES[branch.theme];
  const xpPercent = branch.xpMax > 0 ? (branch.xp / branch.xpMax) * 100 : 0;

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
          <ConstellationSvg branch={branch} accent={theme.accent} />
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

function ConstellationSvg({ branch, accent }: { branch: SkillTreeBranch; accent: string }) {
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
        <g key={node.id}>
          {node.unlocked && (
            <circle cx={node.x} cy={node.y} r={4} fill={accent} opacity={0.25} />
          )}
          <circle
            cx={node.x}
            cy={node.y}
            r={node.unlocked ? 2.2 : 1.2}
            fill={node.unlocked ? "#f5f0dc" : "rgba(255,255,255,0.35)"}
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
