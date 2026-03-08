"use client";

export default function AdminError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  return (
    <div className="p-8">
      <h1 className="text-xl font-bold text-red-700">오류 발생</h1>
      <p className="mt-2 text-sm text-slate">Digest: {error.digest}</p>
      <pre className="mt-4 rounded bg-red-50 p-4 text-sm text-red-800 whitespace-pre-wrap break-all">
        {error.message}
        {"\n\n"}
        {error.stack}
      </pre>
    </div>
  );
}
