"use client";

import { useEffect, useRef } from "react";
import type { FaceRendererProps } from "@/lib/face/types";
import {
  buildPixelWorld,
  CELL_PX,
  findApproachSpot,
  findPath,
  GRID_SIZE,
  objectForFaceState,
  PALETTE,
  pickRandomFloorTile,
  pickRandomObject,
  SAG_SIZE,
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
  stepFrame: number;
  bob: number;
}

const MOVE_INTERVAL_MS = 280;
const DECISION_INTERVAL_MS = 6000;
const INTERACT_DURATION_MS = 2400;

function initialAgentState(world: PixelWorld): AgentState {
  const start = pickRandomFloorTile(world) ?? { x: 8, y: 8 };
  return {
    pos: start,
    path: [],
    facing: "down",
    interactingUntil: 0,
    lastDecisionAt: Date.now(),
    wanderTarget: null,
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

function truncate(text: string, max: number): string {
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, max - 1)}…`;
}

function drawTile(
  ctx: CanvasRenderingContext2D,
  tile: string,
  x: number,
  y: number,
  checker: boolean,
) {
  let fill = checker ? PALETTE.floorAlt : PALETTE.floor;
  if (tile === "rug") {
    fill = PALETTE.rug;
  } else if (tile === "wood") {
    fill = PALETTE.wood;
  } else if (tile === "wall") {
    fill = PALETTE.wall;
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, CELL_PX, CELL_PX);
    ctx.fillStyle = PALETTE.wallEdge;
    ctx.fillRect(x, y, CELL_PX, 1);
    ctx.fillRect(x, y, 1, CELL_PX);
    return;
  }
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, CELL_PX, CELL_PX);
}

function drawObjectSprite(
  ctx: CanvasRenderingContext2D,
  object: WorldObject,
  pulse: number,
) {
  const px = object.x * CELL_PX;
  const py = object.y * CELL_PX;
  const w = object.w * CELL_PX;
  const h = object.h * CELL_PX;
  const glow = 0.15 + pulse * 0.1;

  switch (object.kind) {
    case "couch":
      ctx.fillStyle = "#3a4a62";
      ctx.fillRect(px + 1, py + 2, w - 2, h - 3);
      ctx.fillStyle = "#4d6080";
      ctx.fillRect(px + 2, py + 1, w - 4, 3);
      break;
    case "terminal":
      ctx.fillStyle = "#2a3344";
      ctx.fillRect(px + 1, py + 1, w - 2, h - 2);
      ctx.fillStyle = `rgba(180,192,212,${0.5 + pulse * 0.4})`;
      ctx.fillRect(px + 3, py + 4, w - 6, h - 7);
      ctx.fillStyle = "#9aa8be";
      ctx.fillRect(px + 4, py + 5, 2, 2);
      ctx.fillRect(px + 8, py + 7, 4, 1);
      break;
    case "desk":
      ctx.fillStyle = "#3a3028";
      ctx.fillRect(px + 1, py + 4, w - 2, h - 5);
      ctx.fillStyle = "#4a4034";
      ctx.fillRect(px + 2, py + 2, w - 4, 3);
      ctx.fillStyle = `rgba(154,168,190,${0.35 + glow})`;
      ctx.fillRect(px + 3, py + 3, w - 6, 2);
      break;
    case "bookshelf":
      ctx.fillStyle = "#3a3028";
      ctx.fillRect(px + 1, py + 2, w - 2, h - 3);
      for (let i = 0; i < 4; i += 1) {
        const colors = ["#5a7088", "#6a8098", "#4a6078", "#7a90a8"];
        ctx.fillStyle = colors[i % colors.length];
        ctx.fillRect(px + 2 + i * 4, py + 3, 3, h - 5);
      }
      break;
    case "plant":
      ctx.fillStyle = "#4a3828";
      ctx.fillRect(px + 2, py + h - 4, 4, 3);
      ctx.fillStyle = "#3d6b4a";
      ctx.fillRect(px + 1, py + 2, 6, 5);
      ctx.fillStyle = "#4d8b5a";
      ctx.fillRect(px + 3, py + 1, 2, 2);
      break;
    case "coffee":
      ctx.fillStyle = "#5a4a3a";
      ctx.fillRect(px + 1, py + 3, 6, 5);
      ctx.fillStyle = `rgba(200,180,150,${0.4 + pulse * 0.3})`;
      ctx.fillRect(px + 3, py + 1, 2, 2);
      break;
    case "bed":
      ctx.fillStyle = "#3a4a62";
      ctx.fillRect(px + 1, py + 3, w - 2, h - 4);
      ctx.fillStyle = "#b4c0d4";
      ctx.fillRect(px + 2, py + 2, w - 4, 3);
      break;
    case "window":
      ctx.fillStyle = "#1a2538";
      ctx.fillRect(px + 1, py + 2, w - 2, h - 2);
      ctx.fillStyle = `rgba(140,170,210,${0.25 + pulse * 0.2})`;
      ctx.fillRect(px + 2, py + 3, w - 4, h - 4);
      break;
    default:
      break;
  }
}

function drawSagSprite(
  ctx: CanvasRenderingContext2D,
  pos: GridPos,
  facing: AgentState["facing"],
  speaking: boolean,
  thinking: boolean,
  stepFrame: number,
  bob: number,
) {
  const px = pos.x * CELL_PX;
  const py = pos.y * CELL_PX + bob;
  const w = SAG_SIZE * CELL_PX;
  const h = SAG_SIZE * CELL_PX;

  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(px + 2, py + h - 2, w - 4, 2);

  ctx.fillStyle = "#9aa8be";
  ctx.fillRect(px + 2, py + 5, w - 4, h - 6);

  ctx.fillStyle = "#b4c0d4";
  ctx.fillRect(px + 3, py + 2, w - 6, 7);

  const blink = stepFrame % 120 < 4;
  ctx.fillStyle = "#090b10";
  if (!blink) {
    const eyeOffset = facing === "left" ? -1 : facing === "right" ? 1 : 0;
    ctx.fillRect(px + 5 + eyeOffset, py + 4, 2, 2);
    ctx.fillRect(px + 10 + eyeOffset, py + 4, 2, 2);
  } else {
    ctx.fillRect(px + 5, py + 5, 2, 1);
    ctx.fillRect(px + 10, py + 5, 2, 1);
  }

  if (speaking) {
    const open = 2 + (stepFrame % 6 < 3 ? 2 : 0);
    ctx.fillRect(px + 7, py + 7, 4, open);
  } else if (thinking) {
    ctx.fillRect(px + 8, py + 7, 2, 1);
  } else {
    ctx.fillRect(px + 7, py + 7, 4, 1);
  }

  if (stepFrame % 16 < 8) {
    ctx.fillStyle = "#7a889e";
    ctx.fillRect(px + 4, py + h - 3, 3, 2);
    ctx.fillRect(px + 10, py + h - 2, 3, 1);
  } else {
    ctx.fillStyle = "#7a889e";
    ctx.fillRect(px + 4, py + h - 2, 3, 1);
    ctx.fillRect(px + 10, py + h - 3, 3, 2);
  }
}

function drawSpeechBubble(ctx: CanvasRenderingContext2D, pos: GridPos, text: string) {
  const cx = (pos.x + 1) * CELL_PX;
  const top = pos.y * CELL_PX - 6;
  const label = truncate(text, 28);
  ctx.font = "8px monospace";
  const width = Math.min(120, ctx.measureText(label).width + 10);
  const left = cx - width / 2;
  const bubbleY = top - 14;

  ctx.fillStyle = "rgba(9,11,16,0.92)";
  ctx.strokeStyle = "rgba(154,168,190,0.45)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(left, bubbleY, width, 12, 3);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#e8eaef";
  ctx.fillText(label, left + 5, bubbleY + 9);

  ctx.fillStyle = "rgba(9,11,16,0.92)";
  ctx.beginPath();
  ctx.moveTo(cx - 3, top - 2);
  ctx.lineTo(cx + 3, top - 2);
  ctx.lineTo(cx, top + 2);
  ctx.fill();
}

function drawActionLabel(ctx: CanvasRenderingContext2D, text: string, width: number) {
  ctx.font = "9px monospace";
  ctx.fillStyle = "#8b95a8";
  ctx.textAlign = "center";
  ctx.fillText(truncate(text, 34), width / 2, GRID_SIZE * CELL_PX + 14);
  ctx.textAlign = "left";
}

export function PixelHouseRenderer({ state, caption, amplitude }: FaceRendererProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const worldRef = useRef<PixelWorld>(buildPixelWorld());
  const agentRef = useRef<AgentState>(initialAgentState(worldRef.current));
  const activityRef = useRef<string>("Wandering the house");
  const frameRef = useRef(0);
  const lastMoveRef = useRef(0);
  const stateRef = useRef(state);
  const captionRef = useRef(caption);
  const amplitudeRef = useRef(amplitude);

  stateRef.current = state;
  captionRef.current = caption;
  amplitudeRef.current = amplitude;

  useEffect(() => {
    const world = worldRef.current;
    const agent = agentRef.current;
    agent.pos = pickRandomFloorTile(world) ?? { x: 8, y: 8 };
    agent.path = [];
    agent.lastDecisionAt = Date.now();
    activityRef.current = "Exploring the pixel house";
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
        now - agent.lastDecisionAt > DECISION_INTERVAL_MS &&
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

      if (agent.path.length > 0 && now - lastMoveRef.current > MOVE_INTERVAL_MS && !speaking) {
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
        activityRef.current = agent.wanderTarget.idleAction;
        agent.wanderTarget = null;
      }

      agent.bob = speaking ? Math.sin(frame * 0.2) * amplitudeRef.current * 2 : 0;

      const size = GRID_SIZE * CELL_PX;
      ctx.clearRect(0, 0, size, size + 18);

      for (let y = 0; y < GRID_SIZE; y += 1) {
        for (let x = 0; x < GRID_SIZE; x += 1) {
          drawTile(ctx, world.tiles[y][x], x * CELL_PX, y * CELL_PX, (x + y) % 2 === 0);
        }
      }

      const pulse = (Math.sin(frame * 0.08) + 1) / 2;
      for (const object of world.objects) {
        drawObjectSprite(ctx, object, pulse);
      }

      drawSagSprite(ctx, agent.pos, agent.facing, speaking, thinking, frame, agent.bob);

      if (speaking && captionRef.current) {
        drawSpeechBubble(ctx, agent.pos, captionRef.current);
      }

      drawActionLabel(ctx, activityRef.current, size);

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const canvasSize = GRID_SIZE * CELL_PX;

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className="relative overflow-hidden rounded-md border border-sag-border bg-[#07090d] shadow-soft"
        style={{ width: canvasSize, height: canvasSize + 18 }}
      >
        <canvas
          ref={canvasRef}
          width={canvasSize}
          height={canvasSize + 18}
          className="block"
          style={{ imageRendering: "pixelated", width: canvasSize, height: canvasSize + 18 }}
          aria-label="SAG pixel house — autonomous mini avatar"
        />
      </div>
      <p className="min-h-[4rem] max-w-[260px] text-center text-sm leading-relaxed text-sag-muted">
        {caption || "SAG is exploring the house…"}
      </p>
    </div>
  );
}
