"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body>
        <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
          <div style={{ textAlign: "center" }}>
            <h2 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: "0.5rem" }}>Something went wrong</h2>
            <p style={{ color: "#6b7280", fontSize: "0.875rem", marginBottom: "1rem" }}>{error.message}</p>
            <button
              onClick={reset}
              style={{ padding: "0.5rem 1rem", fontSize: "0.875rem", backgroundColor: "#000", color: "#fff", borderRadius: "0.375rem", border: "none", cursor: "pointer" }}
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
