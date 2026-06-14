import path from "node:path";
import { getRepoRoot } from "../assistant/repo-tools.js";

const BLOCKED_PATHS = new Set([".env", "data/dev-runner.json", "data/gmail-token.json"]);
const BLOCKED_PREFIXES = ["data/mem0/", "node_modules/", ".git/"];
const ALLOWED_PREFIXES = ["src/", "config/", "scripts/", "launchd/"];
const ALLOWED_ROOT_FILES = new Set(["package.json", "tsconfig.json", "README.md", ".env.example"]);

export function normalizeRelativePath(relativePath: string): string {
  const cleaned = relativePath.trim().replace(/^\/+/, "").replace(/\\/g, "/");
  if (!cleaned || cleaned.includes("..")) {
    throw new Error("Invalid path.");
  }
  return cleaned;
}

export function resolveWritePath(relativePath: string): string {
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
    throw new Error("Writing .env blocked.");
  }
  const allowed =
    ALLOWED_ROOT_FILES.has(normalized) ||
    ALLOWED_PREFIXES.some((p) => normalized === p.replace(/\/$/, "") || normalized.startsWith(p));
  if (!allowed) {
    throw new Error(`Path not in write scope: ${normalized}`);
  }
  return absolute;
}

export function assertPathsWritable(relativePaths: string[]): void {
  for (const p of relativePaths) {
    resolveWritePath(p);
  }
}
