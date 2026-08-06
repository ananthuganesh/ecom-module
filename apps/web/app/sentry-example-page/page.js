"use client";

import * as Sentry from "@sentry/nextjs";

/**
 * Temporary verification page for Sentry Next.js setup.
 * Visit /sentry-example-page and click the button, then check Sentry Issues.
 */
export default function SentryExamplePage() {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN || "";
  const match = dsn.match(/\/(\d+)\s*$/);
  const projectId = match?.[1] || "(missing DSN)";

  return (
    <main style={{ padding: 32, fontFamily: "system-ui, sans-serif" }}>
      <h1>Sentry example</h1>
      <p>Trigger a client-side error to verify the Next.js SDK.</p>
      <p style={{ color: "#555", fontSize: 14 }}>
        Events go to Sentry project ID: <strong>{projectId}</strong>
      </p>
      <button
        type="button"
        onClick={async () => {
          await Sentry.captureException(
            new Error("Sentry Next.js test error — delete me"),
          );
          await Sentry.flush(3000);
          // Matches Sentry docs verify step
          myUndefinedFunction();
        }}
        style={{
          marginTop: 12,
          padding: "10px 16px",
          borderRadius: 8,
          border: "1px solid #ccc",
          background: "#111",
          color: "#fff",
          cursor: "pointer",
        }}
      >
        Throw test error
      </button>
    </main>
  );
}
