import Link from "next/link";
import { AdminRole } from "@prisma/client";
import { WeeklyResultsSheet } from "@/components/analytics/weekly-results-sheet";
import {
  buildHref,
  getAnalyticsContext,
  getWeekOptions,
  readStringParam,
} from "@/lib/analytics/ui";
import { getTuesdayWeekKey } from "@/lib/analytics/week";
import { requireAdminContext } from "@/lib/auth";
import { getWeeklyResults } from "@/lib/analytics/service";
import { EXAM_TYPE_LABEL, SUBJECT_LABEL } from "@/lib/constants";
import { buildSessionDisplayColumns } from "@/lib/exam-session-rules";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

export default async function AdminWeeklyResultsPage({ searchParams }: PageProps) {
  const [, { periods, selectedPeriod, examType }] = await Promise.all([
    requireAdminContext(AdminRole.VIEWER),
    getAnalyticsContext(searchParams),
  ]);
  const weekOptions = getWeekOptions(selectedPeriod, examType);
  const requestedWeekKey = readStringParam(searchParams, "weekKey");
  const selectedWeek =
    weekOptions.find((option) => option.key === requestedWeekKey) ??
    weekOptions.find((option) => option.key === getTuesdayWeekKey(new Date())) ??
    weekOptions[weekOptions.length - 1] ??
    null;
  const view = readStringParam(searchParams, "view") === "new" ? "new" : "overall";
  const data =
    selectedPeriod && selectedWeek
      ? await getWeeklyResults(selectedPeriod.id, examType, selectedWeek.key, view, {
          includeRankingRows: false,
        })
      : null;
  const downloadHref =
    selectedPeriod && selectedWeek
      ? buildHref("/api/export/results-print", {
          mode: "weekly",
          periodId: selectedPeriod.id,
          examType,
          weekKey: selectedWeek.key,
          view,
        })
      : null;
  const displayColumns = data ? buildSessionDisplayColumns(data.sessions) : [];

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        F-05-B Weekly Results
      </div>
      <h1 className="mt-5 text-3xl font-semibold">주간 성적 / 출감표</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        선택한 시험 기간과 주차를 기준으로 주간 성적표를 확인하고, 인쇄용 표도 바로 내려받을 수 있습니다.
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
            name="weekKey"
            defaultValue={selectedWeek?.key ?? ""}
            className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
          >
            {weekOptions.map((week) => (
              <option key={week.key} value={week.key}>
                {week.label}
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

      {selectedPeriod && selectedWeek && data ? (
        <>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              prefetch={false}
              href={buildHref("/admin/results/weekly", {
                periodId: selectedPeriod.id,
                examType,
                weekKey: selectedWeek.key,
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
              prefetch={false}
              href={buildHref("/admin/results/weekly", {
                periodId: selectedPeriod.id,
                examType,
                weekKey: selectedWeek.key,
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
            <a
              href={downloadHref ?? undefined}
              className="rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold text-ink transition hover:border-forest hover:text-forest"
            >
              인쇄용 표 다운로드
            </a>
          </div>

          <section className="mt-6 rounded-[28px] border border-ink/10 bg-white p-6">
            <h2 className="text-xl font-semibold">선택한 주차</h2>
            <p className="mt-2 text-sm text-slate">
              {data.week.label}
              {data.week.legacyWeeks.length > 0
                ? ` / 기존 week ${data.week.legacyWeeks.join(", ")}`
                : ""}
            </p>
            <div className="mt-4 flex flex-wrap gap-3 text-sm text-slate">
              {displayColumns.map((column) => (
                <span
                  key={column.key}
                  className="rounded-full border border-ink/10 px-3 py-2"
                >
                  {formatDate(column.examDate)} · {SUBJECT_LABEL[column.subject]}
                  {column.oxSession ? " + 경찰학 OX" : ""}
                </span>
              ))}
            </div>
          </section>

          <div className="mt-8">
            <WeeklyResultsSheet
              week={data.week}
              sessions={data.sessions}
              rows={data.sheetRows}
            />
          </div>
        </>
      ) : (
        <div className="mt-8 rounded-[28px] border border-dashed border-ink/10 p-8 text-sm text-slate">
          조회 조건을 선택하면 해당 주차의 성적표가 표시됩니다.
        </div>
      )}
    </div>
  );
}
