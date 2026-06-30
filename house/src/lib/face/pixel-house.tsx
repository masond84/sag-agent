"use client";

import { useEffect, useRef } from "react";
import type { FaceRendererProps } from "@/lib/face/types";
import {
  drawActionBar,
  drawInteractionSparkle,
  drawObjectSprite,
  drawRoomFrame,
  drawRpgSpeechBubble,
  drawSagChibi,
  drawSkyBackdrop,
  drawTile,
} from "@/lib/face/pixel-art";
import {
  buildPixelWorld,
  CELL_PX,
  findApproachSpot,
  findPath,
  GRID_SIZE,
  objectForFaceState,
  pickRandomFloorTile,
  pickRandomObject,
  type GridPos,
  type PixelWorld,
  type WorldObject,
} from "@/lib/face/pixel-world";

interface AgentState {
  pos: GridPos;
  path: GridPos[];
  facing: "up" | "down" | "left" | "right";
  interactingUntil: number;
  lastDecisionAt: number;
  wanderTarget: WorldObject | null;
  activeObject: WorldObject | null;
  stepFrame: number;
  bob: number;
}

const MOVE_INTERVAL_MS = 280;
const MOVE_INTERVAL_EXPANDED_MS = 220;
const DECISION_INTERVAL_MS = 6000;
const DECISION_INTERVAL_EXPANDED_MS = 4500;
const INTERACT_DURATION_MS = 2800;
const ACTION_BAR_H = 18;

function initialAgentState(world: PixelWorld): AgentState {
  const start = pickRandomFloorTile(world) ?? { x: 8, y: 8 };
  return {
    pos: start,
    path: [],
    facing: "down",
    interactingUntil: 0,
    lastDecisionAt: Date.now(),
    wanderTarget: null,
    activeObject: null,
    stepFrame: 0,
    bob: 0,
  };
}

function directionBetween(from: GridPos, to: GridPos): AgentState["facing"] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0 ? "right" : "left";
  }
  return dy > 0 ? "down" : "up";
}

