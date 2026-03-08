import { AdminRole } from "@/generated/prisma";
import { RankingTable } from "@/components/analytics/ranking-table";
import { getIntegratedResults } from "@/lib/analytics/service";
import {
  buildHref,
  getAnalyticsContext,
  readStringParam,
} from "@/lib/analytics/ui";
import { requireAdminContext } from "@/lib/auth";
import { EXAM_TYPE_LABEL } from "@/lib/constants";
import Link from "next/link";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

export default async function AdminIntegratedResultsPage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.VIEWER);
  const { periods, selectedPeriod, examType } = await getAnalyticsContext(searchParams);
  const view = readStringParam(searchParams, "view") === "new" ? "new" : "overall";
  const data = selectedPeriod
    ? await getIntegratedResults(selectedPeriod.id, examType, view)
    : null;

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        F-07 Integrated Results
      </div>
      <h1 className="mt-5 text-3xl font-semibold">통합 성적 집계</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        전체 기간의 NORMAL 응시 기록을 합산해 통합 평균, 통합 석차, 통합 참여율을 계산합니다.
      </p>

      <form className="mt-8 grid gap-4 rounded-[28px] border border-ink/10 bg-mist p-6 md:grid-cols-3">
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
        <div className="flex items-end">
          <button
            type="submit"
            className="inline-flex w-full items-center justify-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest"
          >
            조회
          </button>
        </div>
      </form>

      {selectedPeriod && data ? (
        <>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href={buildHref("/admin/results/integrated", {
                periodId: selectedPeriod.id,
                examType,
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
              href={buildHref("/admin/results/integrated", {
                periodId: selectedPeriod.id,
                examType,
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
          시험 기간을 먼저 선택하세요.
        </div>
      )}
    </div>
  );
}
