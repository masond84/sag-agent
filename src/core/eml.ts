export interface ParsedEml {
  from: string;
  subject: string;
  date: string;
  html?: string;
  text?: string;
}

function decodeQuotedPrintable(input: string): string {
  return input
    .replace(/=\r?\n/g, "")
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}

function parseFromHeader(fromHeader: string): string {
  const match = fromHeader.match(/<([^>]+)>/);
  return (match?.[1] ?? fromHeader).trim().toLowerCase();
}

function getHeader(headers: string, name: string): string {
  const pattern = new RegExp(`^${name}:\\s*(.+)$`, "im");
  const match = headers.match(pattern);
  return match?.[1]?.trim() ?? "";
}

export function parseEml(raw: string): ParsedEml {
  const separator = raw.includes("\r\n\r\n") ? "\r\n\r\n" : "\n\n";
  const splitIndex = raw.indexOf(separator);
  const headers = splitIndex >= 0 ? raw.slice(0, splitIndex) : raw;
  let body = splitIndex >= 0 ? raw.slice(splitIndex + separator.length) : "";

  const encoding = getHeader(headers, "Content-Transfer-Encoding").toLowerCase();
  const contentType = getHeader(headers, "Content-Type").toLowerCase();

  if (encoding === "quoted-printable") {
    body = decodeQuotedPrintable(body);
  }

  const parsed: ParsedEml = {
    from: parseFromHeader(getHeader(headers, "From")),
    subject: getHeader(headers, "Subject"),
    date: getHeader(headers, "Date"),
  };

  if (contentType.includes("text/html")) {
    parsed.html = body.trim();
  } else if (contentType.includes("text/plain")) {
    parsed.text = body.trim();
  }

  return parsed;
}

export function parsedEmlToEmailMessage(parsed: ParsedEml, id = "fixture-eml") {
  return {
    id,
    threadId: "fixture-thread",
    from: parsed.from,
    subject: parsed.subject,
    date: parsed.date,
    html: parsed.html,
    text: parsed.text,
  };
}
