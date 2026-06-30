export const GRID_SIZE = 20;
export const SAG_SIZE = 2;
export const CELL_PX = 12;

export type TileKind = "floor" | "wall" | "carpet" | "planks" | "tile" | "mat";

export type ObjectKind =
  | "desk"
  | "terminal"
  | "bookshelf"
  | "couch"
  | "plant"
  | "coffee"
  | "bed"
  | "window";

export interface WorldObject {
  id: string;
  kind: ObjectKind;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  idleAction: string;
}

export interface GridPos {
  x: number;
  y: number;
}

export interface PixelWorld {
  tiles: TileKind[][];
  objects: WorldObject[];
  blocked: boolean[][];
}

const PALETTE = {
  floor: "#d8c4a0",
  floorAlt: "#c8b490",
  carpet: "#4a7ab8",
  planks: "#c49a6c",
  wall: "#e8d4a8",
  wallEdge: "#8b5e3c",
};

export { PALETTE };

function emptyBlocked(): boolean[][] {
  return Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(false));
}

function stampRect(blocked: boolean[][], x: number, y: number, w: number, h: number) {
  for (let dy = 0; dy < h; dy += 1) {
    for (let dx = 0; dx < w; dx += 1) {
      const gx = x + dx;
      const gy = y + dy;
      if (gx >= 0 && gx < GRID_SIZE && gy >= 0 && gy < GRID_SIZE) {
        blocked[gy][gx] = true;
      }
    }
  }
}

export function buildPixelWorld(): PixelWorld {
  const tiles: TileKind[][] = Array.from({ length: GRID_SIZE }, (_, y) =>
    Array.from({ length: GRID_SIZE }, (_, x) => {
      if (x === 0 || y === 0 || x === GRID_SIZE - 1 || y === GRID_SIZE - 1) {
        return "wall";
      }
      return "floor";
    }),
  );

  // Living room carpet
  for (let y = 3; y <= 9; y += 1) {
    for (let x = 3; x <= 10; x += 1) {
      tiles[y][x] = "carpet";
    }
  }

  // Office wood planks
  for (let y = 3; y <= 11; y += 1) {
    for (let x = 12; x <= 17; x += 1) {
      tiles[y][x] = "planks";
    }
  }

  // Kitchen tiles
  for (let y = 12; y <= 16; y += 1) {
    for (let x = 11; x <= 17; x += 1) {
      tiles[y][x] = "tile";
    }
  }

  // Welcome mat by the door
  for (let x = 9; x <= 10; x += 1) {
    tiles[17][x] = "mat";
  }

  const objects: WorldObject[] = [
    {
      id: "couch",
      kind: "couch",
      x: 3,
      y: 4,
      w: 2,
      h: 2,
      label: "Couch",
      idleAction: "Lounging on the couch",
    },
    {
      id: "terminal",
      kind: "terminal",
      x: 14,
      y: 4,
      w: 2,
      h: 2,
      label: "Terminal",
      idleAction: "Tweaking skill nodes",
    },
    {
      id: "desk",
      kind: "desk",
      x: 13,
      y: 8,
      w: 2,
      h: 2,
      label: "Desk",
      idleAction: "Reviewing the queue",
    },
    {
      id: "bookshelf",
      kind: "bookshelf",
      x: 4,
      y: 10,
      w: 2,
      h: 1,
      label: "Memory shelf",
      idleAction: "Browsing memories",
    },
    {
      id: "plant",
      kind: "plant",
      x: 7,
      y: 14,
      w: 1,
      h: 2,
      label: "Plant",
      idleAction: "Tending the plant",
    },
    {
      id: "coffee",
      kind: "coffee",
      x: 16,
      y: 14,
      w: 1,
      h: 1,
      label: "Coffee",
      idleAction: "Brewing coffee",
    },
    {
      id: "bed",
      kind: "bed",
      x: 3,
      y: 15,
      w: 2,
      h: 2,
      label: "Bed",
      idleAction: "Power napping",
    },
    {
      id: "window",
      kind: "window",
      x: 9,
      y: 1,
      w: 2,
      h: 1,
      label: "Window",
      idleAction: "Watching the grid",
    },
  ];

  const blocked = emptyBlocked();
  for (let y = 0; y < GRID_SIZE; y += 1) {
    for (let x = 0; x < GRID_SIZE; x += 1) {
      if (tiles[y][x] === "wall") {
        blocked[y][x] = true;
      }
    }
  }
  for (const object of objects) {
    stampRect(blocked, object.x, object.y, object.w, object.h);
  }

  return { tiles, objects, blocked };
}

