import "dotenv/config";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const MCP_DIR = path.resolve(process.cwd(), "data/gmail-mcp");

async function main(): Promise<void> {
  await mkdir(MCP_DIR, { recursive: true });

  const keysPath = path.join(MCP_DIR, "gcp-oauth.keys.json");
  console.log(`Gmail MCP auth directory: ${MCP_DIR}`);
  console.log(`Place Google OAuth client JSON at: ${keysPath}`);
  console.log("Then complete the browser sign-in when prompted.\n");

  const child = spawn(
    "npx",
    ["-y", "@gongrzhe/server-gmail-autoauth-mcp@latest", "auth"],
    {
      cwd: MCP_DIR,
      stdio: "inherit",
      shell: false,
    },
  );

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

  console.log("\nGmail MCP auth complete. Restart the worker to load MCP tools.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
