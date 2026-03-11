import { AdminRole } from "@/generated/prisma";
import { WeeklyResultsSheet } from "@/components/analytics/weekly-results-sheet";
import {
  buildHref,
  getAnalyticsContext,
  getWeekOptions,
  readStringParam,
} from "@/lib/analytics/ui";
import { requireAdminContext } from "@/lib/auth";
import { getWeeklyResults } from "@/lib/analytics/service";
import { getTuesdayWeekKey } from "@/lib/analytics/week";
import { EXAM_TYPE_LABEL, SUBJECT_LABEL } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import Link from "next/link";

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

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        F-05-B Weekly Results
      </div>
      <h1 className="mt-5 text-3xl font-semibold">二쇨컙 ?깆쟻 吏묎퀎</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        ?붿슂???쒖옉 二쇨컙 湲곗??쇰줈 ?꾩옱源뚯? 諛쒖깮???쒗뿕留?諛섏쁺??二쇨컙 ?됯퇏怨??앹감瑜?吏묎퀎?⑸땲??
      </p>

      <form className="mt-8 grid gap-4 rounded-[28px] border border-ink/10 bg-mist p-6 md:grid-cols-4">
        <div>
          <label className="mb-2 block text-sm font-medium">?쒗뿕 湲곌컙</label>
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
          <label className="mb-2 block text-sm font-medium">吏곷젹</label>
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
          <label className="mb-2 block text-sm font-medium">二쇨컙 湲곌컙</label>
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
            議고쉶
          </button>
        </div>
      </form>

      {selectedPeriod && selectedWeek && data ? (
        <>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href={buildHref("/admin/results/weekly", {
                periodId: selectedPeriod.id,
                examType,
                weekKey: selectedWeek.key,
                view: "overall",
              })}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${view === "overall"
                ? "bg-ink text-white"
                : "border border-ink/10 text-ink hover:border-ember/30 hover:text-ember"
                }`}
            >
              ?꾩껜 ?깆쟻
            </Link>
            <Link
              href={buildHref("/admin/results/weekly", {
                periodId: selectedPeriod.id,
                examType,
                weekKey: selectedWeek.key,
                view: "new",
              })}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${view === "new"
                ? "bg-ink text-white"
                : "border border-ink/10 text-ink hover:border-ember/30 hover:text-ember"
                }`}
            >
              ?좉퇋???깆쟻
            </Link>
            <Link
              href={buildHref("/api/export/results-print", {
                mode: "weekly",
                periodId: selectedPeriod.id,
                examType,
                weekKey: selectedWeek.key,
                view,
              })}
              className="rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold text-ink transition hover:border-forest hover:text-forest"
            >
              ?몄뇙???묒? ?ㅼ슫濡쒕뱶
            </Link>
          </div>

          <section className="mt-6 rounded-[28px] border border-ink/10 bg-white p-6">
            <h2 className="text-xl font-semibold">吏묎퀎 二쇨컙</h2>
            <p className="mt-2 text-sm text-slate">
              {data.week.label}
              {data.week.legacyWeeks.length > 0
                ? ` / 湲곗〈 week ${data.week.legacyWeeks.join(", ")}`
                : ""}
            </p>
            <div className="mt-4 flex flex-wrap gap-3 text-sm text-slate">
              {data.sessions.map((session) => (
                <span
                  key={session.id}
                  className="rounded-full border border-ink/10 px-3 py-2"
                >
                  {formatDate(session.examDate)} 쨌 {SUBJECT_LABEL[session.subject]}
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
          ?좏깮??議곌굔???대떦?섎뒗 ?쒗뿕???놁뒿?덈떎.
        </div>
      )}
    </div>
  );
}
