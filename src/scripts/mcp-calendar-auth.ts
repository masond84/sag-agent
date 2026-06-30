import "dotenv/config";
import { spawn } from "node:child_process";
import { assertCalendarMcpInstalled } from "../core/mcp/calendar-mcp-path.js";
import { ensureCalendarMcpOAuthKeysFile, getCalendarMcpKeysPath } from "../core/mcp/calendar-oauth-keys.js";

async function main(): Promise<void> {
  const { auth } = await assertCalendarMcpInstalled();
  const keysResult = await ensureCalendarMcpOAuthKeysFile();
  if (keysResult === "missing") {
    console.error("Missing OAuth keys. Ensure data/gmail-mcp/gcp-oauth.keys.json exists (Gmail MCP Web client).");
    process.exit(1);
  }

  const credentialsPath = getCalendarMcpKeysPath();

  console.log(`OAuth credentials: ${credentialsPath}${keysResult === "created" ? " (converted from Gmail web keys)" : ""}`);
  console.log("");
  console.log("Ensure Google Calendar API is enabled in your Google Cloud project.");
  console.log("Complete the browser sign-in when prompted.\n");

  const child = spawn(process.execPath, [auth], {
    stdio: "inherit",
    shell: false,
    env: {
      ...process.env,
      GOOGLE_OAUTH_CREDENTIALS: credentialsPath,
    },
  });

  await new Promise<void>((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Calendar MCP auth exited with code ${code ?? "unknown"}`));
    });
  });

  console.log("\nCalendar MCP auth complete. Tokens saved under ~/.config/google-calendar-mcp/tokens.json");
  console.log("Restart the worker, then: npm run test:mcp");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
