import Link from "next/link";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { SetupPanel } from "@/components/setup-panel";
import { ADMIN_NAV_ITEMS, NavItem, ROLE_LABEL } from "@/lib/constants";
import {
  getDisplayErrorDetails,
  getDisplayErrorMessage,
  getServerErrorLogMessage,
} from "@/lib/error-display";
import { getSetupState } from "@/lib/env";
import { getCurrentAdminContext, getCurrentAuthUser, roleAtLeast } from "@/lib/auth";

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

  let context;
  try {
    context = await getCurrentAdminContext();
  } catch (err) {
    const details = getDisplayErrorDetails(err);
    console.error("[AdminLayout] getCurrentAdminContext error:", getServerErrorLogMessage(err));
    return (
      <main className="p-8">
        <h1 className="text-xl font-bold text-red-700">레이아웃 오류</h1>
        <p className="mt-4 text-sm text-slate">
          {getDisplayErrorMessage(err, "관리자 화면을 불러오는 중 오류가 발생했습니다.")}
        </p>
        {details ? (
          <pre className="mt-4 rounded bg-red-50 p-4 text-sm text-red-800 whitespace-pre-wrap break-all">
            {details}
          </pre>
        ) : null}
      </main>
    );
  }

  if (!context) {
    const user = await getCurrentAuthUser();

    if (user) {
      return (
        <main className="min-h-screen px-6 py-8 sm:px-10 lg:px-16 bg-gray-50">
          <div className="mx-auto max-w-4xl card-border p-8">
            <div className="inline-flex border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-red-700">
              Access Denied
            </div>
            <h1 className="mt-5 text-3xl font-semibold">관리자 권한이 연결되지 않았습니다.</h1>
            <p className="mt-4 text-sm leading-7 text-slate">
              Supabase Auth 로그인은 되었지만 `admin_users` 테이블에 현재 계정이 등록되지 않았거나 비활성 상태입니다.
              SUPER_ADMIN 계정이 먼저 연결되어 있어야 합니다.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/login?error=unauthorized"
                className="inline-flex items-center border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
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
      <main className="min-h-screen px-6 py-8 sm:px-10 lg:px-16 bg-gray-50">
        <div className="mx-auto max-w-4xl card-border p-8">
          <p className="text-sm text-slate">로그인이 필요합니다.</p>
          <Link href="/login?redirectTo=/admin"
            className="mt-4 inline-flex items-center bg-primary px-5 py-3 text-sm font-semibold text-white transition hover:bg-primary-dark"
          >
            로그인하러 가기
          </Link>
        </div>
      </main>
    );
  }

  const permittedItems = ADMIN_NAV_ITEMS.filter((item) =>
    roleAtLeast(context.adminUser.role, item.minRole),
  );

  // Group items
  const groups = permittedItems.reduce((acc, item) => {
    if (!acc[item.group]) {
      acc[item.group] = [];
    }
    acc[item.group].push(item);
    return acc;
  }, {} as Record<string, NavItem[]>);

  return (
    <div className="flex min-h-screen bg-[#F3F4F6] flex-col lg:flex-row">
      <aside className="w-full lg:w-[260px] bg-[#0B1120] text-gray-300 flex-shrink-0 flex flex-col min-h-screen">
        <div className="p-6 pb-2">
          <Link href="/" className="inline-flex items-center space-x-2">
            <span className="text-xl font-bold text-white tracking-tight flex items-center">
              <div className="w-8 h-8 bg-primary text-white flex items-center justify-center mr-2 font-black text-lg">M</div>
              Morning Mock
            </span>
          </Link>
        </div>

        <div className="px-6 pb-4 pt-4 border-b border-white/5">
          <div className="bg-[#1E293B] p-4 border-l-2 border-primary">
            <p className="text-sm font-semibold text-white">{context.adminUser.name}</p>
            <p className="mt-1 text-xs text-gray-400">{context.adminUser.email}</p>
            <span className="mt-2 inline-block flex-shrink-0 bg-primary/20 border border-primary/30 text-primary-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
              {ROLE_LABEL[context.adminUser.role]}
            </span>
          </div>
        </div>

        <nav className="flex-1 px-4 py-4 space-y-6 overflow-y-auto custom-scrollbar">
          {Object.entries(groups).map(([groupName, items]) => (
            <div key={groupName}>
              <h3 className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                {groupName}
              </h3>
              <div className="space-y-1">
                {items.map((item) => (
                  <Link key={item.href} href={item.href}
                    className="flex items-center px-4 py-2.5 text-sm font-medium transition-colors hover:bg-white/5 hover:text-white group border-l-2 border-transparent hover:border-primary"
                  >
                    <div className="flex-1">
                      <div className="text-gray-300 group-hover:text-white">{item.label}</div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="p-4 border-t border-white/5 bg-[#0B1120]">
          <SignOutButton />
        </div>
      </aside>

      <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 w-full bg-gray-50">
        {children}
      </main>
    </div>
  );
}
