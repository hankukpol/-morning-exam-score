import Link from "next/link";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { NotificationBell } from "@/components/admin/notification-bell";
import { SetupPanel } from "@/components/setup-panel";
import { AdminShortcutReference } from "@/components/ui/admin-shortcut-reference";
import { ADMIN_NAV_ITEMS, type NavItem, ROLE_LABEL } from "@/lib/constants";
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
            description="환경 정보를 채우면 바로 동작하도록 준비되어 있습니다. 먼저 `.env.local`을 채운 뒤 다시 접속해 주세요."
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
          <pre className="mt-4 whitespace-pre-wrap break-all rounded bg-red-50 p-4 text-sm text-red-800">
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
        <main className="min-h-screen bg-gray-50 px-6 py-8 sm:px-10 lg:px-16">
          <div className="mx-auto max-w-4xl card-border p-8">
            <div className="inline-flex border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-red-700">
              Access Denied
            </div>
            <h1 className="mt-5 text-3xl font-semibold">관리자 권한이 연결되지 않았습니다.</h1>
            <p className="mt-4 text-sm leading-7 text-slate">
              Supabase Auth 로그인은 되어 있지만 `admin_users` 테이블에 현재 계정이 등록되어 있지 않거나
              비활성 상태입니다. 최고 관리자 계정으로 먼저 연결해 주세요.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/login?error=unauthorized"
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
      <main className="min-h-screen bg-gray-50 px-6 py-8 sm:px-10 lg:px-16">
        <div className="mx-auto max-w-4xl card-border p-8">
          <p className="text-sm text-slate">로그인이 필요합니다.</p>
          <Link
            href="/login?redirectTo=/admin"
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

  const groups = permittedItems.reduce((acc, item) => {
    if (!acc[item.group]) {
      acc[item.group] = [];
    }
    acc[item.group].push(item);
    return acc;
  }, {} as Record<string, NavItem[]>);

  return (
    <div className="flex min-h-screen flex-col bg-[#F3F4F6] lg:flex-row">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only left-4 top-4 z-[60] rounded-full bg-white px-4 py-2 text-sm font-semibold text-ink shadow-sm"
      >
        본문으로 건너뛰기
      </a>
      <aside className="flex min-h-screen w-full flex-shrink-0 flex-col bg-[#0B1120] text-gray-300 lg:w-[260px]">
        <div className="p-6 pb-2">
          <Link href="/" className="inline-flex items-center space-x-2">
            <span className="flex items-center text-xl font-bold tracking-tight text-white">
              <div className="mr-2 flex h-8 w-8 items-center justify-center bg-primary text-lg font-black text-white">
                M
              </div>
              Morning Mock
            </span>
          </Link>
        </div>

        <div className="border-b border-white/5 px-6 pb-4 pt-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1 border-l-2 border-primary bg-[#1E293B] p-4">
              <p className="text-sm font-semibold text-white">{context.adminUser.name}</p>
              <p className="mt-1 text-xs text-gray-400">{context.adminUser.email}</p>
              <span className="mt-2 inline-block flex-shrink-0 border border-primary/30 bg-primary/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary-muted">
                {ROLE_LABEL[context.adminUser.role]}
              </span>
            </div>
            <div className="shrink-0 pt-1">
              <NotificationBell />
            </div>
          </div>
        </div>

        <nav className="custom-scrollbar flex-1 space-y-6 overflow-y-auto px-4 py-4">
          {Object.entries(groups).map(([groupName, items]) => (
            <div key={groupName}>
              <h3 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                {groupName}
              </h3>
              <div className="space-y-1">
                {items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="group flex items-center border-l-2 border-transparent px-4 py-2.5 text-sm font-medium transition-colors hover:border-primary hover:bg-white/5 hover:text-white"
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

        <div className="border-t border-white/5 bg-[#0B1120] p-4 space-y-3">
          <AdminShortcutReference
            items={permittedItems.map((item) => ({
              href: item.href,
              label: item.label,
              description: item.description,
              group: item.group,
            }))}
          />
          <SignOutButton />
        </div>
      </aside>

      <main
        id="main-content"
        tabIndex={-1}
        className="w-full min-w-0 flex-1 bg-gray-50 p-4 sm:p-6 lg:p-8"
      >
        {children}
      </main>
    </div>
  );
}


