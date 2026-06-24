import type { ToolDefinition } from "../llm.js";

export const MCP_TOOL_SEPARATOR = "__";

export interface McpServerConfig {
  id: string;
  enabled: boolean;
  command: string;
  args: string[];
  cwd?: string;
  env?: Record<string, string>;
  tool_prefix: string;
  allowed_tools?: string[];
  blocked_tools?: string[];
}

export interface McpToolBinding {
  serverId: string;
  serverToolName: string;
  prefixedName: string;
  definition: ToolDefinition;
}

export interface McpServerStatus {
  id: string;
  connected: boolean;
  toolCount: number;
  error?: string;
}

export interface McpRegistrySnapshot {
  enabled: boolean;
  servers: McpServerStatus[];
  tools: McpToolBinding[];
}
