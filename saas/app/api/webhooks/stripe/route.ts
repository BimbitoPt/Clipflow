import { NextResponse } from "next/server";
import Stripe from "stripe";
import type { Database } from "better-sqlite3";
import { getDb } from "@/lib/db";
import { setSubscription } from "@/lib/billing";

export const runtime = "nodejs";

const KNOWN_EVENTS = new Set([
  "checkout.session.completed",
  "customer.subscription.updated",
  "customer.subscription.deleted",
]);

type EmailLike = { customer_email?: string | null; client_details?: { email?: string | null } | null };
type MetadataLike = { metadata?: Record<string, string> | null };
type StatusLike = { status?: string | null };

function upsertFromSession(event: Stripe.CheckoutSessionCompletedEvent) {
  const session = event.data.object as EmailLike & MetadataLike;
  const email = session.customer_email || session.client_details?.email;
  const tier = session.metadata?.tier;
  if (!email || !tier) return;
  setSubscription(getDb(), email, tier, "active");
}

async function upsertFromSubscription(event: Stripe.CustomerSubscriptionUpdatedEvent, stripe: Stripe) {
  const sub = event.data.object as MetadataLike & StatusLike;
  const tier = sub.metadata?.tier;
  const status = sub.status;
  if (!tier || !status) return;
  const email = await emailForSubscription(event, stripe);
  if (!email) return;
  if (status === "active" || status === "trialing") {
    setSubscription(getDb(), email, tier, status);
  } else {
    setSubscription(getDb(), email, readStoredTier(getDb(), email) || tier, status);
  }
}

async function cancelSubscription(event: Stripe.CustomerSubscriptionDeletedEvent, stripe: Stripe) {
  const sub = event.data.object as MetadataLike & StatusLike;
  const email = await emailForSubscription(event, stripe);
  if (!email) return;
  const tier = sub.metadata?.tier || readStoredTier(getDb(), email) || "free";
  setSubscription(getDb(), email, tier, "canceled");
}

function readStoredTier(db: Database, email: string): string | undefined {
  const row = db
    .prepare("SELECT tier FROM subscriptions WHERE user_email = ?")
    .get(email) as { tier: string } | undefined;
  return row?.tier;
}

async function emailForSubscription(
  event: Stripe.CustomerSubscriptionUpdatedEvent | Stripe.CustomerSubscriptionDeletedEvent,
  stripe: Stripe,
): Promise<string | undefined> {
  const sub = event.data.object as {
    customer?: string | null;
    customer_email?: string | null;
    customer_details?: { email?: string | null } | null;
  };
  const direct = sub.customer_email || sub.customer_details?.email;
  if (direct) return direct;
  if (typeof sub.customer === "string") {
    try {
      const customer = await stripe.customers.retrieve(sub.customer);
      if (!customer.deleted && typeof customer.email === "string") return customer.email;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export async function POST(request: Request) {
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "billing not configured" }, { status: 503 });
  }

  const body = await request.text();
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "missing signature" }, { status: 400 });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  if (KNOWN_EVENTS.has(event.type)) {
    try {
      if (event.type === "checkout.session.completed") {
        upsertFromSession(event as Stripe.CheckoutSessionCompletedEvent);
      } else if (event.type === "customer.subscription.updated") {
        upsertFromSubscription(event as Stripe.CustomerSubscriptionUpdatedEvent, stripe);
      } else if (event.type === "customer.subscription.deleted") {
        cancelSubscription(event as Stripe.CustomerSubscriptionDeletedEvent, stripe);
      }
      return NextResponse.json({ received: true });
    } catch {
      return NextResponse.json({ received: true });
    }
  }

  return NextResponse.json({ received: true });
}
