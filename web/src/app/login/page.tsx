import Link from "next/link";
import { LoginForm } from "@/components/auth/login-form";
import { SetupPanel } from "@/components/setup-panel";
import { getSetupState } from "@/lib/env";

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
  const setup = getSetupState();
  const redirectTo = searchParams?.redirectTo ?? "/admin";
  const error = searchParams?.error;

  return (
    <main className="min-h-screen px-6 py-8 sm:px-10 lg:px-16">
      <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[1fr_0.9fr]">
        <section className="rounded-[36px] border border-ink/10 bg-white p-8 shadow-panel sm:p-10">
          <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
            Admin Access
          </div>
          <h1 className="mt-5 text-4xl font-semibold leading-tight">
            Supabase Auth 기반 관리자 로그인
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-8 text-slate sm:text-base">
            Phase 1에서는 관리자 이메일/비밀번호 로그인과 Prisma `admin_users` 역할 체크를
            함께 사용합니다. VIEWER, TEACHER, SUPER_ADMIN 권한은 DB 레코드로 분리됩니다.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <div className="rounded-3xl bg-mist p-5">
              <h2 className="text-lg font-semibold">로그인 후 처리</h2>
              <p className="mt-3 text-sm leading-7 text-slate">
                `/admin` 접근 시 세션을 확인하고, Prisma `admin_users`에 등록된 역할에 따라 메뉴와
                편집 권한을 제어합니다.
              </p>
            </div>
            <div className="rounded-3xl bg-mist p-5">
              <h2 className="text-lg font-semibold">초기 부트스트랩</h2>
              <p className="mt-3 text-sm leading-7 text-slate">
                첫 관리자 계정은 Supabase Auth에서 만든 뒤 `admin_users` 테이블에 UUID와 역할을
                함께 넣으면 됩니다.
              </p>
            </div>
          </div>
          <div className="mt-8">
            <Link
              href="/"
              className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
            >
              홈으로 돌아가기
            </Link>
          </div>
        </section>

        <section className="space-y-6">
          {!setup.supabaseReady || !setup.databaseReady ? (
            <SetupPanel
              title="로그인 전에 환경 변수가 필요합니다."
              description="Supabase URL/Anon Key와 PostgreSQL 연결 정보가 없으면 로그인과 관리자 조회를 수행할 수 없습니다."
              missingKeys={setup.missingKeys}
            />
          ) : (
            <div className="rounded-[36px] border border-ink/10 bg-white p-8 shadow-panel sm:p-10">
              <h2 className="text-2xl font-semibold">관리자 로그인</h2>
              <p className="mt-3 text-sm leading-7 text-slate">
                Supabase Auth 계정으로 로그인한 뒤, 역할 검증이 통과되면 관리자 화면으로 이동합니다.
              </p>
              {error ? (
                <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {errorMessage[error] ?? "로그인 상태를 다시 확인해 주세요."}
                </div>
              ) : null}
              <div className="mt-6">
                <LoginForm redirectTo={redirectTo} disabled={false} />
              </div>
            </div>
          )}

          <div className="rounded-[32px] border border-ink/10 bg-ink p-6 text-sm leading-7 text-white/80 shadow-panel">
            <p className="font-semibold text-white">관리자 역할</p>
            <p className="mt-2">SUPER_ADMIN: 계정 관리, 마이그레이션, 전체 수정 권한</p>
            <p>TEACHER: 성적 입력, 면담, 알림 등 운영 작업</p>
            <p>VIEWER: 조회와 내보내기 전용</p>
          </div>
        </section>
      </div>
    </main>
  );
}
