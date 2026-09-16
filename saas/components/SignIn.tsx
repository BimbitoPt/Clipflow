"use client";

import { signIn } from "next-auth/react";
import { FormEvent, useState } from "react";

export default function SignIn() {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    try {
      await signIn("resend", { email });
    } finally {
      setPending(false);
    }
  }

  return (
    <section id="signin">
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
          {pending ? "Sending..." : "Sign in with email"}
        </button>
      </form>
    </section>
  );
}
