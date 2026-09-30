import { logAndChargeServiceUsage } from "../revenue-tracking.js";
import { getServiceConfig } from "../service-config.js";

export interface TranscribeRequest {
  audio: Buffer;
  filename?: string;
  /** ISO-639-1 language code, e.g. "en". Helps accuracy; omit for auto-detect. */
  language?: string;
}

export interface TranscribeResult {
  text: string;
  durationSeconds: number;
  billableMinutes: number;
}

// OpenAI /v2 usage endpoint rejects files over 25MB.
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

function buildMultipartBody(
  boundary: string,
  fields: Record<string, string>,
  file: { fieldName: string; filename: string; data: Buffer; contentType: string },
): Buffer {
  const chunks: Buffer[] = [];
  const push = (s: string) => chunks.push(Buffer.from(s, "utf-8"));

  for (const [name, value] of Object.entries(fields)) {
    push(`--${boundary}\r\n`);
    push(`Content-Disposition: form-data; name="${name}"\r\n\r\n`);
    push(`${value}\r\n`);
  }

  push(`--${boundary}\r\n`);
  push(
    `Content-Disposition: form-data; name="${file.fieldName}"; filename="${file.filename}"\r\n`,
  );
  push(`Content-Type: ${file.contentType}\r\n\r\n`);
  chunks.push(file.data);
  push(`\r\n--${boundary}--\r\n`);

  return Buffer.concat(chunks);
}

export async function transcribeAudio(
  request: TranscribeRequest,
  customerId?: string,
): Promise<TranscribeResult> {
  const serviceConfig = await getServiceConfig("transcription");

  if (!serviceConfig || !serviceConfig.enabled) {
    throw new Error("Transcription service is not available");
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Transcription service is not configured (OPENAI_API_KEY missing)");
  }

  if (!request.audio || request.audio.length === 0) {
    throw new Error("audio is required");
  }
  if (request.audio.length > MAX_AUDIO_BYTES) {
    throw new Error("Audio exceeds the 25MB limit — split into smaller chunks");
  }

  try {
    const boundary = `----sag${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
    const fields: Record<string, string> = {
      model: "whisper-1",
      response_format: "verbose_json",
    };
    if (request.language?.trim()) {
      fields.language = request.language.trim().toLowerCase();
    }

    const body = buildMultipartBody(boundary, fields, {
      fieldName: "file",
      filename: request.filename || "audio.m4a",
      data: request.audio,
      contentType: "application/octet-stream",
    });

    // Copy into a fresh ArrayBuffer: DOM fetch typings reject Buffer and
    // ArrayBufferLike-backed views as BodyInit.
    const payload = new Uint8Array(body.length);
    payload.set(body);

    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        "Content-Length": String(body.length),
      },
      body: payload,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Whisper request failed (${response.status}): ${detail.slice(0, 200)}`);
    }

    const data = (await response.json()) as {
      text?: string;
      segments?: Array<{ end?: number }>;
      duration?: number;
    };
    if (!data.text) {
      throw new Error("Whisper returned no transcript");
    }

    // Bill on actual audio minutes from the transcription timestamps (2x markup math).
    const lastEnd = data.segments?.reduce((max, s) => Math.max(max, s.end ?? 0), 0) ?? 0;
    const durationSeconds = Math.max(lastEnd, data.duration ?? 0);
    const billableMinutes = Math.max(1, Math.ceil(durationSeconds / 60));

    const revenue = (serviceConfig.pricing.pricePerUnit ?? 0.012) * billableMinutes;
    const cost = (serviceConfig.backend.costPerUnit ?? 0.006) * billableMinutes;

    await logAndChargeServiceUsage({
      timestamp: new Date().toISOString(),
      serviceId: "transcription",
      units: billableMinutes,
      revenue,
      cost,
      profit: revenue - cost,
      customerId,
      success: true,
    });

    return {
      text: data.text,
      durationSeconds: Math.round(durationSeconds * 100) / 100,
      billableMinutes,
    };
  } catch (error) {
    await logAndChargeServiceUsage({
      timestamp: new Date().toISOString(),
      serviceId: "transcription",
      units: 0,
      revenue: 0,
      cost: 0,
      profit: 0,
      customerId,
      success: false,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
