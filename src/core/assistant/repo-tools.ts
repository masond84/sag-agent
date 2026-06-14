import { execFile } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const BLOCKED_PATHS = new Set([".env", "data/gmail-token.json", "data/processed-messages.json"]);
const BLOCKED_PREFIXES = ["data/mem0/", "node_modules/"];

export function getRepoRoot(): string {
  return path.resolve(process.env.SAG_REPO_ROOT?.trim() || process.cwd());
}

function normalizeRelativePath(relativePath: string): string {
  const cleaned = relativePath.trim().replace(/^\/+/, "").replace(/\\/g, "/");
  if (!cleaned || cleaned.includes("..")) {
    throw new Error("Invalid path.");
  }
  return cleaned;
}

export function resolveRepoPath(relativePath: string): string {
  const normalized = normalizeRelativePath(relativePath);
  const root = getRepoRoot();
  const absolute = path.resolve(root, normalized);
  if (absolute !== root && !absolute.startsWith(`${root}${path.sep}`)) {
    throw new Error("Path escapes repo root.");
  }
  if (BLOCKED_PATHS.has(normalized) || BLOCKED_PREFIXES.some((p) => normalized.startsWith(p))) {
    throw new Error(`Path blocked: ${normalized}`);
  }
  if (normalized.endsWith(".env") || normalized.includes("/.env")) {
    throw new Error("Reading .env blocked.");
  }
  return absolute;
}

export async function readRepoFile(relativePath: string, startLine = 1, endLine?: number): Promise<string> {
  const absolute = resolveRepoPath(relativePath);
  const fileStat = await stat(absolute);
  if (!fileStat.isFile()) {
    throw new Error(`Not a file: ${relativePath}`);
  }
  const lines = (await readFile(absolute, "utf8")).split("\n");
  const start = Math.max(1, startLine);
  const end = Math.min(endLine ?? lines.length, lines.length);
  return [`File: ${normalizeRelativePath(relativePath)} (lines ${start}-${end})`, ...lines.slice(start - 1, end)].join("\n");
}

export async function searchRepo(query: string, glob = "src/**/*.{ts,js,yaml,md}"): Promise<string> {
  const trimmed = query.trim();
  if (!trimmed) {
    throw new Error("Empty query.");
  }
  const root = getRepoRoot();
  try {
    const { stdout } = await execFileAsync("rg", ["-n", "--glob", glob, trimmed, root], { maxBuffer: 512_000 });
    const lines = stdout.trim().split("\n").slice(0, 25);
    return lines.length ? lines.map((l) => l.replace(`${root}/`, "")).join("\n") : "No matches found.";
  } catch (error) {
    const err = error as { code?: number; stdout?: string };
    if (err.code === 1) {
      return "No matches found.";
    }
    if (err.stdout?.trim()) {
      return err.stdout.trim().split("\n").slice(0, 25).join("\n");
    }
    throw new Error("Search failed. Is ripgrep installed?");
  }
}
