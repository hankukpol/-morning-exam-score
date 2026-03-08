import { AdminRole } from "@/generated/prisma";
import { PeriodManager } from "@/components/periods/period-manager";
import { requireAdminContext } from "@/lib/auth";
import { listPeriods } from "@/lib/periods/service";

export const dynamic = "force-dynamic";

export default async function AdminPeriodsPage() {
  await requireAdminContext(AdminRole.TEACHER);
  const periods = await listPeriods();

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        F-01 Periods
      </div>
      <h1 className="mt-5 text-3xl font-semibold">시험 기간과 회차 관리</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        기간 생성, 활성화, 회차 자동 생성, 개별 회차의 취소/연기까지 Phase 2에서 필요한 입력
        베이스를 이 화면에 모아 두었습니다.
      </p>
      <div className="mt-8">
        <PeriodManager
          periods={periods.map((period) => ({
            ...period,
            startDate: period.startDate.toISOString(),
            endDate: period.endDate.toISOString(),
            sessions: period.sessions.map((session) => ({
              ...session,
              examDate: session.examDate.toISOString(),
            })),
          }))}
        />
      </div>
    </div>
  );
}
