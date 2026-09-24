import { NextResponse } from "next/server";
import Stripe from "stripe";
import { auth } from "@/auth";

export const runtime = "nodejs";

type Tier = "creator" | "studio";

export async function POST(request: Request) {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let tier: unknown;
  try {
    ({ tier } = await request.json());
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  if (tier !== "creator" && tier !== "studio") {
    return NextResponse.json({ error: "invalid tier" }, { status: 400 });
  }
  const selectedTier = tier as Tier;

  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: "billing not configured" }, { status: 503 });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const origin = new URL(request.url).origin;
  const price =
    selectedTier === "studio"
      ? process.env.STRIPE_PRICE_STUDIO
      : process.env.STRIPE_PRICE_CREATOR;

  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    mode: "subscription",
    line_items: [{ price, quantity: 1 }],
    success_url: `${origin}/app?checkout=success`,
    cancel_url: `${origin}/app?checkout=cancel`,
    customer_email: email,
    metadata: { tier: selectedTier },
    subscription_data: { metadata: { tier: selectedTier } },
  };
  let checkout: Stripe.Checkout.Session;
  try {
    checkout = await stripe.checkout.sessions.create(sessionParams);
  } catch (err) {
    console.error(`checkout session create failed: ${err instanceof Error ? err.message : String(err)}`);
    if (
      err instanceof Stripe.errors.StripeInvalidRequestError ||
      err instanceof Stripe.errors.StripeAuthenticationError
    ) {
      return NextResponse.json({ error: "billing misconfigured" }, { status: 503 });
    }
    if (err instanceof Stripe.errors.StripeAPIError || err instanceof Stripe.errors.StripeConnectionError) {
      return NextResponse.json({ error: "stripe unavailable" }, { status: 502 });
    }
    return NextResponse.json({ error: "checkout failed" }, { status: 500 });
  }
  return NextResponse.json({ url: checkout.url });
}
