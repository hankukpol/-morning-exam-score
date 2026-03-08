import { AdminRole } from "@/generated/prisma";
import { RankingTable } from "@/components/analytics/ranking-table";
import {
  formatMonthLabel,
} from "@/lib/analytics/presentation";
import { getMonthlyResults } from "@/lib/analytics/service";
import {
  buildHref,
  getAnalyticsContext,
  getMonthOptions,
  readStringParam,
} from "@/lib/analytics/ui";
import { requireAdminContext } from "@/lib/auth";
import { EXAM_TYPE_LABEL } from "@/lib/constants";
import Link from "next/link";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

export default async function AdminMonthlyResultsPage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.VIEWER);
  const { periods, selectedPeriod, examType } = await getAnalyticsContext(searchParams);
  const monthOptions = getMonthOptions(selectedPeriod, examType);
  const requestedMonthKey = readStringParam(searchParams, "monthKey");
  const selectedMonth =
    monthOptions.find((option) => `${option.year}-${option.month}` === requestedMonthKey) ??
    monthOptions[0];
  const view = readStringParam(searchParams, "view") === "new" ? "new" : "overall";
  const data =
    selectedPeriod && selectedMonth
      ? await getMonthlyResults(
          selectedPeriod.id,
          examType,
          selectedMonth.year,
          selectedMonth.month,
          view,
        )
      : null;

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        F-06 Monthly Results
      </div>
      <h1 className="mt-5 text-3xl font-semibold">월별 성적 집계</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        월 단위 평균, 참여율, 개근 여부를 계산하고 신규생 전용 석차를 별도로 제공합니다.
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

      {selectedPeriod && selectedMonth && data ? (
        <>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href={buildHref("/admin/results/monthly", {
                periodId: selectedPeriod.id,
                examType,
                monthKey: `${selectedMonth.year}-${selectedMonth.month}`,
                view: "overall",
              })}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                view === "overall"
                  ? "bg-ink text-white"
                  : "border border-ink/10 text-ink hover:border-ember/30 hover:text-ember"
              }`}
            >
              전체 성적
            </Link>
            <Link
              href={buildHref("/admin/results/monthly", {
                periodId: selectedPeriod.id,
                examType,
                monthKey: `${selectedMonth.year}-${selectedMonth.month}`,
                view: "new",
              })}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                view === "new"
                  ? "bg-ink text-white"
                  : "border border-ink/10 text-ink hover:border-ember/30 hover:text-ember"
              }`}
            >
              신규생 성적
            </Link>
          </div>

          <div className="mt-8">
            <RankingTable rows={data.rows} view={view} />
          </div>
        </>
      ) : (
        <div className="mt-8 rounded-[28px] border border-dashed border-ink/10 p-8 text-sm text-slate">
          선택한 월에 해당하는 회차가 없습니다.
        </div>
      )}
    </div>
  );
}
