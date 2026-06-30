import "dotenv/config";
import { access } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { assertCalendarMcpInstalled } from "../core/mcp/calendar-mcp-path.js";
import { ensureCalendarMcpOAuthKeysFile } from "../core/mcp/calendar-oauth-keys.js";
import { assertGmailMcpInstalled } from "../core/mcp/gmail-mcp-path.js";
import { ensureGmailMcpOAuthKeysFile, getGmailMcpKeysPath } from "../core/mcp/gmail-oauth-keys.js";
import { isMcpEnabled } from "../core/mcp/config.js";
const GMAIL_CREDENTIALS_FILE = path.join(os.homedir(), ".gmail-mcp", "credentials.json");
const CALENDAR_CREDENTIALS_FILE = path.join(
  os.homedir(),
  ".config",
  "google-calendar-mcp",
  "tokens.json",
);

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

  const hasGmailCredentials = await fileExists(GMAIL_CREDENTIALS_FILE);
  if (hasGmailCredentials) {
    console.log(`Gmail MCP credentials: ${GMAIL_CREDENTIALS_FILE} (ready)`);
  } else {
    console.log(`Gmail MCP credentials: not found (${GMAIL_CREDENTIALS_FILE})`);
    console.log("  → npm run mcp:gmail-auth (stop House first — uses port 3000)");
  }

  try {
    await assertCalendarMcpInstalled();
    console.log("Calendar MCP package: installed");
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }

  const calendarKeys = await ensureCalendarMcpOAuthKeysFile();
  if (calendarKeys === "created") {
    console.log("Calendar OAuth keys: created at data/calendar-mcp/gcp-oauth.keys.json");
  } else if (calendarKeys === "exists") {
    console.log("Calendar OAuth keys: data/calendar-mcp/gcp-oauth.keys.json (ready)");
  } else {
    console.log("Calendar OAuth keys: missing — need data/gmail-mcp/gcp-oauth.keys.json first");
  }

  const hasCalendarCredentials = await fileExists(CALENDAR_CREDENTIALS_FILE);
  if (hasCalendarCredentials) {
    console.log(`Calendar MCP credentials: ${CALENDAR_CREDENTIALS_FILE} (ready)`);
  } else {
    console.log(`Calendar MCP credentials: not found (${CALENDAR_CREDENTIALS_FILE})`);
    console.log("  → Enable Calendar API in Google Cloud, then: npm run mcp:calendar-auth");
  }

  if (hasGmailCredentials && hasCalendarCredentials) {
    console.log("\nNext: npm run test:mcp");
    console.log("\nRestart the worker (npm run dev) if it is already running.");
    return;
  }

  if (!hasGmailCredentials || !hasCalendarCredentials) {
    console.log("\nAfter auth: npm run test:mcp && npm run dev");
    console.log('\nTelegram examples: "any emails from today?" / "what is on my calendar today?"');
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
