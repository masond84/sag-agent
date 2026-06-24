import { mkdir } from "node:fs/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { McpServerConfig, McpServerStatus, McpToolBinding } from "./types.js";
import { mapServerTools } from "./tool-bridge.js";

interface ConnectedMcpServer {
  config: McpServerConfig;
  client?: Client;
  transport?: StdioClientTransport;
  tools: McpToolBinding[];
  error?: string;
}

export class McpClientPool {
  private servers = new Map<string, ConnectedMcpServer>();

  async connectAll(configs: McpServerConfig[]): Promise<McpToolBinding[]> {
    const allTools: McpToolBinding[] = [];

    for (const config of configs) {
      try {
        const bindings = await this.connectServer(config);
        allTools.push(...bindings);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        console.error(`[error] MCP server "${config.id}" failed to connect: ${detail}`);
        this.servers.set(config.id, {
          config,
          tools: [],
          error: detail,
        });
      }
    }

    return allTools;
  }

  private async connectServer(config: McpServerConfig): Promise<McpToolBinding[]> {
    if (config.cwd) {
      await mkdir(config.cwd, { recursive: true });
    }

    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args,
      cwd: config.cwd,
      env: config.env,
      stderr: "pipe",
    });

    const client = new Client({ name: "sag-agent", version: "0.1.0" });
    await client.connect(transport);

    const listed = await client.listTools();
    const bindings = mapServerTools(config, listed.tools ?? []);

    this.servers.set(config.id, {
      config,
      client,
      transport,
      tools: bindings,
    });

    console.log(`[info] MCP server "${config.id}" connected (${bindings.length} tool(s))`);
    return bindings;
  }

  getToolBindings(): McpToolBinding[] {
    return [...this.servers.values()].flatMap((server) => server.tools);
  }

  getStatuses(): McpServerStatus[] {
    return [...this.servers.entries()].map(([id, server]) => ({
      id,
      connected: Boolean(server.client && !server.error),
      toolCount: server.tools.length,
      error: server.error,
    }));
  }

  findBinding(prefixedName: string): { server: ConnectedMcpServer; binding: McpToolBinding } | null {
    for (const server of this.servers.values()) {
      const binding = server.tools.find((tool) => tool.prefixedName === prefixedName);
      if (binding && server.client && !server.error) {
        return { server, binding };
      }
    }
    return null;
  }

  async callTool(serverId: string, toolName: string, args: Record<string, unknown>): Promise<unknown> {
    const server = this.servers.get(serverId);
    if (!server?.client || server.error) {
      throw new Error(`MCP server "${serverId}" is not connected`);
    }

    return server.client.callTool({
      name: toolName,
      arguments: args,
    });
  }

  async shutdown(): Promise<void> {
    for (const [id, server] of this.servers.entries()) {
      if (!server.client) {
        continue;
      }

      try {
        await server.client.close();
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        console.warn(`[warn] MCP server "${id}" shutdown error: ${detail}`);
      }
    }

    this.servers.clear();
  }
}
