import { AdminRole } from "@/generated/prisma";
import { RankingTable } from "@/components/analytics/ranking-table";
import {
  buildHref,
  getAnalyticsContext,
  getWeekOptions,
  readNumberParam,
  readStringParam,
} from "@/lib/analytics/ui";
import { requireAdminContext } from "@/lib/auth";
import { getWeeklyResults } from "@/lib/analytics/service";
import { EXAM_TYPE_LABEL, SUBJECT_LABEL } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import Link from "next/link";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

export default async function AdminWeeklyResultsPage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.VIEWER);
  const { periods, selectedPeriod, examType } = await getAnalyticsContext(searchParams);
  const weekOptions = getWeekOptions(selectedPeriod, examType);
  const requestedWeek = readNumberParam(searchParams, "week");
  const selectedWeek = weekOptions.includes(requestedWeek ?? -1)
    ? (requestedWeek as number)
    : (weekOptions[0] ?? 1);
  const view = readStringParam(searchParams, "view") === "new" ? "new" : "overall";
  const data =
    selectedPeriod && weekOptions.length > 0
      ? await getWeeklyResults(selectedPeriod.id, examType, selectedWeek, view)
      : null;

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        F-05-B Weekly Results
      </div>
      <h1 className="mt-5 text-3xl font-semibold">주차별 성적 공지</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        NORMAL 응시 기록만 석차에 반영하고, LIVE 전용 응시자는 평균만 확인할 수 있게 처리합니다.
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
          <label className="mb-2 block text-sm font-medium">주차</label>
          <select
            name="week"
            defaultValue={String(selectedWeek)}
            className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
          >
            {weekOptions.map((week) => (
              <option key={week} value={week}>
                {week}주차
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

      {selectedPeriod && data ? (
        <>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href={buildHref("/admin/results/weekly", {
                periodId: selectedPeriod.id,
                examType,
                week: selectedWeek,
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
              href={buildHref("/admin/results/weekly", {
                periodId: selectedPeriod.id,
                examType,
                week: selectedWeek,
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

          <section className="mt-6 rounded-[28px] border border-ink/10 bg-white p-6">
            <h2 className="text-xl font-semibold">포함 회차</h2>
            <div className="mt-4 flex flex-wrap gap-3 text-sm text-slate">
              {data.sessions.map((session) => (
                <span
                  key={session.id}
                  className="rounded-full border border-ink/10 px-3 py-2"
                >
                  {formatDate(session.examDate)} · {SUBJECT_LABEL[session.subject]}
                </span>
              ))}
            </div>
          </section>

          <div className="mt-8">
            <RankingTable rows={data.rows} view={view} />
          </div>
        </>
      ) : (
        <div className="mt-8 rounded-[28px] border border-dashed border-ink/10 p-8 text-sm text-slate">
          선택한 조건에 해당하는 회차가 없습니다.
        </div>
      )}
    </div>
  );
}
