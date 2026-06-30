import type { GridPos } from "@/lib/face/pixel-world";
import { CELL_PX, GRID_SIZE, SAG_SIZE } from "@/lib/face/pixel-world";
import type { WorldObject } from "@/lib/face/pixel-world";

/** GBA-inspired RPG interior palette */
export const C = {
  outline: "#1a1a2e",
  shadow: "#00000055",
  wallTop: "#f5e6c8",
  wallMid: "#e8d4a8",
  wallTrim: "#8b5e3c",
  wallBase: "#6b4423",
  plankA: "#c49a6c",
  plankB: "#a87b4a",
  plankLine: "#8b6239",
  carpetA: "#4a7ab8",
  carpetB: "#3a6aa8",
  carpetAccent: "#e84848",
  tileA: "#e8eef5",
  tileB: "#d0dae8",
  matA: "#d4a84a",
  matB: "#c49838",
  floorA: "#d8c4a0",
  floorB: "#c8b490",
  grass: "#58a858",
  grassDark: "#489848",
  sky: "#68b8e8",
  cloud: "#f0f8ff",
  sun: "#f8d848",
  sagBody: "#7a9cc8",
  sagBodyDark: "#5a7ca8",
  sagFace: "#f0e8d8",
  sagHair: "#9ab0d0",
  sagCheek: "#f0a0a0",
  red: "#e85050",
  redDark: "#c03030",
  green: "#48b848",
  greenDark: "#389838",
  brown: "#8b5e3c",
  brownDark: "#6b4423",
  gold: "#f8c838",
  white: "#f8f8f8",
  cream: "#fff8e8",
  pink: "#f8a8c0",
  purple: "#8868c8",
  orange: "#f88848",
  screenGlow: "#58e8a8",
  screenBlue: "#3898d8",
  steam: "#f0f0f0aa",
  sparkle: "#fff8a0",
} as const;

type Facing = "up" | "down" | "left" | "right";

function fill(ctx: CanvasRenderingContext2D, color: string, x: number, y: number, w = 1, h = 1) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

export function drawSkyBackdrop(ctx: CanvasRenderingContext2D, width: number, height: number) {
  fill(ctx, "#3a5a48", 0, 0, width, height);
  for (let y = 0; y < height; y += 4) {
    for (let x = 0; x < width; x += 4) {
      if ((x + y) % 8 === 0) {
        fill(ctx, "#426252", x, y, 2, 2);
      }
    }
  }
}

export function drawTile(
  ctx: CanvasRenderingContext2D,
  tile: string,
  gx: number,
  gy: number,
) {
  const x = gx * CELL_PX;
  const y = gy * CELL_PX;
  const s = CELL_PX;

  if (tile === "wall") {
    fill(ctx, C.wallTop, x, y, s, s * 0.35);
    fill(ctx, C.wallMid, x, y + s * 0.35, s, s * 0.4);
    fill(ctx, C.wallTrim, x, y + s * 0.75, s, 2);
    fill(ctx, C.wallBase, x, y + s * 0.75 + 2, s, s * 0.25 - 2);
    fill(ctx, C.outline, x, y + s - 1, s, 1);
    if (gy === 0 && gx % 3 === 1) {
      fill(ctx, C.wallTrim, x + 2, y + 2, s - 4, 2);
    }
    return;
  }

  if (tile === "planks") {
    const band = gy % 2 === 0 ? C.plankA : C.plankB;
    fill(ctx, band, x, y, s, s);
    fill(ctx, C.plankLine, x, y + s / 2, s, 1);
    fill(ctx, C.plankLine, x, y + s - 1, s, 1);
    if (gx % 2 === 0) {
      fill(ctx, C.plankLine, x + s / 2, y, 1, s);
    }
    return;
  }

  if (tile === "carpet") {
    const a = (gx + gy) % 2 === 0 ? C.carpetA : C.carpetB;
    fill(ctx, a, x, y, s, s);
    if ((gx + gy) % 4 === 0) {
      fill(ctx, C.carpetAccent, x + 2, y + 2, 3, 3);
      fill(ctx, C.gold, x + s - 5, y + s - 5, 3, 3);
    }
    fill(ctx, C.gold, x, y, s, 1);
    fill(ctx, C.gold, x, y + s - 1, s, 1);
    return;
  }

  if (tile === "tile") {
    fill(ctx, (gx + gy) % 2 === 0 ? C.tileA : C.tileB, x, y, s, s);
    fill(ctx, "#b8c8d8", x, y + s - 1, s, 1);
    fill(ctx, "#b8c8d8", x + s - 1, y, 1, s);
    return;
  }

  if (tile === "mat") {
    fill(ctx, (gx + gy) % 2 === 0 ? C.matA : C.matB, x, y, s, s);
    fill(ctx, C.brown, x + 2, y + 2, s - 4, s - 4);
    fill(ctx, C.matA, x + 4, y + 4, s - 8, s - 8);
    return;
  }

  // default floor
  fill(ctx, (gx + gy) % 2 === 0 ? C.floorA : C.floorB, x, y, s, s);
  fill(ctx, C.plankLine, x + s - 1, y, 1, s);
  fill(ctx, C.plankLine, x, y + s - 1, s, 1);
}

