import path from "node:path";
import { access } from "node:fs/promises";

const CALENDAR_MCP_ENTRY = "node_modules/@cocal/google-calendar-mcp/build/index.js";
const CALENDAR_MCP_AUTH = "node_modules/@cocal/google-calendar-mcp/build/auth-server.js";

export function resolveCalendarMcpEntry(): string {
  return path.resolve(process.cwd(), CALENDAR_MCP_ENTRY);
}

export function resolveCalendarMcpAuthEntry(): string {
  return path.resolve(process.cwd(), CALENDAR_MCP_AUTH);
}

export function resolveCalendarOAuthCredentialsPath(): string {
  const fromEnv = process.env.GOOGLE_OAUTH_CREDENTIALS?.trim();
  if (fromEnv) {
    return path.resolve(fromEnv.replace(/\{ROOT\}/g, process.cwd()));
  }
  return path.resolve(process.cwd(), "data/calendar-mcp/gcp-oauth.keys.json");
}

export async function assertCalendarMcpInstalled(): Promise<{ entry: string; auth: string }> {
  const entry = resolveCalendarMcpEntry();
  const auth = resolveCalendarMcpAuthEntry();
  try {
    await access(entry);
    await access(auth);
  } catch {
    throw new Error(
      "Google Calendar MCP is not installed. Run `npm install` in the repo root (optionalDependency @cocal/google-calendar-mcp).",
    );
  }
  return { entry, auth };
}
