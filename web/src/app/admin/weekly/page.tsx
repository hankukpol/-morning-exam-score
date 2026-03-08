import { AdminRole } from "@/generated/prisma";
import { WeeklyGridTable } from "@/components/analytics/weekly-grid-table";
import {
  getAnalyticsContext,
  getWeekOptions,
  readStringParam,
} from "@/lib/analytics/ui";
import { requireAdminContext } from "@/lib/auth";
import { getWeeklyGrid } from "@/lib/analytics/service";
import { getTuesdayWeekKey } from "@/lib/analytics/week";
import { EXAM_TYPE_LABEL, SUBJECT_LABEL } from "@/lib/constants";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

export default async function AdminWeeklyGridPage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.VIEWER);
  const { periods, selectedPeriod, examType } = await getAnalyticsContext(searchParams);
  const weekOptions = getWeekOptions(selectedPeriod, examType);
  const requestedWeekKey = readStringParam(searchParams, "weekKey");
  const selectedWeek =
    weekOptions.find((option) => option.key === requestedWeekKey) ??
    weekOptions.find((option) => option.key === getTuesdayWeekKey(new Date())) ??
    weekOptions[weekOptions.length - 1] ??
    null;
  const data =
    selectedPeriod && selectedWeek
      ? await getWeeklyGrid(selectedPeriod.id, examType, selectedWeek.key)
      : null;

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        F-04 Weekly Grid
      </div>
      <h1 className="mt-5 text-3xl font-semibold">주간 현황 그리드</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        화요일 시작 기준으로 이번 주 시험을 묶어 출결, 점수, 경고/탈락 상태를 오늘 날짜 기준으로 즉시 확인합니다.
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
          <label className="mb-2 block text-sm font-medium">주간 기간</label>
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

      {!selectedPeriod || !selectedWeek || !data ? (
        <div className="mt-8 rounded-[28px] border border-dashed border-ink/10 p-8 text-sm text-slate">
          선택한 조건에 해당하는 시험이 없습니다.
        </div>
      ) : (
        <div className="mt-8 rounded-[28px] border border-ink/10 bg-white">
          <div className="border-b border-ink/10 px-4 py-3 text-sm text-slate">
            {data.week.label}
            {data.week.legacyWeeks.length > 0
              ? ` / 기존 week ${data.week.legacyWeeks.join(", ")}`
              : ""}
          </div>
          <WeeklyGridTable
            rows={data.rows}
            sessions={data.sessions.map((session) => ({
              id: session.id,
              subjectLabel: SUBJECT_LABEL[session.subject],
              examDateLabel: formatDate(session.examDate),
            }))}
          />
        </div>
      )}
    </div>
  );
}
