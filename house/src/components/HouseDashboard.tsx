"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityFeed } from "@/components/ActivityFeed";
import { FacePanel, speakText } from "@/components/FacePanel";
import { SkillDetailPanel } from "@/components/SkillDetailPanel";
import { SkillTreeGrid } from "@/components/SkillTreeGrid";
import type { FaceState, HouseEvent, SkillTreeBranch, SkillTreeNode, SkillTreePayload, WorkerHealth } from "@/lib/types";
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
  const [selectedBranch, setSelectedBranch] = useState<SkillTreeBranch | null>(null);
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
    <div className="mx-auto flex max-w-7xl flex-col gap-10 px-6 py-10">
      <header className="flex flex-col gap-4 border-b border-white/10 pb-8 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.4em] text-sag-glow/60">SAG House</p>
          <h1 className="font-display text-4xl text-sag-star md:text-5xl">Home Base</h1>
          <p className="mt-2 max-w-xl text-sm text-white/50">
            Skill constellation, live activity, and Tier 1 presence shell. Photoreal face (Tier 3) plugs in later.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <StatusPill
            label={connected ? "Stream live" : "Stream offline"}
            ok={connected}
          />
          <StatusPill
            label={health ? `${health.skills.length} skills` : "Worker offline"}
            ok={Boolean(health?.ok)}
          />
          <button
            type="button"
            onClick={() => void testSpeech()}
            className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs uppercase tracking-wider text-white/80 transition hover:bg-white/10"
          >
            Test voice
          </button>
        </div>
      </header>

      <div className="grid gap-8 xl:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <SkillTreeGrid
            payload={skillTree}
            loading={loading}
            selectedNodeId={selectedNode?.id}
            onNodeSelect={(node, branch) => {
              setSelectedNode(node);
              setSelectedBranch(branch);
            }}
          />
          {selectedNode && selectedBranch && (
            <SkillDetailPanel
              node={selectedNode}
              branch={selectedBranch}
              onClose={() => {
                setSelectedNode(null);
                setSelectedBranch(null);
              }}
              onUpdated={() => void refreshSkillTree()}
            />
          )}
        </div>
        <div className="flex flex-col gap-6">
          <FacePanel caption={caption} state={faceState} />
          <ActivityFeed events={events} />
        </div>
      </div>
    </div>
  );
}

function StatusPill({ label, ok }: { label: string; ok: boolean }) {
  return (
    <span
      className={`rounded-full px-3 py-1.5 text-xs uppercase tracking-wider ${
        ok ? "bg-emerald-500/15 text-emerald-200" : "bg-white/5 text-white/40"
      }`}
    >
      {label}
    </span>
  );
}
