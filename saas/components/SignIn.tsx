"use client";

import { signIn } from "next-auth/react";
import { FormEvent, useState } from "react";

export default function SignIn() {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(false);
    try {
      await signIn("resend", { email });
    } catch {
      setError(true);
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
        {error && <p>Sign-in failed. Try again.</p>}
      </form>
    </section>
  );
}
