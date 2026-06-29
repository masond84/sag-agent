import { logActivity } from "../activity-log.js";
import type { ToolDefinition } from "../llm.js";
import { McpClientPool } from "./client-pool.js";
import { loadMcpServerConfigs, isMcpEnabled } from "./config.js";
import { bindingsToToolDefinitions } from "./tool-bridge.js";
import type { McpRegistrySnapshot, McpToolBinding } from "./types.js";

const pool = new McpClientPool();
let toolBindings: McpToolBinding[] = [];
let initialized = false;

function getResultMaxChars(): number {
  const parsed = Number(process.env.MCP_RESULT_MAX_CHARS ?? 8000);
  return Number.isFinite(parsed) && parsed > 500 ? parsed : 8000;
}

function extractMcpContentText(result: unknown): string | null {
  if (!result || typeof result !== "object") {
    return null;
  }

  const content = (result as { content?: unknown }).content;
  if (!Array.isArray(content)) {
    return null;
  }

  const parts: string[] = [];
  for (const block of content) {
    if (!block || typeof block !== "object") {
      continue;
    }

    const typed = block as { type?: string; text?: string };
    if (typed.type === "text" && typeof typed.text === "string" && typed.text.trim()) {
      parts.push(typed.text.trim());
    }
  }

  return parts.length > 0 ? parts.join("\n\n") : null;
}

function formatToolResult(result: unknown): string {
  let text: string;

  if (typeof result === "string") {
    text = result;
  } else {
    const extracted = extractMcpContentText(result);
    text = extracted ?? JSON.stringify(result, null, 2);
  }

  const maxChars = getResultMaxChars();
  if (text.length <= maxChars) {
    return text;
  }

  return `${text.slice(0, maxChars - 3)}...`;
}

export async function initMcpBridge(): Promise<void> {
  if (initialized || !isMcpEnabled()) {
    return;
  }

  const configs = await loadMcpServerConfigs();
  if (configs.length === 0) {
    initialized = true;
    return;
  }

  toolBindings = await pool.connectAll(configs);
  initialized = true;
}

export async function shutdownMcpBridge(): Promise<void> {
  await pool.shutdown();
  toolBindings = [];
  initialized = false;
}

export function getMcpToolDefinitions(): ToolDefinition[] {
  return bindingsToToolDefinitions(toolBindings);
}

export function getMcpRegistrySnapshot(): McpRegistrySnapshot {
  return {
    enabled: isMcpEnabled(),
    servers: pool.getStatuses(),
    tools: toolBindings,
  };
}

export function formatMcpHealthSummary(): string {
  const snapshot = getMcpRegistrySnapshot();
  if (!snapshot.enabled) {
    return "disabled";
  }

  if (snapshot.servers.length === 0) {
    return "no servers configured";
  }

  return snapshot.servers
    .map((server) => {
      if (server.error) {
        return `${server.id}: error — ${server.error}`;
      }
      if (!server.connected) {
        return `${server.id}: disconnected`;
      }
      return `${server.id}: ok (${server.toolCount} tools)`;
    })
    .join("; ");
}

export function isMcpToolName(name: string): boolean {
  return toolBindings.some((binding) => binding.prefixedName === name);
}

export async function executeMcpTool(name: string, argsJson: string): Promise<string> {
  const binding = pool.findBinding(name);
  if (!binding) {
    return `Unknown MCP tool: ${name}`;
  }

  let args: Record<string, unknown> = {};
  if (argsJson.trim()) {
    try {
      args = JSON.parse(argsJson) as Record<string, unknown>;
    } catch {
      return `Invalid MCP tool arguments (expected JSON): ${argsJson.slice(0, 200)}`;
    }
  }

  try {
    const result = await pool.callTool(binding.server.config.id, binding.binding.serverToolName, args);
    const formatted = formatToolResult(result);

    const query =
      typeof args.query === "string"
        ? args.query.slice(0, 120)
        : binding.binding.serverToolName;

    await logActivity("mcp_tool_call", `MCP ${binding.server.config.id}.${binding.binding.serverToolName}: ${query}`, {
      server: binding.server.config.id,
      tool: binding.binding.serverToolName,
    });

    return formatted;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    await logActivity("mcp_tool_call", `MCP ${binding.server.config.id}.${binding.binding.serverToolName} failed`, {
      server: binding.server.config.id,
      tool: binding.binding.serverToolName,
      error: true,
    });
    return `MCP tool failed: ${detail}`;
  }
}
