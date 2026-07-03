import type { IncomingMessage } from "node:http";
import { isBillingEnabled } from "./billing.js";
import {
  getCustomerByApiKey,
  hasSufficientCredits,
} from "./revenue-tracking.js";
import { getServiceConfig } from "./service-config.js";

export interface ServiceAuthResult {
  customerId?: string;
  authenticated: boolean;
}

export function extractApiKey(req: IncomingMessage): string | undefined {
  const authorization = req.headers.authorization;
  if (typeof authorization === "string" && authorization.startsWith("Bearer ")) {
    const key = authorization.slice("Bearer ".length).trim();
    if (key) {
      return key;
    }
  }

  const header = req.headers["x-api-key"];
  if (typeof header === "string" && header.trim()) {
    return header.trim();
  }

  return undefined;
}

export async function authenticateServiceRequest(
  req: IncomingMessage,
): Promise<ServiceAuthResult | { error: string; status: number }> {
  const apiKey = extractApiKey(req);

  if (!isBillingEnabled()) {
    return {
      customerId: undefined,
      authenticated: Boolean(apiKey),
    };
  }

  if (!apiKey) {
    return { error: "API key required. Pass Authorization: Bearer <key> or X-API-Key header.", status: 401 };
  }

  const customer = await getCustomerByApiKey(apiKey);
  if (!customer) {
    return { error: "Invalid API key", status: 401 };
  }

  return {
    customerId: customer.customerId,
    authenticated: true,
  };
}

export async function requireCreditsForService(
  customerId: string,
  serviceId: string,
): Promise<{ ok: true } | { error: string; status: number }> {
  const serviceConfig = await getServiceConfig(serviceId);
  if (!serviceConfig) {
    return { error: `Unknown service: ${serviceId}`, status: 404 };
  }

  let minimumCost = 0;
  if (serviceConfig.pricing.model === "per_call") {
    minimumCost = serviceConfig.pricing.pricePerCall ?? 0;
  } else {
    minimumCost = serviceConfig.pricing.pricePerUnit ?? 0;
  }

  const sufficient = await hasSufficientCredits(customerId, minimumCost);
  if (!sufficient) {
    return {
      error: `Insufficient credits. Minimum $${minimumCost.toFixed(2)} required for ${serviceId}.`,
      status: 402,
    };
  }

  return { ok: true };
}
