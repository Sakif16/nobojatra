"use client";

import { useEffect } from "react";

/**
 * The last resort: shown when the root layout itself fails, so nothing of the
 * app's own shell or stylesheet can be relied on. It carries its own html and
 * body, and plain inline styles, for that reason.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Application failed to render:", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#111",
          color: "#f5f5f5",
          fontFamily: "system-ui, sans-serif",
          padding: "1.5rem",
          textAlign: "center",
        }}
      >
        <main>
          <h1 style={{ fontSize: "1.5rem", margin: 0 }}>NoboJatra could not start</h1>
          <p role="alert" style={{ marginTop: "0.75rem", opacity: 0.8 }}>
            Something went wrong loading the app. Please try again.
          </p>
          {error.digest && (
            <p style={{ marginTop: "0.5rem", fontSize: "0.75rem", opacity: 0.6 }}>
              Reference: {error.digest}
            </p>
          )}
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "1.5rem",
              padding: "0.625rem 1.25rem",
              borderRadius: "0.5rem",
              border: "1px solid #f5f5f5",
              background: "transparent",
              color: "inherit",
              font: "inherit",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
