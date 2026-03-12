import Link from "next/link";
import { AdminRole } from "@prisma/client";
import { ScoreEditPanel } from "@/components/scores/score-edit-panel";
import { requireAdminContext } from "@/lib/auth";
import { filterSessionsByEnabledExamTypes } from "@/lib/periods/exam-types";
import { listPeriods } from "@/lib/periods/service";

export const dynamic = "force-dynamic";

export default async function AdminScoreEditPage() {
  await requireAdminContext(AdminRole.TEACHER);
  const periods = await listPeriods();

  return (
    <div className="p-8 sm:p-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
            F-03b Score Edit
          </div>
          <h1 className="mt-5 text-3xl font-semibold">성적 수정</h1>
          <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
            회차를 선택해 기존 성적을 조회하고, 잘못 입력된 점수나 응시 상태를 직접 수정하거나 삭제합니다.
          </p>
        </div>
        <Link
          href="/admin/scores/input"
          className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
        >
          성적 입력 화면
        </Link>
      </div>

      <div className="mt-8">
        <ScoreEditPanel
          periods={periods.map((period) => ({
            id: period.id,
            name: period.name,
            isActive: period.isActive,
            sessions: filterSessionsByEnabledExamTypes(period, period.sessions).map((session) => ({
              id: session.id,
              examType: session.examType,
              week: session.week,
              subject: session.subject,
              examDate: session.examDate.toISOString(),
              isCancelled: session.isCancelled,
            })),
          }))}
        />
      </div>
    </div>
  );
}