export function PixelHouseRenderer({ state, caption, amplitude, expanded }: FaceRendererProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const worldRef = useRef<PixelWorld>(buildPixelWorld());
  const agentRef = useRef<AgentState>(initialAgentState(worldRef.current));
  const activityRef = useRef<string>("Wandering the house");
  const frameRef = useRef(0);
  const lastMoveRef = useRef(0);
  const stateRef = useRef(state);
  const captionRef = useRef(caption);
  const amplitudeRef = useRef(amplitude);
  const expandedRef = useRef(expanded);

  stateRef.current = state;
  captionRef.current = caption;
  amplitudeRef.current = amplitude;
  expandedRef.current = Boolean(expanded);

  useEffect(() => {
    const world = worldRef.current;
    const agent = agentRef.current;
    agent.pos = pickRandomFloorTile(world) ?? { x: 8, y: 8 };
    agent.path = [];
    agent.lastDecisionAt = Date.now();
    activityRef.current = "Exploring SAG House";
  }, []);

  useEffect(() => {
    const world = worldRef.current;
    const agent = agentRef.current;

    if (state === "speaking") {
      agent.path = [];
      activityRef.current = caption ? "Speaking" : "Talking";
      return;
    }

    const targetObject = objectForFaceState(world, state);
    if (!targetObject) {
      return;
    }

    const spot = findApproachSpot(world, targetObject);
    if (!spot) {
      return;
    }

    agent.wanderTarget = targetObject;
    agent.path = findPath(world, agent.pos, spot);
    activityRef.current =
      state === "thinking"
        ? targetObject.idleAction
        : state === "listening"
          ? "At the terminal"
          : targetObject.idleAction;
  }, [state, caption]);

  useEffect(() => {
    let raf = 0;
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    ctx.imageSmoothingEnabled = false;

    const tick = (now: number) => {
      frameRef.current += 1;
      const frame = frameRef.current;
      const world = worldRef.current;
      const agent = agentRef.current;
      const faceState = stateRef.current;
      const speaking = faceState === "speaking";
      const thinking = faceState === "thinking";

      if (
        !speaking &&
        now - agent.lastDecisionAt >
          (expandedRef.current ? DECISION_INTERVAL_EXPANDED_MS : DECISION_INTERVAL_MS) &&
        agent.path.length === 0 &&
        now > agent.interactingUntil
      ) {
        agent.lastDecisionAt = now;
        const object = pickRandomObject(world);
        if (object) {
          const spot = findApproachSpot(world, object);
          if (spot) {
            agent.wanderTarget = object;
            agent.path = findPath(world, agent.pos, spot);
            activityRef.current = `Heading to ${object.label.toLowerCase()}`;
          }
        } else {
          const tile = pickRandomFloorTile(world);
          if (tile) {
            agent.path = findPath(world, agent.pos, tile);
            activityRef.current = "Wandering";
          }
        }
      }

      if (
        agent.path.length > 0 &&
        now - lastMoveRef.current >
          (expandedRef.current ? MOVE_INTERVAL_EXPANDED_MS : MOVE_INTERVAL_MS) &&
        !speaking
      ) {
        lastMoveRef.current = now;
        const next = agent.path.shift()!;
        agent.facing = directionBetween(agent.pos, next);
        agent.pos = next;
        agent.stepFrame += 1;
        activityRef.current = agent.wanderTarget
          ? `Walking to ${agent.wanderTarget.label.toLowerCase()}`
          : "Walking";
      }

      if (
        agent.path.length === 0 &&
        agent.wanderTarget &&
        now > agent.interactingUntil &&
        !speaking
      ) {
        agent.interactingUntil = now + INTERACT_DURATION_MS;
        agent.activeObject = agent.wanderTarget;
        activityRef.current = agent.wanderTarget.idleAction;
        agent.wanderTarget = null;
      }

      if (now > agent.interactingUntil) {
        agent.activeObject = null;
      }

      agent.bob = speaking ? Math.sin(frame * 0.2) * amplitudeRef.current * 2 : 0;

      const mapSize = GRID_SIZE * CELL_PX;
      const totalH = mapSize + ACTION_BAR_H;

      drawSkyBackdrop(ctx, mapSize, mapSize);

      for (let y = 0; y < GRID_SIZE; y += 1) {
        for (let x = 0; x < GRID_SIZE; x += 1) {
          drawTile(ctx, world.tiles[y][x], x, y);
        }
      }

      const pulse = (Math.sin(frame * 0.08) + 1) / 2;
      for (const object of world.objects) {
        drawObjectSprite(ctx, object, pulse, frame);
      }

      if (agent.activeObject && now < agent.interactingUntil) {
        drawInteractionSparkle(ctx, agent.activeObject, frame);
      }

      drawSagChibi(ctx, agent.pos, agent.facing, speaking, thinking, frame, agent.bob);

      if (speaking && captionRef.current) {
        drawRpgSpeechBubble(ctx, agent.pos, captionRef.current);
      }

      drawRoomFrame(ctx, mapSize, mapSize);
      drawActionBar(ctx, activityRef.current, mapSize);

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const canvasSize = GRID_SIZE * CELL_PX;
  const canvasHeight = canvasSize + ACTION_BAR_H;
  const displayScale = expanded ? 2.35 : 1;
  const displayWidth = canvasSize * displayScale;
  const displayHeight = canvasHeight * displayScale;

  return (
    <div className="flex flex-col items-center gap-3 transition-all duration-300">
      <div
        className="relative overflow-hidden rounded-md border-2 border-[#8b5e3c] bg-[#3a5a48] shadow-soft transition-all duration-300"
        style={{ width: displayWidth, height: displayHeight }}
      >
        <canvas
          ref={canvasRef}
          width={canvasSize}
          height={canvasHeight}
          className="block origin-top-left transition-transform duration-300"
          style={{
            imageRendering: "pixelated",
            width: canvasSize,
            height: canvasHeight,
            transform: `scale(${displayScale})`,
          }}
          aria-label="SAG pixel house — autonomous mini avatar"
        />
      </div>
      <p
        className={`text-center leading-relaxed text-sag-muted transition-all duration-300 ${
          expanded ? "min-h-[3rem] max-w-xl text-base" : "min-h-[4rem] max-w-[260px] text-sm"
        }`}
      >
        {caption || "SAG is exploring the house…"}
      </p>
    </div>
  );
}
