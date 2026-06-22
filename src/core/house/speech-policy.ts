const DEFAULT_MAX_CHARS = 320;

const UNSPEAKABLE_PATTERNS: RegExp[] = [
  /linear\.app/i,
  /cursor agent:/i,
  /agent summary:/i,
  /merged pr #/i,
  /\bpr #\d+/i,
  /https?:\/\//,
  /```/,
  /\bsrc\/[\w./-]+/,
  /\bconfig\/[\w./-]+/,
  /^#{1,3}\s/m,
  /^files:/im,
  /npm run build/i,
];

function getMaxSpeechChars(): number {
  const parsed = Number(process.env.HOUSE_SPEECH_MAX_CHARS ?? DEFAULT_MAX_CHARS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_CHARS;
}

function matchesUnspeakablePatterns(text: string): boolean {
  return UNSPEAKABLE_PATTERNS.some((pattern) => pattern.test(text));
}

function firstSpeakableLine(text: string, maxChars: number): string | null {
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.length > maxChars) {
      continue;
    }
    if (matchesUnspeakablePatterns(trimmed)) {
      continue;
    }
    return trimmed;
  }
  return null;
}

export function resolveSpeakableText(
  text: string,
  meta?: Record<string, string | number | boolean>,
): string | null {
  if (meta?.speak === false) {
    return null;
  }

  if (meta?.source === "manual") {
    const manual = text.trim();
    return manual || null;
  }

  const override =
    typeof meta?.speechOverride === "string" ? meta.speechOverride.trim() : "";
  if (override) {
    return override;
  }

  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }

  const maxChars = getMaxSpeechChars();

  const lineCount = trimmed.split("\n").filter((line) => line.trim()).length;
  if (lineCount > 2 && (trimmed.includes("\n- ") || trimmed.includes("\n* "))) {
    return null;
  }

  if (trimmed.length <= maxChars && !matchesUnspeakablePatterns(trimmed)) {
    return trimmed;
  }

  const line = firstSpeakableLine(trimmed, maxChars);
  if (line) {
    return line;
  }

  return null;
}