export function canPlaceSag(world: PixelWorld, x: number, y: number): boolean {
  if (x < 1 || y < 1 || x + SAG_SIZE > GRID_SIZE - 1 || y + SAG_SIZE > GRID_SIZE - 1) {
    return false;
  }
  for (let dy = 0; dy < SAG_SIZE; dy += 1) {
    for (let dx = 0; dx < SAG_SIZE; dx += 1) {
      if (world.blocked[y + dy][x + dx]) {
        return false;
      }
    }
  }
  return true;
}

function adjacentToObject(object: WorldObject): GridPos[] {
  const spots: GridPos[] = [];
  const candidates = [
    { x: object.x - SAG_SIZE, y: object.y },
    { x: object.x + object.w, y: object.y },
    { x: object.x, y: object.y - SAG_SIZE },
    { x: object.x, y: object.y + object.h },
    { x: object.x - SAG_SIZE, y: object.y + object.h - SAG_SIZE },
    { x: object.x + object.w, y: object.y },
    { x: object.x, y: object.y + object.h },
    { x: object.x + object.w - SAG_SIZE, y: object.y - SAG_SIZE },
  ];
  for (const spot of candidates) {
    spots.push(spot);
  }
  return spots;
}

export function findApproachSpot(world: PixelWorld, object: WorldObject): GridPos | null {
  const candidates = adjacentToObject(object);
  for (const spot of candidates) {
    if (canPlaceSag(world, spot.x, spot.y)) {
      return spot;
    }
  }
  return null;
}

export function findPath(world: PixelWorld, start: GridPos, goal: GridPos): GridPos[] {
  if (start.x === goal.x && start.y === goal.y) {
    return [];
  }

  const key = (p: GridPos) => `${p.x},${p.y}`;
  const queue: GridPos[] = [start];
  const cameFrom = new Map<string, string | null>();
  cameFrom.set(key(start), null);

  const deltas = [
    { x: 0, y: -1 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
  ];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.x === goal.x && current.y === goal.y) {
      const path: GridPos[] = [];
      let cursor: string | null = key(current);
      while (cursor) {
        const [x, y] = cursor.split(",").map(Number);
        path.push({ x, y });
        cursor = cameFrom.get(cursor) ?? null;
      }
      path.pop();
      return path.reverse();
    }

    for (const delta of deltas) {
      const next = { x: current.x + delta.x, y: current.y + delta.y };
      const nextKey = key(next);
      if (cameFrom.has(nextKey)) {
        continue;
      }
      if (!canPlaceSag(world, next.x, next.y)) {
        continue;
      }
      cameFrom.set(nextKey, key(current));
      queue.push(next);
    }
  }

  return [];
}

export function pickRandomFloorTile(world: PixelWorld): GridPos | null {
  const spots: GridPos[] = [];
  for (let y = 1; y < GRID_SIZE - SAG_SIZE; y += 1) {
    for (let x = 1; x < GRID_SIZE - SAG_SIZE; x += 1) {
      if (canPlaceSag(world, x, y)) {
        spots.push({ x, y });
      }
    }
  }
  if (spots.length === 0) {
    return null;
  }
  return spots[Math.floor(Math.random() * spots.length)];
}

export function pickRandomObject(world: PixelWorld): WorldObject | null {
  const shuffled = [...world.objects].sort(() => Math.random() - 0.5);
  for (const object of shuffled) {
    if (findApproachSpot(world, object)) {
      return object;
    }
  }
  return null;
}

export const STATE_OBJECT_HINT: Record<string, ObjectKind[]> = {
  thinking: ["desk", "terminal", "bookshelf"],
  listening: ["terminal"],
  speaking: ["desk", "terminal"],
  idle: [],
};

export function objectForFaceState(world: PixelWorld, state: string): WorldObject | null {
  const kinds = STATE_OBJECT_HINT[state] ?? [];
  if (kinds.length === 0) {
    return pickRandomObject(world);
  }
  const shuffled = kinds.sort(() => Math.random() - 0.5);
  for (const kind of shuffled) {
    const object = world.objects.find((entry) => entry.kind === kind);
    if (object && findApproachSpot(world, object)) {
      return object;
    }
  }
  return pickRandomObject(world);
}
