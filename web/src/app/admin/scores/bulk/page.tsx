import Link from "next/link";
import { AdminRole } from "@prisma/client";
import { BulkScoreEntry } from "@/components/scores/bulk-score-entry";
import { requireAdminContext } from "@/lib/auth";
import { filterSessionsByEnabledExamTypes } from "@/lib/periods/exam-types";
import { listPeriods } from "@/lib/periods/service";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AdminScoresBulkPage() {
  const [, periods] = await Promise.all([
    requireAdminContext(AdminRole.TEACHER),
    listPeriods(),
  ]);

  // Fetch active students from DB (isActive=true), with className for grouping
  const students = await getPrisma().student.findMany({
    where: { isActive: true },
    select: {
      examNumber: true,
      name: true,
      examType: true,
      className: true,
    },
    orderBy: [
      { examType: "asc" },
      { className: "asc" },
      { examNumber: "asc" },
    ],
  });

  return (
    <div className="p-8 sm:p-10">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
            F-03d Bulk Score Entry
          </div>
          <h1 className="mt-5 text-3xl font-semibold">성적 일괄 입력</h1>
          <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
            회차와 반을 선택한 뒤 표에서 학생별 점수를 직접 입력하고 한 번에 저장합니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/scores/input"
            className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
          >
            성적 업로드
          </Link>
          <Link
            href="/admin/scores/edit"
            className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
          >
            성적 수정
          </Link>
        </div>
      </div>

      {/* Client component */}
      <div className="mt-8">
        <BulkScoreEntry
          periods={periods.map((period) => ({
            id: period.id,
            name: period.name,
            isActive: period.isActive,
            isGongchaeEnabled: period.isGongchaeEnabled,
            isGyeongchaeEnabled: period.isGyeongchaeEnabled,
            sessions: filterSessionsByEnabledExamTypes(period, period.sessions).map((session) => ({
              id: session.id,
              examType: session.examType,
              week: session.week,
              subject: session.subject,
              displaySubjectName: session.displaySubjectName ?? null,
              examDate: session.examDate.toISOString(),
              isCancelled: session.isCancelled,
              isLocked: session.isLocked,
            })),
          }))}
          students={students.map((s) => ({
            examNumber: s.examNumber,
            name: s.name,
            examType: s.examType,
            className: s.className ?? null,
          }))}
        />
      </div>
    </div>
  );
}
