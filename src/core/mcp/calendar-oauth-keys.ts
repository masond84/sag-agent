import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const CALENDAR_MCP_DIR = path.resolve(process.cwd(), "data/calendar-mcp");
const CALENDAR_KEYS_FILE = path.join(CALENDAR_MCP_DIR, "gcp-oauth.keys.json");
const GMAIL_KEYS_FILE = path.resolve(process.cwd(), "data/gmail-mcp/gcp-oauth.keys.json");

export function getCalendarMcpKeysPath(): string {
  return CALENDAR_KEYS_FILE;
}

interface OAuthClientBlock {
  client_id?: string;
  client_secret?: string;
  redirect_uris?: string[];
  auth_uri?: string;
  token_uri?: string;
  auth_provider_x509_cert_url?: string;
}

function toInstalledBlock(block: OAuthClientBlock): Record<string, unknown> | null {
  const clientId = block.client_id?.trim();
  const clientSecret = block.client_secret?.trim();
  if (!clientId || !clientSecret) {
    return null;
  }

  return {
    installed: {
      client_id: clientId,
      project_id: "sag-agent",
      auth_uri: block.auth_uri ?? "https://accounts.google.com/o/oauth2/auth",
      token_uri: block.token_uri ?? "https://oauth2.googleapis.com/token",
      auth_provider_x509_cert_url:
        block.auth_provider_x509_cert_url ?? "https://www.googleapis.com/oauth2/v1/certs",
      client_secret: clientSecret,
      redirect_uris: block.redirect_uris?.length
        ? block.redirect_uris
        : ["http://localhost/oauth2callback", "http://127.0.0.1/oauth2callback"],
    },
  };
}

function parseOAuthKeys(raw: string): Record<string, unknown> | null {
  const parsed = JSON.parse(raw) as {
    installed?: OAuthClientBlock;
    web?: OAuthClientBlock;
    client_id?: string;
    client_secret?: string;
    redirect_uris?: string[];
  };

  if (parsed.installed) {
    return toInstalledBlock(parsed.installed);
  }
  if (parsed.web) {
    return toInstalledBlock(parsed.web);
  }
  if (parsed.client_id && parsed.client_secret) {
    return toInstalledBlock(parsed);
  }

  return null;
}

/** Calendar MCP expects `installed` OAuth JSON — convert from Gmail web keys when needed. */
export async function ensureCalendarMcpOAuthKeysFile(): Promise<"exists" | "created" | "missing"> {
  try {
    await access(CALENDAR_KEYS_FILE);
    return "exists";
  } catch {
    // create below
  }

  let raw: string;
  try {
    raw = await readFile(GMAIL_KEYS_FILE, "utf8");
  } catch {
    return "missing";
  }

  const keys = parseOAuthKeys(raw);
  if (!keys) {
    return "missing";
  }

  await mkdir(CALENDAR_MCP_DIR, { recursive: true });
  await writeFile(CALENDAR_KEYS_FILE, `${JSON.stringify(keys, null, 2)}\n`, "utf8");
  return "created";
}
