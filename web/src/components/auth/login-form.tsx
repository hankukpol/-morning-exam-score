"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

type LoginFormProps = {
  redirectTo: string;
  disabled: boolean;
};

export function LoginForm({ redirectTo, disabled }: LoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (disabled) {
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setErrorMessage(error.message);
        return;
      }

      router.replace(redirectTo || "/admin");
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "로그인 처리 중 오류가 발생했습니다.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <div>
        <label className="mb-2 block text-sm font-medium text-ink" htmlFor="email">
          관리자 이메일
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="w-full rounded-2xl border border-ink/10 bg-mist px-4 py-3 text-sm text-ink outline-none transition focus:border-ember/50 focus:bg-white"
          placeholder="admin@example.com"
          required
          disabled={disabled || submitting}
        />
      </div>
      <div>
        <label className="mb-2 block text-sm font-medium text-ink" htmlFor="password">
          비밀번호
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="w-full rounded-2xl border border-ink/10 bg-mist px-4 py-3 text-sm text-ink outline-none transition focus:border-ember/50 focus:bg-white"
          placeholder="••••••••"
          required
          disabled={disabled || submitting}
        />
      </div>
      {errorMessage ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}
      <button
        type="submit"
        disabled={disabled || submitting}
        className="inline-flex w-full items-center justify-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest disabled:cursor-not-allowed disabled:bg-ink/40"
      >
        {submitting ? "로그인 중..." : "로그인"}
      </button>
    </form>
  );
}
