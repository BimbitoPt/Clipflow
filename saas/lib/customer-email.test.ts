import { describe, expect, it } from "vitest";
import { resolveCustomerEmail } from "./customer-email";

const stripe = {
  customers: {
    retrieve: async () =>
      ({
        object: "customer",
        email: "retrieved@x.co",
      }) as never,
  },
} as unknown as import("stripe").Stripe;

const none: import("stripe").Stripe = {
  customers: {
    retrieve: async () => {
      throw new Error("boom");
    },
  },
} as unknown as import("stripe").Stripe;

function makeStripe(deleteFirst: boolean, email: string): import("stripe").Stripe {
  return {
    customers: {
      retrieve: async () =>
        deleteFirst
          ? ({ id: "cus_1", deleted: true } as never)
          : ({ id: "cus_1", email } as never),
    },
  } as unknown as import("stripe").Stripe;
}

describe("resolveCustomerEmail", () => {
  it("uses customer_email first", async () => {
    expect(
      await resolveCustomerEmail({ customer_email: "direct@x.co" }, stripe),
    ).toBe("direct@x.co");
  });

  it("falls back to customer_details.email", async () => {
    expect(
      await resolveCustomerEmail(
        { customer_details: { email: "details@x.co" } },
        stripe,
      ),
    ).toBe("details@x.co");
  });

  it("retrieves the customer email as last resort", async () => {
    expect(
      await resolveCustomerEmail({ customer: "cus_1" }, makeStripe(false, "retrieved@x.co")),
    ).toBe("retrieved@x.co");
  });

  it("skips deleted customers", async () => {
    expect(
      await resolveCustomerEmail({ customer: "cus_1" }, makeStripe(true, "retrieved@x.co")),
    ).toBeUndefined();
  });

  it("returns undefined when retrieval fails", async () => {
    expect(await resolveCustomerEmail({ customer: "cus_1" }, none)).toBeUndefined();
  });

  it("returns undefined when nothing is resolvable", async () => {
    expect(await resolveCustomerEmail({}, stripe)).toBeUndefined();
    expect(
      await resolveCustomerEmail(
        { customer_email: null, customer_details: { email: "" } },
        stripe,
      ),
    ).toBeUndefined();
  });
});
