import "dotenv/config";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { assertGmailMcpInstalled } from "../core/mcp/gmail-mcp-path.js";
import { ensureGmailMcpOAuthKeysFile, getGmailMcpKeysPath } from "../core/mcp/gmail-oauth-keys.js";

const MCP_DIR = path.resolve(process.cwd(), "data/gmail-mcp");
const GMAIL_MCP_HOME = path.join(os.homedir(), ".gmail-mcp");

async function main(): Promise<void> {
  await mkdir(MCP_DIR, { recursive: true });
  await mkdir(GMAIL_MCP_HOME, { recursive: true });
  const entry = await assertGmailMcpInstalled();

  const keysResult = await ensureGmailMcpOAuthKeysFile();
  if (keysResult === "missing") {
    console.error(
      "Missing gcp-oauth.keys.json. Copy your Google OAuth client JSON to data/gmail-mcp/gcp-oauth.keys.json",
    );
    console.error("Or set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET in .env and re-run.");
    process.exit(1);
  }

  const keysPath = getGmailMcpKeysPath();
  console.log(`Gmail MCP auth directory: ${MCP_DIR}`);
  console.log(`OAuth keys file: ${keysPath}${keysResult === "created" ? " (created from .env)" : ""}`);
  console.log("");
  console.log("If port 3000 is in use (e.g. SAG House), stop that process first — Gmail MCP auth listens on :3000.");
  console.log("Complete the browser sign-in when prompted.\n");

  const child = spawn(process.execPath, [entry, "auth"], {
    cwd: MCP_DIR,
    stdio: "inherit",
    shell: false,
  });

  await new Promise<void>((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Gmail MCP auth exited with code ${code ?? "unknown"}`));
    });
  });

  console.log("\nGmail MCP auth complete. Tokens saved under ~/.gmail-mcp/credentials.json");
  console.log("Restart the worker, then: npm run test:mcp");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
