"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global-error]", error);
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0 }}>
        <div
          style={{
            display: "flex",
            minHeight: "100vh",
            alignItems: "center",
            justifyContent: "center",
            padding: "1.5rem",
          }}
        >
          <div style={{ maxWidth: "28rem", textAlign: "center" }}>
            <h1 style={{ fontSize: "1.25rem", fontWeight: 600 }}>
              Something went wrong
            </h1>
            <p style={{ color: "#666", fontSize: "0.875rem", marginTop: "0.5rem" }}>
              An unexpected error occurred. Please try again.
            </p>
            {error.digest && (
              <p
                style={{
                  fontFamily: "monospace",
                  fontSize: "0.625rem",
                  color: "#999",
                  marginTop: "0.5rem",
                }}
              >
                {error.digest}
              </p>
            )}
            <button
              onClick={reset}
              style={{
                marginTop: "1rem",
                padding: "0.5rem 1rem",
                border: "1px solid #ccc",
                borderRadius: "0.375rem",
                background: "#fff",
                cursor: "pointer",
                fontSize: "0.875rem",
              }}
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
