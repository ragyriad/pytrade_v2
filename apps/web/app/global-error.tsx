"use client";

import "./assets/styles/theme.css";

type GlobalErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function GlobalErrorPage({ error, reset }: GlobalErrorPageProps) {
  return (
    <html lang="en">
      <body>
        <main style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
          <section
            style={{
              border: "1px solid var(--color-global-error-accent)",
              borderRadius: "0.5rem",
              margin: "0 auto",
              maxWidth: "48rem",
              padding: "1.5rem",
              textAlign: "center",
            }}
          >
            <p style={{ color: "var(--color-global-error-accent)", fontSize: "0.875rem", fontWeight: 600 }}>
              Application unavailable
            </p>
            <h1 style={{ fontSize: "1.5rem", marginTop: "0.75rem" }}>
              Something failed while loading.
            </h1>
            <p style={{ color: "var(--color-content-secondary)", fontSize: "0.875rem", marginTop: "0.75rem" }}>
              {error.message}
            </p>
            <button
              type="button"
              onClick={reset}
              style={{
                background: "var(--color-global-error-action)",
                border: 0,
                borderRadius: "0.375rem",
                color: "var(--color-on-primary)",
                cursor: "pointer",
                fontWeight: 600,
                marginTop: "1.25rem",
                padding: "0.5rem 1rem",
              }}
            >
              Try again
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
