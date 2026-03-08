import { LoginForm } from "@/components/auth/login-form";

type LoginPageProps = {
  searchParams?: {
    redirectTo?: string;
    error?: string;
  };
};

const errorMessage: Record<string, string> = {
  unauthorized: "관리자 권한이 있는 계정으로 로그인해야 합니다.",
  invalid: "로그인 세션을 다시 확인해 주세요.",
};

export default function LoginPage({ searchParams }: LoginPageProps) {
  const redirectTo = searchParams?.redirectTo ?? "/admin";
  const error = searchParams?.error;

  return (
    <main className="flex min-h-screen items-center justify-center bg-mist px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-ink">아침모의고사 관리</h1>
          <p className="mt-2 text-sm text-slate">관리자 계정으로 로그인하세요</p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-8 shadow-panel">
          {error ? (
            <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {errorMessage[error] ?? "로그인 상태를 다시 확인해 주세요."}
            </div>
          ) : null}
          <LoginForm redirectTo={redirectTo} disabled={false} />
        </div>
      </div>
    </main>
  );
}
