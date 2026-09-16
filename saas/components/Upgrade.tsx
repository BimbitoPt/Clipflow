"use client";

import { useState } from "react";

type Tier = "creator" | "studio";

const OPTIONS: { tier: Tier; label: string; price: string }[] = [
  { tier: "creator", label: "Creator", price: "\u20AC19" },
  { tier: "studio", label: "Studio", price: "\u20AC49" },
];

export default function Upgrade() {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onUpgrade(tier: Tier) {
    setPending(tier);
    setError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier }),
      });
      const body = await res.json();
      if (res.ok && body.url) {
        window.location.href = body.url;
        return;
      }
      if (typeof body?.error === "string" && body.error) {
        setError(body.error);
      } else if (res.status === 401) {
        setError("Sign in first to upgrade.");
      } else if (res.status === 503) {
        setError("Billing is not configured yet.");
      } else {
        setError("Something went wrong. Try again.");
      }
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setPending(null);
    }
  }

  return (
    <section id="upgrade">
      <div>
        {OPTIONS.map((option) => (
          <button
            key={option.tier}
            type="button"
            disabled={pending !== null}
            onClick={() => onUpgrade(option.tier)}
          >
            {pending === option.tier ? "Redirecting..." : `${option.label} ${option.price}`}
          </button>
        ))}
      </div>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
