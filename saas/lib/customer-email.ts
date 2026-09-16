import Stripe from "stripe";

type EmailSource = {
  customer_email?: string | null;
  customer_details?: { email?: string | null } | null;
  customer?: string | null | CustomerLike;
}

type CustomerLike = { id?: string | null };

export async function resolveCustomerEmail(
  source: EmailSource,
  stripe: Stripe,
): Promise<string | undefined> {
  if (typeof source.customer_email === "string" && source.customer_email) {
    return source.customer_email;
  }
  const detailsEmail = source.customer_details?.email;
  if (typeof detailsEmail === "string" && detailsEmail) {
    return detailsEmail;
  }
  if (typeof source.customer === "string") {
    try {
      const customer = await stripe.customers.retrieve(source.customer);
      if (!("deleted" in customer && customer.deleted) && customer.email) {
        return customer.email;
      }
    } catch {
      return undefined;
    }
  }
  return undefined;
}
