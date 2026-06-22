"use client";

import { useEffect, useState } from "react";
import type { SkillNodeDetail, SkillTreeBranch, SkillTreeNode } from "@/lib/types";
import { fetchSkillNodeDetail, toggleSkill } from "@/lib/worker";

interface SkillDetailPanelProps {
  node: SkillTreeNode;
  branch: SkillTreeBranch;
  onClose: () => void;
  onUpdated: () => void;
  embedded?: boolean;
}

export function SkillDetailPanel({
  node,
  branch,
  onClose,
  onUpdated,
  embedded = false,
}: SkillDetailPanelProps) {
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

  const shellClass = embedded
    ? "flex min-h-0 flex-1 flex-col overflow-hidden"
    : "rounded-xl border border-sag-border bg-sag-elevated/80 shadow-soft backdrop-blur-md";

  return (
    <div className={shellClass}>
      <header
        className={`flex shrink-0 items-start justify-between gap-4 border-b border-sag-border ${
          embedded ? "pb-5" : "px-6 py-5"
        }`}
      >
        <div className="min-w-0 space-y-1">
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-sag-muted">
            {branch.name}
          </p>
          <h3 className="text-lg font-medium tracking-tight text-sag-text">{node.label}</h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-md border border-sag-border bg-white/[0.03] px-3 py-1.5 text-xs text-sag-muted transition hover:bg-white/[0.06] hover:text-sag-text"
        >
          Close
        </button>
      </header>

      <div
        className={`min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain ${
          embedded ? "py-5 pr-2" : "max-h-[70vh] px-6 py-5"
        }`}
      >
        {loading && <p className="text-sm text-sag-muted">Loading…</p>}
        {error && <p className="break-words text-sm text-red-300/90">{error}</p>}
        {notice && <p className="break-words text-sm text-sag-glow">{notice}</p>}

        {detail && (
          <>
            <section className="space-y-3">
              <p className="text-sm leading-relaxed text-sag-muted">{detail.description}</p>
              <div className="flex flex-wrap gap-2">
                <Badge label={detail.status} />
                {detail.skillKind && <Badge label={detail.skillKind} muted />}
                {detail.skillName && <Badge label={detail.skillName} muted />}
              </div>
            </section>

            {detail.configurable ? (
              <section className="space-y-4 rounded-lg border border-sag-border bg-white/[0.02] p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium uppercase tracking-wider text-sag-muted">
                      Skill switch
                    </p>
                    <p className="mt-1 text-sm text-sag-text">
                      {detail.enabled ? "Active in worker" : "Disabled in config"}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={toggling}
                    onClick={() => void handleToggle(!detail.enabled)}
                    className={`relative h-7 w-12 shrink-0 rounded-full transition ${
                      detail.enabled ? "bg-sag-accent/30" : "bg-white/[0.08]"
                    } ${toggling ? "opacity-50" : ""}`}
                    aria-pressed={detail.enabled}
                  >
                    <span
                      className={`absolute top-0.5 h-6 w-6 rounded-full bg-sag-text shadow-sm transition ${
                        detail.enabled ? "left-5" : "left-0.5"
                      }`}
                    />
                  </button>
                </div>

                {confirmDisable && detail.disableImpact && (
                  <div className="space-y-3 rounded-lg border border-sag-border bg-white/[0.02] p-4">
                    <p className="text-[11px] font-medium uppercase tracking-wider text-sag-muted">
                      Disabling affects the tree
                    </p>
                    <ul className="space-y-2 text-xs leading-relaxed text-sag-muted">
                      {detail.disableImpact.warnings.map((warning) => (
                        <li key={warning} className="break-words">
                          {warning}
                        </li>
                      ))}
                    </ul>
                    <div className="flex gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => void handleToggle(false)}
                        disabled={toggling}
                        className="rounded-md border border-sag-border bg-white/[0.05] px-3 py-1.5 text-xs text-sag-text hover:bg-white/[0.08]"
                      >
                        Confirm disable
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDisable(false)}
                        className="rounded-md px-3 py-1.5 text-xs text-sag-muted hover:text-sag-text"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </section>
            ) : (
              <section className="rounded-lg border border-dashed border-sag-border p-4 text-sm text-sag-muted">
                Planned perk — not wired to config yet. Request via{" "}
                <code className="rounded bg-white/[0.05] px-1.5 py-0.5 font-mono text-xs text-sag-glow">
                  /dev
                </code>
              </section>
            )}

            {(detail.configPath || detail.implementationPath) && (
              <section className="space-y-3">
                <SectionLabel>Built from</SectionLabel>
                {detail.configPath && <PathRow label="Config" value={detail.configPath} />}
                {detail.implementationPath && <PathRow label="Code" value={detail.implementationPath} />}
                {detail.skillId && <PathRow label="Skill ID" value={detail.skillId} />}
              </section>
            )}

            {detail.telegramCommands.length > 0 && (
              <section className="space-y-3">
                <SectionLabel>Telegram</SectionLabel>
                <div className="flex flex-wrap gap-2">
                  {detail.telegramCommands.map((command) => (
                    <code
                      key={command}
                      className="rounded-md border border-sag-border bg-white/[0.03] px-2.5 py-1 font-mono text-xs text-sag-glow"
                    >
                      {command}
                    </code>
                  ))}
                </div>
              </section>
            )}

            <section className="space-y-3">
              <SectionLabel>Recent activity</SectionLabel>
              {detail.recentActivity.length === 0 ? (
                <p className="text-sm text-sag-muted">No recent events for this skill.</p>
              ) : (
                <ul className="space-y-2">
                  {detail.recentActivity.map((event, index) => (
                    <li
                      key={`${event.at}-${index}`}
                      className="rounded-lg border border-sag-border bg-white/[0.02] px-4 py-3"
                    >
                      <div className="flex justify-between gap-3 text-[11px] text-sag-muted">
                        <span className="shrink-0 uppercase tracking-wide">{event.type}</span>
                        <time className="shrink-0 tabular-nums">
                          {new Date(event.at).toLocaleString(undefined, {
                            month: "numeric",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </time>
                      </div>
                      <p className="mt-2 break-words text-sm leading-relaxed text-sag-text/85">
                        {event.summary}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {detail.relatedNodes.length > 0 && (
              <section className="space-y-3">
                <SectionLabel>Related perks</SectionLabel>
                <ul className="space-y-1.5 text-sm text-sag-muted">
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
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="text-[11px] font-medium uppercase tracking-[0.15em] text-sag-muted">{children}</h4>
  );
}

function Badge({ label, muted = false }: { label: string; muted?: boolean }) {
  return (
    <span
      className={`rounded-md border px-2 py-0.5 text-[10px] uppercase tracking-wide ${
        muted
          ? "border-sag-border bg-white/[0.02] text-sag-muted"
          : "border-sag-border bg-white/[0.05] text-sag-glow"
      }`}
    >
      {label}
    </span>
  );
}

function PathRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-sag-border bg-white/[0.02] px-4 py-3">
      <p className="text-[10px] font-medium uppercase tracking-wider text-sag-muted">{label}</p>
      <p className="mt-1.5 break-all font-mono text-xs leading-relaxed text-sag-text/80">{value}</p>
    </div>
  );
}
