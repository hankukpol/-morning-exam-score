import { AdminRole } from "@prisma/client";
import { PointManager } from "@/components/points/point-manager";
import { formatMonthLabel } from "@/lib/analytics/presentation";
import { getPointManagementData } from "@/lib/analytics/service";
import {
  getAnalyticsContext,
  getMonthOptions,
  readStringParam,
} from "@/lib/analytics/ui";
import { requireAdminContext } from "@/lib/auth";
import { EXAM_TYPE_LABEL } from "@/lib/constants";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

export default async function AdminPointsPage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.TEACHER);
  const { periods, selectedPeriod, examType } = await getAnalyticsContext(searchParams);
  const monthOptions = getMonthOptions(selectedPeriod, examType);
  const requestedMonthKey = readStringParam(searchParams, "monthKey");
  const selectedMonth =
    monthOptions.find((option) => `${option.year}-${option.month}` === requestedMonthKey) ??
    monthOptions[0];
  const data =
    selectedPeriod && selectedMonth
      ? await getPointManagementData(
          selectedPeriod.id,
          examType,
          selectedMonth.year,
          selectedMonth.month,
        )
      : null;

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        F-11 Points
      </div>
      <h1 className="mt-5 text-3xl font-semibold">포인트 관리</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        월별 개근 장학 자동 대상자와 성적 우수 수동 지급을 같은 화면에서 처리합니다.
      </p>

      <form className="mt-8 grid gap-4 rounded-[28px] border border-ink/10 bg-mist p-6 md:grid-cols-4">
        <div>
          <label className="mb-2 block text-sm font-medium">시험 기간</label>
          <select
            name="periodId"
            defaultValue={selectedPeriod?.id ? String(selectedPeriod.id) : ""}
            className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
          >
            {periods.map((period) => (
              <option key={period.id} value={period.id}>
                {period.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium">직렬</label>
          <select
            name="examType"
            defaultValue={examType}
            className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
          >
            <option value="GONGCHAE">{EXAM_TYPE_LABEL.GONGCHAE}</option>
            <option value="GYEONGCHAE">{EXAM_TYPE_LABEL.GYEONGCHAE}</option>
          </select>
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium">대상 월</label>
          <select
            name="monthKey"
            defaultValue={selectedMonth ? `${selectedMonth.year}-${selectedMonth.month}` : ""}
            className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
          >
            {monthOptions.map((option) => (
              <option key={`${option.year}-${option.month}`} value={`${option.year}-${option.month}`}>
                {formatMonthLabel(option.year, option.month)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <button
            type="submit"
            className="inline-flex w-full items-center justify-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest"
          >
            조회
          </button>
        </div>
      </form>

      {!selectedPeriod || !selectedMonth || !data ? (
        <div className="mt-8 rounded-[28px] border border-dashed border-ink/10 p-8 text-sm text-slate">
          포인트를 계산할 수 있는 회차가 없습니다.
        </div>
      ) : (
        <div className="mt-8">
          <PointManager
            filters={{
              periodId: selectedPeriod.id,
              examType,
              year: selectedMonth.year,
              month: selectedMonth.month,
            }}
            candidates={data.candidates}
            logs={data.logs.map((log) => ({
              id: log.id,
              examNumber: log.examNumber,
              studentName: log.student.name,
              type: log.type,
              amount: log.amount,
              reason: log.reason,
              grantedAt: log.grantedAt.toISOString(),
              grantedBy: log.grantedBy,
            }))}
          />
        </div>
      )}
    </div>
  );
}
