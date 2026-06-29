import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const MCP_DIR = path.resolve(process.cwd(), "data/gmail-mcp");
const KEYS_FILE = path.join(MCP_DIR, "gcp-oauth.keys.json");

export function getGmailMcpKeysPath(): string {
  return KEYS_FILE;
}

export async function gmailMcpKeysExist(): Promise<boolean> {
  try {
    await access(KEYS_FILE);
    return true;
  } catch {
    return false;
  }
}

/** Build OAuth client JSON from worker Gmail env vars (same Google Cloud client). */
export function buildGmailMcpKeysFromEnv(): Record<string, unknown> | null {
  const clientId = process.env.GMAIL_CLIENT_ID?.trim();
  const clientSecret = process.env.GMAIL_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    return null;
  }

  return {
    web: {
      client_id: clientId,
      project_id: "sag-agent",
      auth_uri: "https://accounts.google.com/o/oauth2/auth",
      token_uri: "https://oauth2.googleapis.com/token",
      auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
      client_secret: clientSecret,
      redirect_uris: ["http://localhost:3000/oauth2callback"],
    },
  };
}

export async function ensureGmailMcpOAuthKeysFile(): Promise<"exists" | "created" | "missing"> {
  if (await gmailMcpKeysExist()) {
    return "exists";
  }

  const keys = buildGmailMcpKeysFromEnv();
  if (!keys) {
    return "missing";
  }

  await mkdir(MCP_DIR, { recursive: true });
  await writeFile(KEYS_FILE, `${JSON.stringify(keys, null, 2)}\n`, "utf8");
  return "created";
}
