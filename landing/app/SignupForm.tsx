"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  variant: "hero" | "closing";
  id: string;
};

function fmtCount(n: number) {
  return n.toLocaleString("en-US");
}

export default function SignupForm({ variant, id }: Props) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [dup, setDup] = useState(false);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [origin, setOrigin] = useState("");
  const sourceRef = useRef("");

  useEffect(() => {
    setOrigin(window.location.origin);
    const params = new URLSearchParams(window.location.search);
    sourceRef.current =
      params.get("ref") || params.get("utm_source") || params.get("src") || "";
  }, []);

  useEffect(() => {
    if (done) {
      try {
        const res = fetch("/api/waitlist/count")
          .then((r) => r.json())
          .then((d) => setCount(d.count))
          .catch(() => {});
      } catch {}
    }
  }, [done]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = email.trim();
    if (!value) {
      setError("Enter your email.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
      setError("That email doesn't look right. Check it and try again.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: value, source: sourceRef.current }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Try again.");
        setDup(false);
        return;
      }
      setDup(!!data.duplicate);
      setToken(data.token ?? null);
      setDone(true);
    } catch {
      setError("Network hiccup. Try again.");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div
        className="confirmed"
        role="status"
        aria-live="polite"
      >
        <h3>{dup ? "You're already in line." : "You are in."}</h3>
        <p>
          {dup
            ? "This email was already on the waitlist. No need to sign up twice."
            : "Watch for an email from Clipflow."}
        </p>
        <p className="share">
          Want to move up the list?{" "}
          {token ? (
            <>
              Share{" "}
              <a href={`${origin}/?ref=${token}`}>{origin}/?ref={token}</a>{" "}
            </>
          ) : (
            "Share your invite link "
          )}
          and skip ahead for every friend who joins.
        </p>
      </div>
    );
  }

  return (
    <div>
      <form className="form" onSubmit={submit} noValidate aria-label="Join the Clipflow waitlist">
        <label htmlFor={id} className="visually-hidden" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
          Email address
        </label>
        <input
          id={id}
          className="input"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="youremail.com"
          value={email}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(e) => setEmail(e.target.value)}
          disabled={loading}
        />
        <button
          type="submit"
          className="btn-lime"
          disabled={loading}
        >
          {loading
            ? "Joining..."
            : variant === "closing"
            ? "Join the waitlist"
            : "Get early access"}
        </button>
      </form>
      {error && (
        <p className="error" id={`${id}-error`} role="alert">
          {error}
        </p>
      )}
      {variant === "hero" && (
        <p className="reassure">Free for the first 500. No card, no spam, one email when we open.</p>
      )}
      {variant === "closing" && (
        <p className="count">{count !== null ? `${fmtCount(count)}+ creators already in line.` : "1,200+ creators already in line."}</p>
      )}
    </div>
  );
}