export function drawObjectSprite(
  ctx: CanvasRenderingContext2D,
  object: WorldObject,
  pulse: number,
  frame: number,
) {
  const bx = object.x * CELL_PX;
  const by = object.y * CELL_PX;

  fill(ctx, C.shadow, bx + 2, by + object.h * CELL_PX - 2, object.w * CELL_PX - 2, 3);

  switch (object.kind) {
    case "couch":
      drawCouch(ctx, bx, by);
      break;
    case "terminal":
      drawTerminal(ctx, bx, by, pulse, frame);
      break;
    case "desk":
      drawDesk(ctx, bx, by, pulse);
      break;
    case "bookshelf":
      drawBookshelf(ctx, bx, by);
      break;
    case "plant":
      drawPlant(ctx, bx, by, frame);
      break;
    case "coffee":
      drawCoffee(ctx, bx, by, frame);
      break;
    case "bed":
      drawBed(ctx, bx, by);
      break;
    case "window":
      drawWindow(ctx, bx, by, frame);
      break;
    default:
      break;
  }
}

function drawCouch(ctx: CanvasRenderingContext2D, bx: number, by: number) {
  fill(ctx, C.outline, bx + 1, by + 8, 22, 14);
  fill(ctx, C.red, bx + 2, by + 9, 20, 12);
  fill(ctx, C.redDark, bx + 2, by + 18, 20, 3);
  fill(ctx, C.red, bx + 2, by + 6, 6, 6);
  fill(ctx, C.red, bx + 16, by + 6, 6, 6);
  fill(ctx, C.redDark, bx + 2, by + 6, 6, 2);
  fill(ctx, C.redDark, bx + 16, by + 6, 6, 2);
  fill(ctx, C.cream, bx + 8, by + 12, 8, 5);
}

function drawTerminal(ctx: CanvasRenderingContext2D, bx: number, by: number, pulse: number, frame: number) {
  fill(ctx, C.outline, bx + 2, by + 4, 20, 16);
  fill(ctx, "#484848", bx + 3, by + 5, 18, 14);
  fill(ctx, C.screenBlue, bx + 5, by + 7, 14, 9);
  fill(ctx, C.screenGlow, bx + 6, by + 8 + (frame % 4), 5, 2);
  fill(ctx, C.white, bx + 12, by + 9, 6, 1);
  fill(ctx, C.gold, bx + 12, by + 11, 4, 1);
  if (pulse > 0.5) {
    fill(ctx, C.sparkle, bx + 18, by + 6, 2, 2);
  }
  fill(ctx, C.brownDark, bx + 8, by + 20, 8, 3);
}

function drawDesk(ctx: CanvasRenderingContext2D, bx: number, by: number, pulse: number) {
  fill(ctx, C.outline, bx + 1, by + 10, 22, 12);
  fill(ctx, C.brown, bx + 2, by + 11, 20, 10);
  fill(ctx, C.brownDark, bx + 2, by + 19, 3, 3);
  fill(ctx, C.brownDark, bx + 17, by + 19, 3, 3);
  fill(ctx, C.cream, bx + 5, by + 8, 8, 5);
  fill(ctx, C.outline, bx + 5, by + 8, 8, 1);
  fill(ctx, C.purple, bx + 14, by + 9, 4, 3);
  fill(ctx, `rgba(88,232,168,${0.3 + pulse * 0.4})`, bx + 6, by + 12, 6, 4);
}

