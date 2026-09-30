import { logAndChargeServiceUsage } from "../revenue-tracking.js";
import { getServiceConfig } from "../service-config.js";

export interface TranslateRequest {
  text: string;
  /** ISO language code, e.g. "ES", "FR", "DE", "JA" */
  targetLang: string;
  /** Optional ISO source language code. Auto-detected when omitted. */
  sourceLang?: string;
}

export interface TranslateResult {
  text: string;
  detectedSourceLang: string;
  characters: number;
}

const MAX_CHARS_PER_REQUEST = 5000;

function getDeepLBaseUrl(apiKey: string): string {
  // Free-tier keys end with :fx and use the free API host.
  return apiKey.endsWith(":fx") ? "https://api-free.deepl.com" : "https://api.deepl.com";
}

export async function translateText(
  request: TranslateRequest,
  customerId?: string,
): Promise<TranslateResult> {
  const serviceConfig = await getServiceConfig("translation");

  if (!serviceConfig || !serviceConfig.enabled) {
    throw new Error("Translation service is not available");
  }

  const apiKey = process.env.DEEPL_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Translation service is not configured (DEEPL_API_KEY missing)");
  }

  const text = request.text?.trim();
  if (!text) {
    throw new Error("text is required");
  }
  if (!request.targetLang?.trim()) {
    throw new Error('targetLang is required (e.g. "ES", "FR", "DE")');
  }
  if (text.length > MAX_CHARS_PER_REQUEST) {
    throw new Error(`text exceeds ${MAX_CHARS_PER_REQUEST} character limit per request`);
  }

  try {
    const params = new URLSearchParams();
    params.append("text", text);
    params.append("target_lang", request.targetLang.trim().toUpperCase());
    if (request.sourceLang?.trim()) {
      params.append("source_lang", request.sourceLang.trim().toUpperCase());
    }

    const response = await fetch(`${getDeepLBaseUrl(apiKey)}/v2/translate`, {
      method: "POST",
      headers: {
        Authorization: `DeepL-Auth-Key ${apiKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`DeepL request failed (${response.status}): ${detail.slice(0, 200)}`);
    }

    const data = (await response.json()) as {
      translations?: Array<{ detected_source_language?: string; text?: string }>;
    };
    const first = data.translations?.[0];
    if (!first?.text) {
      throw new Error("DeepL returned no translation");
    }

    const characters = text.length;
    const revenue = (serviceConfig.pricing.pricePerUnit ?? 0.000015) * characters;
    const cost = (serviceConfig.backend.costPerUnit ?? 0.000005) * characters;

    await logAndChargeServiceUsage({
      timestamp: new Date().toISOString(),
      serviceId: "translation",
      units: characters,
      revenue,
      cost,
      profit: revenue - cost,
      customerId,
      success: true,
    });

    return {
      text: first.text,
      detectedSourceLang:
        first.detected_source_language ?? request.sourceLang?.toUpperCase() ?? "auto",
      characters,
    };
  } catch (error) {
    await logAndChargeServiceUsage({
      timestamp: new Date().toISOString(),
      serviceId: "translation",
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
