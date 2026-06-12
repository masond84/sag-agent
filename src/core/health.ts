import os from "node:os";

export function formatRelativeTime(iso?: string): string {
  if (!iso) {
    return "never";
  }

  const elapsedMs = Date.now() - new Date(iso).getTime();
  if (elapsedMs < 0) {
    return "just now";
  }

  const minutes = Math.floor(elapsedMs / 60_000);
  if (minutes < 1) {
    return "just now";
  }
  if (minutes < 60) {
    return `${minutes} min ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 48) {
    return `${hours} hr ago`;
  }

  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export function formatStatusLabel(ok: boolean): string {
  return ok ? "ok" : "not configured";
}

export function formatHostLabel(): string {
  return os.hostname();
}
