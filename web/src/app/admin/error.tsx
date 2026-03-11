"use client";

import {
  getDisplayErrorDetails,
  getDisplayErrorMessage,
} from "@/lib/error-display";

export default function AdminError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  const details = getDisplayErrorDetails(error);

  return (
    <div className="p-8">
      <h1 className="text-xl font-bold text-red-700">오류 발생</h1>
      <p className="mt-2 text-sm text-slate">Digest: {error.digest}</p>
      <p className="mt-4 text-sm text-slate">{getDisplayErrorMessage(error)}</p>
      {details ? (
        <pre className="mt-4 rounded bg-red-50 p-4 text-sm text-red-800 whitespace-pre-wrap break-all">
          {details}
        </pre>
      ) : null}
    </div>
  );
}
