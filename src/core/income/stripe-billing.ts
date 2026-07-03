import { promises as fs } from "node:fs";
import path from "node:path";
import Stripe from "stripe";
import type { CreditPackage } from "../../types.js";
import { getCreditPackage, CREDIT_PACKAGES } from "./credit-packages.js";
import {
  addCredits,
  createCustomer,
  createCustomerId,
  ensureCustomerApiKey,
  getCustomer,
} from "./customers.js";

const PROCESSED_EVENTS_FILE = path.join(
  process.cwd(),
  "data",
  "income-services",
  "stripe-events.json",
);

function getStripeSecretKey(): string | null {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  return key || null;
}

function getStripeWebhookSecret(): string | null {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  return secret || null;
}

function getPublicBaseUrl(): string {
  return (
    process.env.INCOME_PUBLIC_BASE_URL?.trim() ||
    process.env.HOUSE_PUBLIC_URL?.trim() ||
    `http://${process.env.HOUSE_SERVER_HOST ?? "127.0.0.1"}:${process.env.HOUSE_SERVER_PORT ?? "9473"}`
  );
}

export function isStripeConfigured(): boolean {
  return Boolean(getStripeSecretKey());
}

export function getStripeClient(): Stripe {
  const secretKey = getStripeSecretKey();
  if (!secretKey) {
    throw new Error("Stripe is not configured. Set STRIPE_SECRET_KEY in .env");
  }
  return new Stripe(secretKey);
}

export function listCreditPackages(): CreditPackage[] {
  return CREDIT_PACKAGES;
}

export interface CheckoutSessionResult {
  checkoutUrl: string;
  sessionId: string;
  customerId: string;
}

export async function createCreditCheckoutSession(options: {
  packageId: string;
  email?: string;
  customerId?: string;
  successUrl?: string;
  cancelUrl?: string;
}): Promise<CheckoutSessionResult> {
  const creditPackage = getCreditPackage(options.packageId);
  if (!creditPackage) {
    throw new Error(`Unknown credit package: ${options.packageId}`);
  }

  const stripe = getStripeClient();
  const baseUrl = getPublicBaseUrl();
  let customerId = options.customerId?.trim();

  if (customerId) {
    const existing = await getCustomer(customerId);
    if (!existing) {
      throw new Error(`Customer not found: ${customerId}`);
    }
  } else {
    customerId = createCustomerId();
    await createCustomer({ customerId, email: options.email, withApiKey: false });
  }

  const successUrl =
    options.successUrl?.trim() ||
    `${baseUrl}/api/billing/session/{CHECKOUT_SESSION_ID}`;
  const cancelUrl = options.cancelUrl?.trim() || `${baseUrl}/api/billing/packages`;

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: options.email,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: Math.round(creditPackage.priceUsd * 100),
          product_data: {
            name: `${creditPackage.name} API credits`,
            description: creditPackage.description,
          },
        },
      },
    ],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      customerId,
      packageId: creditPackage.id,
      creditsUsd: String(creditPackage.creditsUsd),
    },
  });

  if (!session.url) {
    throw new Error("Stripe did not return a checkout URL");
  }

  return {
    checkoutUrl: session.url,
    sessionId: session.id,
    customerId,
  };
}

async function loadProcessedEvents(): Promise<Set<string>> {
  try {
    const content = await fs.readFile(PROCESSED_EVENTS_FILE, "utf-8");
    const parsed = JSON.parse(content) as string[];
    return new Set(parsed);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return new Set();
    }
    throw error;
  }
}

async function markEventProcessed(eventId: string): Promise<void> {
  const processed = await loadProcessedEvents();
  processed.add(eventId);
  await fs.mkdir(path.dirname(PROCESSED_EVENTS_FILE), { recursive: true });
  await fs.writeFile(PROCESSED_EVENTS_FILE, JSON.stringify([...processed], null, 2));
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const customerId = session.metadata?.customerId;
  const creditsUsd = Number(session.metadata?.creditsUsd ?? 0);
  const packageId = session.metadata?.packageId;

  if (!customerId || !Number.isFinite(creditsUsd) || creditsUsd <= 0) {
    throw new Error("Checkout session metadata is missing customer or credit amount");
  }

  let customer = await getCustomer(customerId);
  if (!customer) {
    await createCustomer({
      customerId,
      email: session.customer_details?.email ?? undefined,
      stripeCustomerId: typeof session.customer === "string" ? session.customer : undefined,
      withApiKey: false,
    });
    customer = await getCustomer(customerId);
  }

  if (!customer) {
    throw new Error(`Unable to create customer record for ${customerId}`);
  }

  await addCredits(customerId, creditsUsd, {
    email: session.customer_details?.email ?? undefined,
    stripeCustomerId: typeof session.customer === "string" ? session.customer : undefined,
  });
  await ensureCustomerApiKey(customerId);

  console.log(
    `[info] Stripe checkout completed for ${customerId}: +$${creditsUsd.toFixed(2)} credits (${packageId ?? "unknown package"})`,
  );
}

export async function handleStripeWebhook(rawBody: string, signature: string | undefined): Promise<void> {
  const webhookSecret = getStripeWebhookSecret();
  if (!webhookSecret) {
    throw new Error("Stripe webhook secret is not configured. Set STRIPE_WEBHOOK_SECRET in .env");
  }
  if (!signature) {
    throw new Error("Missing Stripe-Signature header");
  }

  const stripe = getStripeClient();
  const event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  const processed = await loadProcessedEvents();
  if (processed.has(event.id)) {
    return;
  }

  switch (event.type) {
    case "checkout.session.completed":
      await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
      break;
    default:
      break;
  }

  await markEventProcessed(event.id);
}

export async function getCheckoutSessionStatus(sessionId: string): Promise<{
  paid: boolean;
  customerId?: string;
  apiKey?: string;
  creditsBalance?: number;
  creditsPurchased?: number;
  packageId?: string;
}> {
  const stripe = getStripeClient();
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  const customerId = session.metadata?.customerId;
  const paid = session.payment_status === "paid";

  if (!paid || !customerId) {
    return { paid, customerId };
  }

  const customer = await getCustomer(customerId);
  const apiKey = customer ? await ensureCustomerApiKey(customerId) : undefined;

  return {
    paid,
    customerId,
    apiKey,
    creditsBalance: customer?.creditsBalance,
    creditsPurchased: Number(session.metadata?.creditsUsd ?? 0),
    packageId: session.metadata?.packageId,
  };
}
