import Link from "next/link";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { SetupPanel } from "@/components/setup-panel";
import { ADMIN_NAV_ITEMS, ROLE_LABEL } from "@/lib/constants";
import { getSetupState } from "@/lib/env";
import { getCurrentAdminContext, roleAtLeast } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const setup = getSetupState();

  if (!setup.supabaseReady || !setup.databaseReady) {
    return (
      <main className="min-h-screen px-6 py-8 sm:px-10 lg:px-16">
        <div className="mx-auto max-w-5xl">
          <SetupPanel
            title="관리자 화면을 열기 전에 Supabase와 DB 연결이 필요합니다."
            description="Phase 1 UI는 연결 정보만 채워지면 바로 동작하도록 준비되어 있습니다. 먼저 `.env.local`을 채운 뒤 다시 접속하세요."
            missingKeys={setup.missingKeys}
          />
        </div>
      </main>
    );
  }

  const context = await getCurrentAdminContext();

  if (!context) {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      return (
        <main className="min-h-screen px-6 py-8 sm:px-10 lg:px-16">
          <div className="mx-auto max-w-4xl rounded-[32px] border border-ink/10 bg-white p-8 shadow-panel">
            <div className="inline-flex rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-red-700">
              Access Denied
            </div>
            <h1 className="mt-5 text-3xl font-semibold">관리자 권한이 연결되지 않았습니다.</h1>
            <p className="mt-4 text-sm leading-7 text-slate">
              Supabase Auth 로그인은 되었지만 `admin_users` 테이블에 현재 계정이 등록되지 않았거나 비활성 상태입니다.
              SUPER_ADMIN 계정이 먼저 연결되어 있어야 합니다.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/login?error=unauthorized"
                className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
              >
                로그인 화면
              </Link>
              <SignOutButton />
            </div>
          </div>
        </main>
      );
    }
  }

  if (!context) {
    return (
      <main className="min-h-screen px-6 py-8 sm:px-10 lg:px-16">
        <div className="mx-auto max-w-4xl rounded-[32px] border border-ink/10 bg-white p-8 shadow-panel">
          <p className="text-sm text-slate">로그인이 필요합니다.</p>
          <Link
            href="/login?redirectTo=/admin"
            className="mt-4 inline-flex items-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest"
          >
            로그인하러 가기
          </Link>
        </div>
      </main>
    );
  }

  const navigation = ADMIN_NAV_ITEMS.filter((item) =>
    roleAtLeast(context.adminUser.role, item.minRole),
  );

  return (
    <div className="min-h-screen px-4 py-4 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel">
          <Link href="/" className="inline-flex text-sm font-semibold uppercase tracking-[0.2em] text-ember">
            Morning Mock
          </Link>
          <h1 className="mt-4 text-2xl font-semibold leading-tight">
            아침모의고사 관리자
          </h1>
          <div className="mt-6 rounded-3xl bg-mist p-4">
            <p className="text-sm font-semibold">{context.adminUser.name}</p>
            <p className="mt-1 text-sm text-slate">{context.adminUser.email}</p>
            <p className="mt-3 inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold text-forest">
              {ROLE_LABEL[context.adminUser.role]}
            </p>
          </div>

          <nav className="mt-6 space-y-3">
            {navigation.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="block rounded-3xl border border-ink/10 px-4 py-4 transition hover:border-ember/30 hover:bg-mist"
              >
                <p className="text-sm font-semibold">{item.label}</p>
                <p className="mt-1 text-xs leading-6 text-slate">{item.description}</p>
              </Link>
            ))}
          </nav>

          <div className="mt-6 pt-2">
            <SignOutButton />
          </div>
        </aside>

        <main className="rounded-[32px] border border-ink/10 bg-white shadow-panel">
          {children}
        </main>
      </div>
    </div>
  );
}
