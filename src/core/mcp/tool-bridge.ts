import type { ToolDefinition } from "../llm.js";
import { MCP_TOOL_SEPARATOR, type McpServerConfig, type McpToolBinding } from "./types.js";

interface McpListedTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

function normalizeInputSchema(schema: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!schema || typeof schema !== "object") {
    return { type: "object", properties: {}, additionalProperties: false };
  }

  if (schema.type === "object") {
    return {
      ...schema,
      additionalProperties: schema.additionalProperties ?? false,
    };
  }

  return { type: "object", properties: {}, additionalProperties: false };
}

function isToolAllowed(server: McpServerConfig, toolName: string): boolean {
  if (server.blocked_tools?.includes(toolName)) {
    return false;
  }

  if (server.allowed_tools && server.allowed_tools.length > 0) {
    return server.allowed_tools.includes(toolName);
  }

  return true;
}

export function buildPrefixedToolName(prefix: string, toolName: string): string {
  return `${prefix}${MCP_TOOL_SEPARATOR}${toolName}`;
}

export function mapServerTools(server: McpServerConfig, listedTools: McpListedTool[]): McpToolBinding[] {
  const bindings: McpToolBinding[] = [];

  for (const tool of listedTools) {
    if (!isToolAllowed(server, tool.name)) {
      continue;
    }

    const prefixedName = buildPrefixedToolName(server.tool_prefix, tool.name);
    const description = [
      tool.description?.trim(),
      `(MCP connector: ${server.id})`,
      server.id === "gmail"
        ? "Use Gmail search syntax in query: from:, subject:, after:YYYY/MM/DD, before:, is:unread, label:."
        : "",
    ]
      .filter(Boolean)
      .join(" ");

    bindings.push({
      serverId: server.id,
      serverToolName: tool.name,
      prefixedName,
      definition: {
        name: prefixedName,
        description,
        parameters: normalizeInputSchema(tool.inputSchema),
      },
    });
  }

  return bindings;
}

export function bindingsToToolDefinitions(bindings: McpToolBinding[]): ToolDefinition[] {
  return bindings.map((binding) => binding.definition);
}
