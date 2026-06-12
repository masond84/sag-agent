import { google } from "googleapis";
import type { EmailMessage } from "../types.js";

function getOAuthClient() {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    return null;
  }

  const oauth2Client = new google.auth.OAuth2(
    clientId.trim(),
    clientSecret.trim(),
    "http://127.0.0.1:3456/oauth2callback",
  );
  oauth2Client.setCredentials({ refresh_token: refreshToken.trim() });
  return oauth2Client;
}

export function formatGmailAuthError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("invalid_grant")) {
    return [
      "Gmail auth failed: invalid_grant.",
      "This usually means the refresh token in .env is expired, revoked, or does not match your Client ID/Secret.",
      "Fix: run `npm run auth:gmail` again, approve access, and replace GMAIL_REFRESH_TOKEN in .env with the new value.",
    ].join(" ");
  }
  return message;
}

export function isGmailConfigured(): boolean {
  return Boolean(
    process.env.GMAIL_CLIENT_ID &&
      process.env.GMAIL_CLIENT_SECRET &&
      process.env.GMAIL_REFRESH_TOKEN,
  );
}

function decodeBody(data?: string | null): string | undefined {
  if (!data) {
    return undefined;
  }

  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

interface MessagePart {
  mimeType?: string | null;
  body?: { data?: string | null } | null;
  parts?: MessagePart[] | null;
}

function extractBodies(payload: MessagePart | undefined): {
  html?: string;
  text?: string;
} {
  if (!payload) {
    return {};
  }

  let html: string | undefined;
  let text: string | undefined;

  const walk = (part: MessagePart): void => {
    if (part.mimeType === "text/html" && part.body?.data) {
      html = decodeBody(part.body.data);
    }
    if (part.mimeType === "text/plain" && part.body?.data) {
      text = decodeBody(part.body.data);
    }
    for (const child of part.parts ?? []) {
      walk(child);
    }
  };

  walk(payload);
  return { html, text };
}

function parseFromHeader(fromHeader: string): string {
  const match = fromHeader.match(/<([^>]+)>/);
  return (match?.[1] ?? fromHeader).trim().toLowerCase();
}

export async function fetchMessages(query: string, maxResults = 10): Promise<EmailMessage[]> {
  const auth = getOAuthClient();
  if (!auth) {
    throw new Error(
      "Gmail is not configured. Set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, and GMAIL_REFRESH_TOKEN in .env",
    );
  }

  const gmail = google.gmail({ version: "v1", auth });
  const userId = process.env.GMAIL_USER ?? "me";

  const listResponse = await gmail.users.messages.list({
    userId,
    q: query,
    maxResults,
  });

  const messages = listResponse.data.messages ?? [];
  const results: EmailMessage[] = [];

  for (const item of messages) {
    if (!item.id) {
      continue;
    }

    const detail = await gmail.users.messages.get({
      userId,
      id: item.id,
      format: "full",
    });

    const headers = detail.data.payload?.headers ?? [];
    const getHeader = (name: string) =>
      headers.find((header) => header.name?.toLowerCase() === name.toLowerCase())?.value ?? "";

    const { html, text } = extractBodies(detail.data.payload ?? undefined);

    results.push({
      id: item.id,
      threadId: item.threadId ?? "",
      from: parseFromHeader(getHeader("From")),
      subject: getHeader("Subject"),
      date: getHeader("Date"),
      html,
      text,
    });
  }

  return results;
}
