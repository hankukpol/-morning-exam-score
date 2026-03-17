import Link from "next/link";
import { AdminRole } from "@prisma/client";
import { BulkImportForm } from "@/components/scores/bulk-import-form";
import { requireAdminContext } from "@/lib/auth";
import { filterSessionsByEnabledExamTypes } from "@/lib/periods/exam-types";
import { listPeriods } from "@/lib/periods/service";

export const dynamic = "force-dynamic";

export default async function AdminScoreBulkImportPage() {
  const [, periods] = await Promise.all([
    requireAdminContext(AdminRole.TEACHER),
    listPeriods(),
  ]);

  return (
    <div className="p-8 sm:p-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
            F-03c Bulk Import
          </div>
          <h1 className="mt-5 text-3xl font-semibold">성적 일괄 입력</h1>
          <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
            CSV 파일로 여러 학생의 성적을 한 번에 입력합니다.{" "}
            형식: <code className="rounded bg-ink/5 px-1.5 py-0.5 text-xs font-mono">학번,이름,원점수[,응시유형]</code>
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/admin/scores/input"
            className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
          >
            성적 입력 화면
          </Link>
          <Link
            href="/admin/scores/edit"
            className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
          >
            성적 수정
          </Link>
        </div>
      </div>

      <div className="mt-8">
        <BulkImportForm
          periods={periods.map((period) => ({
            id: period.id,
            name: period.name,
            isActive: period.isActive,
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
        />
      </div>
    </div>
  );
}
