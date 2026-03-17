import type { Metadata } from "next";
import Link from "next/link";
import { StudentBottomNav } from "@/components/student-portal/student-bottom-nav";
import { StudentLogoutButton } from "@/components/student-portal/student-logout-button";
import { getStudentPortalViewer } from "@/lib/student-portal/service";

export const metadata: Metadata = {
  title: {
    default: "한국경찰학원 학생 포털",
    template: "%s | 한국경찰학원",
  },
};

export default async function StudentLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const viewer = await getStudentPortalViewer();

  return (
    <div className="min-h-screen bg-mist text-ink">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-4 pb-24 pt-4 sm:px-5">
        <header className="sticky top-0 z-30 mb-4 overflow-hidden rounded-[28px] border border-white/80 bg-white/90 px-5 py-4 shadow-panel backdrop-blur">
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-r from-ember/12 via-transparent to-forest/10"
            aria-hidden="true"
          />
          <div className="relative flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-ember">
                학생 포털
              </p>
              <Link href="/student" className="mt-2 block text-lg font-semibold">
                한국경찰학원 학생 포털
              </Link>
              <p className="mt-2 text-xs leading-6 text-slate">
                {viewer
                  ? `${viewer.name} · ${viewer.examNumber}`
                  : "수험번호와 이름으로 본인 성적과 공지를 확인합니다."}
              </p>
            </div>

            {viewer ? (
              <StudentLogoutButton className="inline-flex min-h-12 items-center justify-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ember/30 hover:text-ember disabled:cursor-not-allowed disabled:opacity-60" />
            ) : (
              <Link
                href="/student/login"
                className="inline-flex min-h-12 items-center justify-center rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white transition hover:bg-forest"
              >
                로그인
              </Link>
            )}
          </div>
        </header>

        <div className="flex-1">{children}</div>
      </div>

      <StudentBottomNav />
    </div>
  );
}
