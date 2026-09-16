"use client";

import { FormEvent, useState } from "react";

type Status = { kind: "success" } | { kind: "error"; message: string } | null;

const SUCCESS = "You are on the list.";
const DUPLICATE = "That email is already on the list.";
const INVALID = "Enter a valid email.";

export default function Waitlist() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setStatus(null);
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = await res.json();
      if (res.ok && body.ok) {
        setStatus({ kind: "success" });
        setEmail("");
      } else if (body.reason === "duplicate") {
        setStatus({ kind: "error", message: DUPLICATE });
      } else {
        setStatus({ kind: "error", message: INVALID });
      }
    } catch {
      setStatus({ kind: "error", message: INVALID });
    } finally {
      setPending(false);
    }
  }

  return (
    <section id="waitlist">
      <form onSubmit={onSubmit}>
        <input
          type="email"
          name="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <button type="submit" disabled={pending}>
          {pending ? "Joining..." : "Join the waitlist"}
        </button>
      </form>
      {status?.kind === "success" && <p role="status">{SUCCESS}</p>}
      {status?.kind === "error" && <p role="alert">{status.message}</p>}
    </section>
  );
}
