"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NotificationBell } from "@/components/admin/notification-bell";

type TopModuleNavProps = {
  userName: string;
  userRole: string; // display label like "원장", "강사" etc
  permittedModuleIds: string[]; // which module IDs the user can see
};

const MODULES = [
  {
    id: 'dashboard',
    label: '대시보드',
    href: '/admin',
    matchPaths: ['/admin'],
  },
  {
    id: 'members',
    label: '수강관리',
    href: '/admin/students',
    matchPaths: [
      '/admin/students',
      '/admin/enrollments',
      '/admin/cohorts',
      '/admin/classrooms',
      '/admin/counseling',
      '/admin/prospects',
      '/admin/graduates',
    ],
  },
  {
    id: 'payments',
    label: '수납·결제',
    href: '/admin/payments',
    matchPaths: [
      '/admin/payments',
      '/admin/approvals',
      '/admin/settlements',
      '/admin/special-lectures',
      '/admin/staff-settlements',
      '/admin/reports',
      '/admin/payment-links',
    ],
  },
  {
    id: 'scores',
    label: '성적관리',
    href: '/admin/analytics',
    matchPaths: [
      '/admin/analytics',
      '/admin/scores',
      '/admin/results',
      '/admin/exams',
      '/admin/periods',
      '/admin/query',
    ],
  },
  {
    id: 'attendance',
    label: '출결관리',
    href: '/admin/attendance',
    matchPaths: [
      '/admin/attendance',
      '/admin/absence-notes',
      '/admin/dropout',
    ],
  },
  {
    id: 'facilities',
    label: '시설관리',
    href: '/admin/lockers',
    matchPaths: [
      '/admin/lockers',
      '/admin/facilities',
      '/admin/study-rooms',
      '/admin/textbooks',
      '/admin/points',
    ],
  },
  {
    id: 'system',
    label: '시스템',
    href: '/admin/settings',
    matchPaths: [
      '/admin/settings',
      '/admin/notifications',
      '/admin/notices',
      '/admin/memos',
      '/admin/audit-log',
      '/admin/audit-logs',
      '/admin/migration',
      '/admin/export',
    ],
  },
] as const;

function getActiveModuleId(pathname: string): string {
  if (pathname === '/admin') return 'dashboard';
  for (const mod of MODULES) {
    if (mod.id === 'dashboard') continue;
    for (const match of mod.matchPaths) {
      if (pathname === match || pathname.startsWith(match + '/')) return mod.id;
    }
  }
  return 'dashboard';
}

export function TopModuleNav({ userName, userRole, permittedModuleIds }: TopModuleNavProps) {
  const pathname = usePathname();
  const activeModuleId = getActiveModuleId(pathname);

  return (
    <header className="sticky top-0 z-50 flex h-14 items-center border-b border-white/10 bg-[#0F172A] px-4">
      {/* Mobile hamburger */}
      <button
        type="button"
        className="mr-3 flex h-8 w-8 shrink-0 items-center justify-center text-gray-400 hover:text-white lg:hidden"
        aria-label="메뉴 열기"
        onClick={() => window.dispatchEvent(new Event("toggle-sidebar"))}
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Logo */}
      <Link href="/admin" className="flex items-center gap-2 mr-8 shrink-0">
        <div className="flex h-7 w-7 items-center justify-center bg-[#C55A11] text-sm font-black text-white">
          M
        </div>
        <span className="text-sm font-bold tracking-tight text-white">
          Morning Mock
        </span>
      </Link>

      {/* Module tabs */}
      <nav className="flex flex-1 items-center gap-1 overflow-x-auto">
        {MODULES.filter((m) => permittedModuleIds.includes(m.id)).map((mod) => (
          <Link
            key={mod.id}
            href={mod.href}
            className={`whitespace-nowrap px-3 py-1.5 text-sm font-medium transition-colors rounded-md ${
              activeModuleId === mod.id
                ? 'text-white bg-white/10'
                : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
            }`}
          >
            {mod.label}
          </Link>
        ))}
      </nav>

      {/* Right side: notification + user */}
      <div className="flex items-center gap-3 shrink-0">
        <NotificationBell />
        <div className="flex items-center gap-2 border-l border-white/10 pl-3">
          <div className="text-right">
            <p className="text-xs font-semibold text-white leading-none">{userName}</p>
            <p className="mt-0.5 text-[10px] text-gray-400">{userRole}</p>
          </div>
        </div>
      </div>
    </header>
  );
}
