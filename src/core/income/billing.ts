import Stripe from "stripe";
import type { CreditPack } from "../../types.js";
import {
  addCredits,
  createCustomer,
  ensureCustomer,
  getCustomer,
} from "./revenue-tracking.js";

const DEFAULT_CREDIT_PACKS: CreditPack[] = [
  {
    id: "starter",
    name: "Starter",
    description: "$10 API credits",
    amountCents: 1000,
    credits: 10,
  },
  {
    id: "standard",
    name: "Standard",
    description: "$25 API credits",
    amountCents: 2500,
    credits: 25,
  },
  {
    id: "pro",
    name: "Pro",
    description: "$100 API credits",
    amountCents: 10000,
    credits: 100,
  },
];

function getStripeSecretKey(): string | undefined {
  return process.env.STRIPE_SECRET_KEY?.trim() || undefined;
}

function getStripeWebhookSecret(): string | undefined {
  return process.env.STRIPE_WEBHOOK_SECRET?.trim() || undefined;
}

export function isBillingEnabled(): boolean {
  return Boolean(getStripeSecretKey());
}

export function getBillingConfigStatus(): {
  secretKeyConfigured: boolean;
  webhookSecretConfigured: boolean;
  enabled: boolean;
} {
  return {
    secretKeyConfigured: Boolean(getStripeSecretKey()),
    webhookSecretConfigured: Boolean(getStripeWebhookSecret()),
    enabled: isBillingEnabled(),
  };
}

export function getBillingBaseUrl(): string {
  const configured = process.env.BILLING_BASE_URL?.trim();
  if (configured) {
    return configured.replace(/\/$/, "");
  }
  const host = process.env.HOUSE_SERVER_HOST?.trim() || "127.0.0.1";
  const port = process.env.HOUSE_SERVER_PORT?.trim() || "9473";
  return `http://${host}:${port}`;
}

export function getCreditPacks(): CreditPack[] {
  const raw = process.env.STRIPE_CREDIT_PACKS?.trim();
  if (!raw) {
    return DEFAULT_CREDIT_PACKS;
  }

  try {
    const parsed = JSON.parse(raw) as CreditPack[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return DEFAULT_CREDIT_PACKS;
    }
    return parsed;
  } catch {
    return DEFAULT_CREDIT_PACKS;
  }
}

export function getCreditPack(packId: string): CreditPack | undefined {
  return getCreditPacks().find((pack) => pack.id === packId);
}

function getStripeClient(): Stripe {
  const secretKey = getStripeSecretKey();
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }
  return new Stripe(secretKey);
}

export interface CheckoutSessionRequest {
  packId: string;
  customerId?: string;
  email?: string;
  successUrl?: string;
  cancelUrl?: string;
}

export interface CheckoutSessionResult {
  sessionId: string;
  url: string;
  customerId: string;
  pack: CreditPack;
}

export async function createCheckoutSession(
  request: CheckoutSessionRequest,
): Promise<CheckoutSessionResult> {
  const pack = getCreditPack(request.packId);
  if (!pack) {
    throw new Error(`Unknown credit pack: ${request.packId}`);
  }

  const customerId = request.customerId
    ? await ensureCustomer(request.customerId, request.email)
    : await createCustomer(request.email);

  const baseUrl = getBillingBaseUrl();
  const successUrl =
    request.successUrl?.trim() ||
    `${baseUrl}/api/billing/success?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = request.cancelUrl?.trim() || `${baseUrl}/tools?cancelled=1`;

  const stripe = getStripeClient();
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: request.email,
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: `SAG API Credits — ${pack.name}`,
            description: pack.description,
          },
          unit_amount: pack.amountCents,
        },
        quantity: 1,
      },
    ],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      customerId,
      packId: pack.id,
      credits: String(pack.credits),
    },
  });

  if (!session.url) {
    throw new Error("Stripe checkout session did not return a URL");
  }

  return {
    sessionId: session.id,
    url: session.url,
    customerId,
    pack,
  };
}

export interface CheckoutSuccessResult {
  customerId: string;
  creditsAdded: number;
  creditsBalance: number;
  apiKey: string;
  packId: string;
  alreadyProcessed: boolean;
}

export async function getCheckoutSuccess(sessionId: string): Promise<CheckoutSuccessResult> {
  const stripe = getStripeClient();
  const session = await stripe.checkout.sessions.retrieve(sessionId);

  if (session.payment_status !== "paid") {
    throw new Error("Checkout session is not paid yet");
  }

  const customerId = session.metadata?.customerId;
  const packId = session.metadata?.packId;
  const credits = Number(session.metadata?.credits ?? 0);

  if (!customerId || !packId || !Number.isFinite(credits) || credits <= 0) {
    throw new Error("Checkout session is missing billing metadata");
  }

  const paymentId = typeof session.payment_intent === "string"
    ? session.payment_intent
    : session.payment_intent?.id ?? session.id;

  const topUp = await addCredits(customerId, credits, paymentId, {
    stripeCustomerId: typeof session.customer === "string" ? session.customer : undefined,
    email: session.customer_details?.email ?? undefined,
  });

  const customer = await getCustomer(customerId);
  if (!customer) {
    throw new Error("Customer record not found after checkout");
  }

  return {
    customerId,
    creditsAdded: credits,
    creditsBalance: customer.creditsBalance,
    apiKey: customer.apiKey,
    packId,
    alreadyProcessed: topUp.alreadyProcessed,
  };
}

export async function handleStripeWebhook(
  rawBody: string,
  signature: string | undefined,
): Promise<{ handled: boolean; type?: string }> {
  const webhookSecret = getStripeWebhookSecret();
  if (!webhookSecret) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not configured");
  }
  if (!signature) {
    throw new Error("Missing Stripe-Signature header");
  }

  const stripe = getStripeClient();
  const event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.payment_status !== "paid") {
      return { handled: false, type: event.type };
    }

    const customerId = session.metadata?.customerId;
    const credits = Number(session.metadata?.credits ?? 0);
    if (!customerId || !Number.isFinite(credits) || credits <= 0) {
      throw new Error("Checkout session webhook missing billing metadata");
    }

    const paymentId = typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? session.id;

    await addCredits(customerId, credits, paymentId, {
      stripeCustomerId: typeof session.customer === "string" ? session.customer : undefined,
      email: session.customer_details?.email ?? undefined,
    });

    return { handled: true, type: event.type };
  }

  return { handled: false, type: event.type };
}
