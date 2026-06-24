import path from "node:path";
import { access } from "node:fs/promises";

const GMAIL_MCP_ENTRY = "node_modules/@gongrzhe/server-gmail-autoauth-mcp/dist/index.js";

export function resolveGmailMcpEntry(): string {
  return path.resolve(process.cwd(), GMAIL_MCP_ENTRY);
}

export async function assertGmailMcpInstalled(): Promise<string> {
  const entry = resolveGmailMcpEntry();
  try {
    await access(entry);
  } catch {
    throw new Error(
      "Gmail MCP server is not installed. Run `npm install` in the repo root (optionalDependency @gongrzhe/server-gmail-autoauth-mcp).",
    );
  }
  return entry;
}