function drawBookshelf(ctx: CanvasRenderingContext2D, bx: number, by: number) {
  fill(ctx, C.outline, bx + 1, by + 4, 22, 8);
  fill(ctx, C.brown, bx + 2, by + 5, 20, 6);
  const bookColors = [C.red, C.screenBlue, C.green, C.gold, C.purple, C.orange];
  for (let i = 0; i < 5; i += 1) {
    fill(ctx, bookColors[i], bx + 3 + i * 4, by + 5, 3, 5);
    fill(ctx, C.white, bx + 3 + i * 4, by + 5, 3, 1);
  }
}

function drawPlant(ctx: CanvasRenderingContext2D, bx: number, by: number, frame: number) {
  fill(ctx, C.orange, bx + 3, by + 16, 8, 6);
  fill(ctx, C.brownDark, bx + 4, by + 20, 6, 2);
  fill(ctx, C.green, bx + 2, by + 8, 10, 10);
  fill(ctx, C.greenDark, bx + 4, by + 10, 6, 6);
  fill(ctx, C.green, bx + 1 + (frame % 3), by + 4, 4, 4);
  fill(ctx, C.green, bx + 8, by + 3 + (frame % 2), 4, 4);
}

function drawCoffee(ctx: CanvasRenderingContext2D, bx: number, by: number, frame: number) {
  fill(ctx, C.brownDark, bx + 2, by + 14, 10, 8);
  fill(ctx, C.cream, bx + 3, by + 15, 8, 4);
  fill(ctx, C.brown, bx + 1, by + 20, 12, 2);
  if (frame % 20 < 15) {
    fill(ctx, C.steam, bx + 5, by + 10 - (frame % 4), 2, 3);
    fill(ctx, C.steam, bx + 8, by + 8 - (frame % 3), 2, 3);
  }
}

function drawBed(ctx: CanvasRenderingContext2D, bx: number, by: number) {
  fill(ctx, C.outline, bx + 1, by + 10, 22, 14);
  fill(ctx, C.brown, bx + 2, by + 18, 20, 6);
  fill(ctx, C.pink, bx + 2, by + 12, 20, 8);
  fill(ctx, C.white, bx + 4, by + 10, 16, 5);
  fill(ctx, C.cream, bx + 3, by + 14, 6, 4);
}

function drawWindow(ctx: CanvasRenderingContext2D, bx: number, by: number, frame: number) {
  fill(ctx, C.brownDark, bx, by + 4, 24, 10);
  fill(ctx, C.sky, bx + 2, by + 5, 20, 8);
  fill(ctx, C.sun, bx + 16, by + 6, 4, 4);
  fill(ctx, C.cloud, bx + 4 + (frame % 8), by + 7, 6, 3);
  fill(ctx, C.cloud, bx + 10, by + 9, 5, 2);
  fill(ctx, C.brown, bx + 11, by + 4, 2, 10);
  fill(ctx, C.brown, bx + 2, by + 8, 20, 2);
}

export function drawSagChibi(
  ctx: CanvasRenderingContext2D,
  pos: GridPos,
  facing: Facing,
  speaking: boolean,
  thinking: boolean,
  stepFrame: number,
  bob: number,
) {
  const px = pos.x * CELL_PX;
  const py = pos.y * CELL_PX + bob;
  const w = SAG_SIZE * CELL_PX;
  const h = SAG_SIZE * CELL_PX;

  fill(ctx, C.shadow, px + 4, py + h - 2, w - 8, 3);

  const walk = stepFrame % 16 < 8;
  const legL = walk ? 0 : 1;
  const legR = walk ? 1 : 0;

  // Body
  fill(ctx, C.outline, px + 5, py + 13, 14, 10);
  fill(ctx, C.sagBody, px + 6, py + 14, 12, 8);
  fill(ctx, C.sagBodyDark, px + 6, py + 20, 12, 2);

  // Legs
  fill(ctx, C.outline, px + 7, py + 21 + legL, 4, 3);
  fill(ctx, C.outline, px + 13, py + 21 + legR, 4, 3);
  fill(ctx, C.sagBodyDark, px + 8, py + 22 + legL, 2, 2);
  fill(ctx, C.sagBodyDark, px + 14, py + 22 + legR, 2, 2);

  // Head
  fill(ctx, C.outline, px + 4, py + 3, 16, 13);
  fill(ctx, C.sagFace, px + 5, py + 4, 14, 11);
  fill(ctx, C.sagHair, px + 5, py + 3, 14, 4);
  fill(ctx, C.sagHair, px + 4, py + 5, 2, 6);
  fill(ctx, C.sagHair, px + 18, py + 5, 2, 6);

  const blink = stepFrame % 140 < 5;
  const eyeShift = facing === "left" ? -1 : facing === "right" ? 1 : 0;

  if (!blink) {
    fill(ctx, C.outline, px + 7 + eyeShift, py + 8, 3, 4);
    fill(ctx, C.outline, px + 14 + eyeShift, py + 8, 3, 4);
    fill(ctx, C.white, px + 8 + eyeShift, py + 9, 2, 2);
    fill(ctx, C.white, px + 15 + eyeShift, py + 9, 2, 2);
  } else {
    fill(ctx, C.outline, px + 8 + eyeShift, py + 10, 2, 1);
    fill(ctx, C.outline, px + 15 + eyeShift, py + 10, 2, 1);
  }

  fill(ctx, C.sagCheek, px + 6, py + 11, 2, 1);
  fill(ctx, C.sagCheek, px + 16, py + 11, 2, 1);

  if (speaking) {
    const open = stepFrame % 6 < 3 ? 4 : 2;
    fill(ctx, C.outline, px + 9, py + 12, 6, open + 1);
    fill(ctx, "#d87878", px + 10, py + 13, 4, open);
  } else if (thinking) {
    fill(ctx, C.outline, px + 11, py + 13, 2, 1);
    if (stepFrame % 30 < 15) {
      fill(ctx, C.gold, px + 17, py + 2, 2, 2);
      fill(ctx, C.gold, px + 19, py + 0, 2, 2);
    }
  } else {
    fill(ctx, C.outline, px + 10, py + 13, 4, 1);
  }
}

