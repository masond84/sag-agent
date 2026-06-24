import "dotenv/config";
import { initMcpBridge, getMcpRegistrySnapshot, executeMcpTool, shutdownMcpBridge } from "../core/mcp/index.js";

async function main(): Promise<void> {
  await initMcpBridge();
  const snapshot = getMcpRegistrySnapshot();

  console.log("MCP enabled:", snapshot.enabled);
  console.log("Servers:");
  for (const server of snapshot.servers) {
    console.log(`  - ${server.id}: connected=${server.connected} tools=${server.toolCount}${server.error ? ` error=${server.error}` : ""}`);
  }

  console.log("\nTools:");
  for (const tool of snapshot.tools) {
    console.log(`  - ${tool.prefixedName}`);
  }

  const queryArg = process.argv.find((arg) => arg.startsWith("--query="));
  if (queryArg) {
    const query = queryArg.slice("--query=".length).trim();
    const toolName = snapshot.tools.find((tool) => tool.serverToolName === "search_emails")?.prefixedName;
    if (!toolName) {
      console.error("\nsearch_emails tool not available — check Gmail MCP auth (npm run mcp:gmail-auth).");
      process.exit(1);
    }

    console.log(`\nCalling ${toolName} query="${query}"...`);
    const result = await executeMcpTool(toolName, JSON.stringify({ query, maxResults: 5 }));
    console.log(result);
  } else if (snapshot.tools.length === 0) {
    console.log("\nNo MCP tools loaded. See config/mcp-servers.yaml and README MCP section.");
  } else {
    console.log('\nPass --query="after:2026/06/24" to run a Gmail search smoke test.');
  }

  await shutdownMcpBridge();
}

main().catch(async (error) => {
  console.error(error);
  await shutdownMcpBridge();
  process.exit(1);
});
