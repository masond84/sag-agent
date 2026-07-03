import type { IncomingMessage } from "node:http";
import { findCustomerByApiKey } from "./customers.js";

export interface AuthenticatedCustomer {
  customerId: string;
  apiKey: string;
  creditsBalance: number;
  email?: string;
}

export function extractApiKey(req: IncomingMessage): string | null {
  const headerKey = req.headers["x-api-key"];
  if (typeof headerKey === "string" && headerKey.trim()) {
    return headerKey.trim();
  }

  const authorization = req.headers.authorization;
  if (typeof authorization === "string" && authorization.toLowerCase().startsWith("bearer ")) {
    const token = authorization.slice(7).trim();
    return token || null;
  }

  return null;
}

export function isIncomeApiKeyRequired(): boolean {
  if (process.env.INCOME_API_KEY_REQUIRED === "false") {
    return false;
  }
  if (process.env.INCOME_API_KEY_REQUIRED === "true") {
    return true;
  }
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export async function authenticateRequest(
  req: IncomingMessage,
): Promise<AuthenticatedCustomer | null> {
  const apiKey = extractApiKey(req);
  if (!apiKey) {
    return null;
  }

  const match = await findCustomerByApiKey(apiKey);
  if (!match) {
    return null;
  }

  return {
    customerId: match.customerId,
    apiKey,
    creditsBalance: match.customer.creditsBalance,
    email: match.customer.email,
  };
}
