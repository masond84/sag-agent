"use client";

import { useEffect, useState } from "react";
import type { SkillNodeDetail, SkillTreeBranch, SkillTreeNode } from "@/lib/types";
import { BRANCH_THEMES } from "@/lib/types";
import { fetchSkillNodeDetail, toggleSkill } from "@/lib/worker";

interface SkillDetailPanelProps {
  node: SkillTreeNode;
  branch: SkillTreeBranch;
  onClose: () => void;
  onUpdated: () => void;
}

export function SkillDetailPanel({ node, branch, onClose, onUpdated }: SkillDetailPanelProps) {
  const theme = BRANCH_THEMES[branch.theme];
  const [detail, setDetail] = useState<SkillNodeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmDisable, setConfirmDisable] = useState(false);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);
    setConfirmDisable(false);

    void fetchSkillNodeDetail(node.id).then((payload) => {
      if (!mounted) {
        return;
      }
      setDetail(payload);
      setLoading(false);
      if (!payload) {
        setError("Could not load skill detail.");
      }
    });

    return () => {
      mounted = false;
    };
  }, [node.id]);

  async function handleToggle(enabled: boolean) {
    if (!detail?.skillId || !detail.configurable) {
      return;
    }

    if (!enabled && detail.disableImpact && !confirmDisable) {
      setConfirmDisable(true);
      return;
    }

    setToggling(true);
    setError(null);
    setNotice(null);

    try {
      const result = await toggleSkill(detail.skillId, enabled);
      if (!result) {
        throw new Error("Toggle failed");
      }
      setNotice(result.restart.message);
      setConfirmDisable(false);
      const refreshed = await fetchSkillNodeDetail(node.id);
      setDetail(refreshed);
      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Toggle failed");
    } finally {
      setToggling(false);
    }
  }

  return (
    <aside className="rounded-2xl border border-white/15 bg-sag-panel/95 shadow-nebula backdrop-blur-md">
      <header
        className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4"
        style={{ borderColor: `${theme.accent}33` }}
      >
        <div>
          <p className="text-[10px] uppercase tracking-[0.35em] text-white/45">{branch.name}</p>
          <h3 className="font-display text-xl text-sag-star">{node.label}</h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-white/10 px-2.5 py-1 text-xs text-white/50 hover:bg-white/5 hover:text-white"
        >
          Close
        </button>
      </header>

      <div className="max-h-[70vh] space-y-5 overflow-y-auto px-5 py-4">
        {loading && <p className="text-sm text-white/50">Loading…</p>}
        {error && <p className="text-sm text-red-300">{error}</p>}
        {notice && <p className="text-sm text-emerald-200">{notice}</p>}

        {detail && (
          <>
            <section className="space-y-2">
              <p className="text-sm leading-relaxed text-white/75">{detail.description}</p>
              <div className="flex flex-wrap gap-2">
                <Badge label={detail.status} accent={theme.accent} />
                {detail.skillKind && <Badge label={detail.skillKind} />}
                {detail.skillName && <Badge label={detail.skillName} />}
              </div>
            </section>

            {detail.configurable ? (
              <section className="rounded-xl border border-white/10 bg-black/20 p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-white/45">Skill switch</p>
                    <p className="text-sm text-white/80">
                      {detail.enabled ? "Active in SAG worker" : "Disabled in config"}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={toggling}
                    onClick={() => void handleToggle(!detail.enabled)}
                    className={`relative h-8 w-14 rounded-full transition ${
                      detail.enabled ? "bg-emerald-500/40" : "bg-white/10"
                    } ${toggling ? "opacity-50" : ""}`}
                    aria-pressed={detail.enabled}
                  >
                    <span
                      className={`absolute top-1 h-6 w-6 rounded-full bg-white transition ${
                        detail.enabled ? "left-7" : "left-1"
                      }`}
                    />
                  </button>
                </div>

                {confirmDisable && detail.disableImpact && (
                  <div className="mt-4 space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
                    <p className="text-xs font-medium uppercase tracking-wider text-amber-200">
                      Disabling affects the tree
                    </p>
                    <ul className="space-y-1 text-xs text-amber-100/90">
                      {detail.disableImpact.warnings.map((warning) => (
                        <li key={warning}>• {warning}</li>
                      ))}
                    </ul>
                    <div className="flex gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => void handleToggle(false)}
                        disabled={toggling}
                        className="rounded-full bg-amber-500/20 px-3 py-1 text-xs text-amber-100 hover:bg-amber-500/30"
                      >
                        Confirm disable
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDisable(false)}
                        className="rounded-full px-3 py-1 text-xs text-white/50 hover:text-white"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </section>
            ) : (
              <section className="rounded-xl border border-dashed border-white/15 p-4 text-sm text-white/50">
                Planned perk — not tied to a config skill yet. SAG can build this via{" "}
                <code className="text-sag-glow">/dev</code> when ready.
              </section>
            )}

            {(detail.configPath || detail.implementationPath) && (
              <section className="space-y-2">
                <h4 className="text-xs uppercase tracking-wider text-white/45">How it is built</h4>
                {detail.configPath && (
                  <PathRow label="Config" value={detail.configPath} />
                )}
                {detail.implementationPath && (
                  <PathRow label="Code" value={detail.implementationPath} />
                )}
                {detail.skillId && <PathRow label="Skill ID" value={detail.skillId} mono />}
              </section>
            )}

            {detail.telegramCommands.length > 0 && (
              <section className="space-y-2">
                <h4 className="text-xs uppercase tracking-wider text-white/45">Telegram</h4>
                <div className="flex flex-wrap gap-2">
                  {detail.telegramCommands.map((command) => (
                    <code
                      key={command}
                      className="rounded-full border border-white/10 bg-black/30 px-2.5 py-1 text-xs text-sag-glow"
                    >
                      {command}
                    </code>
                  ))}
                </div>
              </section>
            )}

            <section className="space-y-2">
              <h4 className="text-xs uppercase tracking-wider text-white/45">Recent activity</h4>
              {detail.recentActivity.length === 0 ? (
                <p className="text-sm text-white/40">No recent events for this skill.</p>
              ) : (
                <ul className="space-y-2">
                  {detail.recentActivity.map((event, index) => (
                    <li
                      key={`${event.at}-${index}`}
                      className="rounded-lg border border-white/5 bg-black/20 px-3 py-2 text-xs"
                    >
                      <div className="flex justify-between gap-2 text-white/40">
                        <span>{event.type}</span>
                        <time>{new Date(event.at).toLocaleString()}</time>
                      </div>
                      <p className="mt-1 text-white/75">{event.summary}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {detail.relatedNodes.length > 0 && (
              <section className="space-y-2">
                <h4 className="text-xs uppercase tracking-wider text-white/45">Related perks</h4>
                <ul className="space-y-1 text-sm text-white/60">
                  {detail.relatedNodes.map((related) => (
                    <li key={related.nodeId}>
                      {related.label} · {related.branchName}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </aside>
  );
}

function Badge({ label, accent }: { label: string; accent?: string }) {
  return (
    <span
      className="rounded-full border border-white/10 bg-black/30 px-2 py-0.5 text-[10px] uppercase tracking-wide text-white/70"
      style={accent ? { borderColor: `${accent}44` } : undefined}
    >
      {label}
    </span>
  );
}

function PathRow({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-lg border border-white/5 bg-black/20 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-white/35">{label}</p>
      <p className={`mt-0.5 text-sm text-white/80 ${mono ? "font-mono text-xs" : ""}`}>{value}</p>
    </div>
  );
}
