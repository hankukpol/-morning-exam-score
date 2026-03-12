import Link from "next/link";
import { AdminRole } from "@prisma/client";
import { ScoreInputWorkbench } from "@/components/scores/score-input-workbench";
import { requireAdminContext } from "@/lib/auth";
import { filterSessionsByEnabledExamTypes } from "@/lib/periods/exam-types";
import { listPeriods } from "@/lib/periods/service";

export const dynamic = "force-dynamic";

export default async function AdminScoreInputPage() {
  const [, periods] = await Promise.all([
    requireAdminContext(AdminRole.TEACHER),
    listPeriods(),
  ]);

  return (
    <div className="p-8 sm:p-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
            F-03 Score Input
          </div>
          <h1 className="mt-5 text-3xl font-semibold">성적 입력</h1>
          <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
            오프라인 XLS, 온라인 HTML-XLS, 직접 붙여넣기 세 가지 입력 방식을 같은 회차 선택 흐름으로 통합했습니다.
          </p>
        </div>
        <Link
          href="/admin/periods"
          className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
        >
          시험 기간 관리
        </Link>
      </div>

      <div className="mt-8">
        <ScoreInputWorkbench
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
