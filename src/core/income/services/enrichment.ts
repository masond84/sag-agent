import { logAndChargeServiceUsage } from "../revenue-tracking.js";
import { getServiceConfig } from "../service-config.js";

export interface VerifyEmailRequest {
  email: string;
}

export interface VerifyEmailResult {
  email: string;
  deliverability: string;
  qualityScore: number;
  isValidFormat: boolean;
  isFreeEmail: boolean;
  isDisposableEmail: boolean;
  isCatchAll: boolean;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function verifyEmail(
  request: VerifyEmailRequest,
  customerId?: string,
): Promise<VerifyEmailResult> {
  const serviceConfig = await getServiceConfig("email-verify");

  if (!serviceConfig || !serviceConfig.enabled) {
    throw new Error("Email verification service is not available");
  }

  const apiKey = process.env.EMAIL_VERIFY_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Email verification is not configured (EMAIL_VERIFY_API_KEY missing)");
  }

  const email = request.email?.trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email)) {
    throw new Error("A valid email address is required");
  }

  try {
    const url =
      `https://emailvalidation.abstractapi.com/v1/?` +
      `api_key=${encodeURIComponent(apiKey)}&email=${encodeURIComponent(email)}`;

    const response = await fetch(url);
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Verification provider failed (${response.status}): ${detail.slice(0, 200)}`);
    }

    const data = (await response.json()) as {
      deliverability?: string;
      quality_score?: string | number;
      is_valid_format?: { value?: boolean };
      is_free_email?: { value?: boolean };
      is_disposable_email?: { value?: boolean };
      is_catchall_email?: { value?: boolean };
    };

    const revenue = serviceConfig.pricing.pricePerCall ?? 0.04;
    const cost = serviceConfig.backend.costPerUnit ?? 0.008;

    await logAndChargeServiceUsage({
      timestamp: new Date().toISOString(),
      serviceId: "email-verify",
      units: 1,
      revenue,
      cost,
      profit: revenue - cost,
      customerId,
      success: true,
    });

    return {
      email,
      deliverability: data.deliverability ?? "UNKNOWN",
      qualityScore: Number(data.quality_score ?? 0),
      isValidFormat: data.is_valid_format?.value ?? false,
      isFreeEmail: data.is_free_email?.value ?? false,
      isDisposableEmail: data.is_disposable_email?.value ?? false,
      isCatchAll: data.is_catchall_email?.value ?? false,
    };
  } catch (error) {
    await logAndChargeServiceUsage({
      timestamp: new Date().toISOString(),
      serviceId: "email-verify",
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
