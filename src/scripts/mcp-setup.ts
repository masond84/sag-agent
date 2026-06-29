import "dotenv/config";
import { access } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { isMcpEnabled } from "../core/mcp/config.js";
import { assertGmailMcpInstalled } from "../core/mcp/gmail-mcp-path.js";
import { ensureGmailMcpOAuthKeysFile, getGmailMcpKeysPath } from "../core/mcp/gmail-oauth-keys.js";

const CREDENTIALS_FILE = path.join(os.homedir(), ".gmail-mcp", "credentials.json");

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  console.log("SAG MCP setup check\n");

  console.log(`MCP_ENABLED: ${isMcpEnabled() ? "true" : "false"}`);
  if (!isMcpEnabled()) {
    console.log("\nSet MCP_ENABLED=true in .env, then re-run this script.");
    process.exit(1);
  }

  try {
    await assertGmailMcpInstalled();
    console.log("Gmail MCP package: installed");
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }

  const keysResult = await ensureGmailMcpOAuthKeysFile();
  if (keysResult === "exists") {
    console.log(`OAuth keys file: ${getGmailMcpKeysPath()} (already present)`);
  } else if (keysResult === "created") {
    console.log(`OAuth keys file: created from GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET in .env`);
    console.log(
      "Ensure Google Cloud OAuth client has redirect URI: http://localhost:3000/oauth2callback",
    );
  } else {
    console.log("OAuth keys file: missing");
    console.log("Copy your Google OAuth client JSON to:");
    console.log(`  ${getGmailMcpKeysPath()}`);
    console.log("Or set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET in .env and re-run.");
    process.exit(1);
  }

  const hasCredentials = await fileExists(CREDENTIALS_FILE);
  if (hasCredentials) {
    console.log(`Gmail MCP credentials: ${CREDENTIALS_FILE} (ready)`);
    console.log("\nNext: npm run test:mcp");
    console.log('      npm run test:mcp -- --query="after:2026/06/24"');
    console.log("\nRestart the worker (npm run dev) if it is already running.");
    return;
  }

  console.log(`Gmail MCP credentials: not found (${CREDENTIALS_FILE})`);
  console.log("\nNext steps:");
  console.log("1. Stop SAG House if running (Gmail MCP auth uses port 3000)");
  console.log("2. npm run mcp:gmail-auth");
  console.log("3. Complete browser sign-in");
  console.log("4. npm run test:mcp");
  console.log("5. Restart worker: npm run dev");
  console.log("\nThen ask in Telegram, e.g.:");
  console.log('  "any emails from today?"');
  console.log('  "search gmail for messages from conservice"');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
