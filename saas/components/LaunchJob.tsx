"use client";

import { FormEvent, useState } from "react";

export default function LaunchJob() {
  const [idea, setIdea] = useState("");
  const [jobId, setJobId] = useState<number | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setJobId(null);
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea, voice: "auto" }),
      });
      const body = await res.json();
      if (res.ok && typeof body?.id === "number") {
        setJobId(body.id);
        setIdea("");
      } else if (res.status === 401) {
        setError("Sign in first to launch a job.");
      } else if (body?.error === "quota") {
        setError("Monthly render quota reached.");
      } else if (body?.error === "empty idea") {
        setError("Enter an idea first.");
      } else {
        setError("Something went wrong. Try again.");
      }
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section id="launch">
      <form onSubmit={onSubmit}>
        <textarea
          name="idea"
          placeholder="Describe your video idea"
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
          required
          maxLength={1000}
        />
        <button type="submit" disabled={pending}>
          {pending ? "Launching..." : "Launch video job"}
        </button>
      </form>
      {jobId !== null && <p role="status">Job launched with id {jobId}.</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
