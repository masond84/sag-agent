"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityFeed } from "@/components/ActivityFeed";
import { FacePanel, speakText } from "@/components/FacePanel";
import { SkillTreeGrid } from "@/components/SkillTreeGrid";
import type { FaceState, HouseEvent, SkillTreeNode, SkillTreePayload, WorkerHealth } from "@/lib/types";
import { createWorkerEventSource, fetchSkillTree, fetchWorkerHealth } from "@/lib/worker";

export function HouseDashboard() {
  const [skillTree, setSkillTree] = useState<SkillTreePayload | null>(null);
  const [health, setHealth] = useState<WorkerHealth | null>(null);
  const [events, setEvents] = useState<HouseEvent[]>([]);
  const [caption, setCaption] = useState("");
  const [faceState, setFaceState] = useState<FaceState>("idle");
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [selectedNode, setSelectedNode] = useState<SkillTreeNode | null>(null);
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const speechQueueRef = useRef<Promise<void>>(Promise.resolve());

  const refreshSkillTree = useCallback(async () => {
    const [tree, workerHealth] = await Promise.all([fetchSkillTree(), fetchWorkerHealth()]);
    setSkillTree(tree);
    setHealth(workerHealth);
    setLoading(false);
  }, []);

  const enqueueSpeech = useCallback((text: string) => {
    speechQueueRef.current = speechQueueRef.current.then(async () => {
      setCaption(text);
      setFaceState("speaking");
      await speakText(
        text,
        () => setFaceState("speaking"),
        () => setFaceState("idle"),
      );
    });
  }, []);

  const handleEvent = useCallback(
    (event: HouseEvent) => {
      setEvents((current) => [...current.slice(-49), event]);

      if (event.kind === "connected") {
        setConnected(true);
      }

      if (event.kind === "speech" && event.speech) {
        enqueueSpeech(event.speech);
      }
    },
    [enqueueSpeech],
  );

  useEffect(() => {
    let mounted = true;

    async function load() {
      await refreshSkillTree();
      if (!mounted) {
        return;
      }
    }

    void load();
    const refresh = setInterval(() => {
      void refreshSkillTree();
    }, 60_000);

    return () => {
      mounted = false;
      clearInterval(refresh);
    };
  }, [refreshSkillTree]);

  useEffect(() => {
    const source = createWorkerEventSource(handleEvent);
    return () => source?.close();
  }, [handleEvent]);

  async function testSpeech() {
    const sample = "Hey Devin. House is online. Skill tree loaded and I'm ready to evolve.";
    enqueueSpeech(sample);
    await fetch("/api/worker/speech", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: sample }),
    });
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-12 px-5 py-10 md:px-8 md:py-14">
      <header className="flex flex-col gap-6 border-b border-sag-border pb-10 md:flex-row md:items-end md:justify-between">
        <div className="space-y-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.3em] text-sag-muted">
            SAG House
          </p>
          <h1 className="text-3xl font-medium tracking-tight text-sag-text md:text-4xl">
            Home Base
          </h1>
          <p className="max-w-lg text-sm leading-relaxed text-sag-muted">
            Skill constellation, live activity, and Tier 1 presence shell. Photoreal face plugs in
            later.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <StatusPill label={connected ? "Stream live" : "Stream offline"} ok={connected} />
          <StatusPill
            label={health ? `${health.skills.length} skills` : "Worker offline"}
            ok={Boolean(health?.ok)}
          />
          <button
            type="button"
            onClick={() => void testSpeech()}
            className="rounded-md border border-sag-border bg-white/[0.03] px-4 py-2 text-xs font-medium text-sag-text transition hover:bg-white/[0.06]"
          >
            Test voice
          </button>
        </div>
      </header>

      <div className="grid gap-10 xl:grid-cols-[1fr_300px] xl:gap-12">
        <SkillTreeGrid
          payload={skillTree}
          loading={loading}
          selectedBranchId={selectedBranchId}
          selectedNode={selectedNode}
          onNodeSelect={(node, branch) => {
            setSelectedBranchId(branch.id);
            setSelectedNode(node);
          }}
          onCloseDetail={() => {
            setSelectedBranchId(null);
            setSelectedNode(null);
          }}
          onSkillUpdated={() => void refreshSkillTree()}
        />
        <aside className="flex flex-col gap-8">
          <FacePanel caption={caption} state={faceState} />
          <ActivityFeed events={events} />
        </aside>
      </div>
    </div>
  );
}

function StatusPill({ label, ok }: { label: string; ok: boolean }) {
  return (
    <span
      className={`rounded-md border px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide ${
        ok
          ? "border-sag-border bg-white/[0.05] text-sag-glow"
          : "border-sag-border bg-transparent text-sag-muted"
      }`}
    >
      {label}
    </span>
  );
}
