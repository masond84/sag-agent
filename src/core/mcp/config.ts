import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import type { McpServerConfig } from "./types.js";

interface RawMcpConfig {
  servers?: Record<string, Omit<McpServerConfig, "id"> & { enabled?: boolean }>;
}

const ENV_PATTERN = /\$\{([A-Z0-9_]+)\}/g;

function resolveEnvString(value: string): string {
  return value.replace(ENV_PATTERN, (_match, name: string) => process.env[name] ?? "");
}

function resolveEnvRecord(env: Record<string, string> | undefined): Record<string, string> | undefined {
  if (!env) {
    return undefined;
  }

  const resolved: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    resolved[key] = resolveEnvString(value);
  }
  return resolved;
}

export function isMcpEnabled(): boolean {
  return (process.env.MCP_ENABLED ?? "true").toLowerCase() === "true";
}

export function getMcpConfigPath(): string {
  return path.resolve(process.cwd(), process.env.MCP_CONFIG_PATH?.trim() || "config/mcp-servers.yaml");
}

export async function loadMcpServerConfigs(): Promise<McpServerConfig[]> {
  if (!isMcpEnabled()) {
    return [];
  }

  const configPath = getMcpConfigPath();
  let rawText: string;
  try {
    rawText = await readFile(configPath, "utf8");
  } catch {
    console.warn(`[warn] MCP config not found at ${configPath} — MCP disabled`);
    return [];
  }

  const parsed = parse(rawText) as RawMcpConfig;
  const servers = parsed.servers ?? [];
  const configs: McpServerConfig[] = [];

  for (const [id, server] of Object.entries(servers)) {
    if (server.enabled === false) {
      continue;
    }

    configs.push({
      id,
      enabled: true,
      command: server.command,
      args: server.args ?? [],
      cwd: server.cwd ? path.resolve(process.cwd(), server.cwd) : undefined,
      env: resolveEnvRecord(server.env),
      tool_prefix: server.tool_prefix?.trim() || id,
      allowed_tools: server.allowed_tools,
      blocked_tools: server.blocked_tools,
    });
  }

  return configs;
}