export function drawInteractionSparkle(
  ctx: CanvasRenderingContext2D,
  object: WorldObject,
  frame: number,
) {
  const cx = (object.x + object.w / 2) * CELL_PX;
  const cy = object.y * CELL_PX - 2;
  const t = frame % 24;
  if (t > 18) {
    return;
  }
  fill(ctx, C.sparkle, cx - 4, cy - t, 2, 2);
  fill(ctx, C.gold, cx + 2, cy - t + 2, 2, 2);
  fill(ctx, C.white, cx, cy - t + 4, 2, 2);
}

export function drawRpgSpeechBubble(ctx: CanvasRenderingContext2D, pos: GridPos, text: string) {
  const cx = (pos.x + 1) * CELL_PX;
  const top = pos.y * CELL_PX - 4;
  const label = text.length > 26 ? `${text.slice(0, 25)}…` : text;
  ctx.font = "bold 8px monospace";
  const width = Math.min(130, ctx.measureText(label).width + 14);
  const left = Math.max(2, Math.min(cx - width / 2, GRID_SIZE * CELL_PX - width - 2));
  const bubbleY = top - 18;

  fill(ctx, C.outline, left - 1, bubbleY - 1, width + 2, 16);
  fill(ctx, C.cream, left, bubbleY, width, 14);
  fill(ctx, C.outline, left, bubbleY, width, 1);
  fill(ctx, C.outline, left, bubbleY + 13, width, 1);

  ctx.fillStyle = C.outline;
  ctx.fillText(label, left + 7, bubbleY + 10);

  fill(ctx, C.cream, cx - 4, top - 4, 8, 4);
  fill(ctx, C.outline, cx - 4, top - 1, 8, 1);
  fill(ctx, C.cream, cx - 2, top - 2, 4, 2);
}

export function drawActionBar(ctx: CanvasRenderingContext2D, text: string, width: number) {
  const barY = GRID_SIZE * CELL_PX + 1;
  fill(ctx, C.outline, 0, barY, width, 16);
  fill(ctx, "#2a4838", 1, barY + 1, width - 2, 14);
  fill(ctx, C.gold, 3, barY + 3, 2, 8);
  ctx.font = "bold 9px monospace";
  ctx.fillStyle = C.cream;
  ctx.textAlign = "left";
  const label = text.length > 32 ? `${text.slice(0, 31)}…` : text;
  ctx.fillText(label, 8, barY + 11);
  ctx.textAlign = "left";
}

export function drawRoomFrame(ctx: CanvasRenderingContext2D, width: number, height: number) {
  fill(ctx, C.brownDark, 0, 0, width, 2);
  fill(ctx, C.brownDark, 0, 0, 2, height);
  fill(ctx, C.brownDark, width - 2, 0, 2, height);
  fill(ctx, C.gold, 2, 2, width - 4, 1);
}
