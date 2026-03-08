"use client";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  return (
    <html>
      <body>
        <div style={{ padding: 32, fontFamily: "monospace" }}>
          <h1 style={{ color: "red" }}>Global Error</h1>
          <p>Digest: {error.digest}</p>
          <pre style={{ background: "#fff0f0", padding: 16, fontSize: 12, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
            {error.message}
            {"\n\n"}
            {error.stack}
          </pre>
        </div>
      </body>
    </html>
  );
}
