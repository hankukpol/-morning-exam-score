import Link from "next/link";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { QuickEntryForm } from "./quick-entry-form";

export const dynamic = "force-dynamic";

export default async function MorningQuickEntryPage() {
  await requireAdminContext(AdminRole.TEACHER);

  const prisma = getPrisma();

  // Load the most recent 6 exam periods (active first) with their sessions
  const periods = await prisma.examPeriod.findMany({
    orderBy: [{ isActive: "desc" }, { startDate: "desc" }],
    take: 6,
    select: {
      id: true,
      name: true,
      isActive: true,
      sessions: {
        orderBy: [{ examDate: "desc" }, { examType: "asc" }],
        select: {
          id: true,
          examType: true,
          week: true,
          subject: true,
          displaySubjectName: true,
          examDate: true,
          isCancelled: true,
          isLocked: true,
        },
      },
    },
  });

  // Flatten sessions for the dropdown, most recent first
  const sessions = periods.flatMap((p) =>
    p.sessions.map((s) => ({
      id: s.id,
      examType: s.examType as string,
      week: s.week,
      subject: s.subject as string,
      displaySubjectName: s.displaySubjectName ?? null,
      examDate: s.examDate.toISOString(),
      isCancelled: s.isCancelled,
      isLocked: s.isLocked,
      periodName: p.name,
    })),
  );

  // Load active students for score entry
  const students = await prisma.student.findMany({
    where: { isActive: true },
    select: { examNumber: true, name: true },
    orderBy: [{ name: "asc" }],
  });

  return (
    <div className="p-8 sm:p-10">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
            아침 모의고사
          </div>
          <h1 className="mt-5 text-3xl font-semibold text-ink">빠른 성적 입력</h1>
          <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
            회차를 선택하고 수강생별 점수를 직접 입력한 후 일괄 저장합니다.
            결석 체크박스로 개별 결석 처리가 가능하며, 전체 결석 버튼으로 한 번에 처리할 수 있습니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/exams/morning"
            className="inline-flex items-center rounded-full border border-forest/30 px-4 py-2 text-sm font-semibold text-forest transition hover:bg-forest/10"
          >
            수강 현황
          </Link>
          <Link
            href="/admin/exams/morning/scores"
            className="inline-flex items-center rounded-full border border-forest/30 px-4 py-2 text-sm font-semibold text-forest transition hover:bg-forest/10"
          >
            회차별 현황
          </Link>
          <Link
            href="/admin/scores/input"
            className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
          >
            성적 업로드
          </Link>
        </div>
      </div>

      {/* Notice banner */}
      <div className="mt-6 flex items-start gap-3 rounded-[20px] border border-amber-200 bg-amber-50 p-4">
        <svg
          className="mt-0.5 h-4 w-4 shrink-0 text-amber-600"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <p className="text-sm text-amber-800">
          이미 입력된 점수가 있으면 <strong>덮어쓰기</strong>됩니다. 빈 점수 칸(점수 없음)은 저장되지 않습니다.
          잠금된 회차는 수정할 수 없습니다.
        </p>
      </div>

      {/* Main form */}
      <div className="mt-8">
        <QuickEntryForm sessions={sessions} students={students} />
      </div>
    </div>
  );
}
