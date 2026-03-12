import { AdminRole } from "@prisma/client";
import { formatMonthLabel } from "@/lib/analytics/presentation";
import { getAttendanceCalendar } from "@/lib/analytics/service";
import {
  getAnalyticsContext,
  getMonthOptions,
  readStringParam,
} from "@/lib/analytics/ui";
import { requireAdminContext } from "@/lib/auth";
import { EXAM_TYPE_LABEL, SUBJECT_LABEL } from "@/lib/constants";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

export default async function AdminAttendanceCalendarPage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.VIEWER);
  const { periods, selectedPeriod, examType } = await getAnalyticsContext(searchParams);
  const monthOptions = getMonthOptions(selectedPeriod, examType);
  const requestedMonthKey = readStringParam(searchParams, "monthKey");
  const selectedMonth =
    monthOptions.find((option) => `${option.year}-${option.month}` === requestedMonthKey) ??
    monthOptions[0];
  const data =
    selectedPeriod && selectedMonth
      ? await getAttendanceCalendar(
          selectedPeriod.id,
          examType,
          selectedMonth.year,
          selectedMonth.month,
        )
      : null;

  const firstDay = selectedMonth
    ? new Date(selectedMonth.year, selectedMonth.month - 1, 1)
    : null;
  const daysInMonth = selectedMonth
    ? new Date(selectedMonth.year, selectedMonth.month, 0).getDate()
    : 0;
  const leadingEmpty = firstDay ? firstDay.getDay() : 0;
  const trailingEmpty = (7 - ((leadingEmpty + daysInMonth) % 7 || 7)) % 7;
  const dayBuckets = new Map<number, NonNullable<typeof data>["days"]>();

  if (data) {
    for (const day of data.days) {
      const key = day.date.getDate();
      const current = dayBuckets.get(key) ?? [];
      current.push(day);
      dayBuckets.set(key, current);
    }
  }

  const totalAbsent = data?.days.reduce((sum, day) => sum + day.absentCount, 0) ?? 0;
  const totalWarnings = data?.days.reduce((sum, day) => sum + day.warningCount, 0) ?? 0;
  const totalDropouts = data?.days.reduce((sum, day) => sum + day.dropoutCount, 0) ?? 0;

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        F-20 Calendar
      </div>
      <h1 className="mt-5 text-3xl font-semibold">출결 캘린더</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        날짜별 결시, LIVE, 경고, 탈락 발생 수를 한 달 단위로 확인합니다.
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
          선택한 월에 해당하는 회차가 없습니다.
        </div>
      ) : (
        <>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <article className="rounded-[24px] border border-ink/10 bg-white p-6">
              <p className="text-sm text-slate">월간 결시 합계</p>
              <p className="mt-3 text-2xl font-semibold">{totalAbsent}명</p>
            </article>
            <article className="rounded-[24px] border border-ink/10 bg-white p-6">
              <p className="text-sm text-slate">경고 누적 표시</p>
              <p className="mt-3 text-2xl font-semibold">{totalWarnings}건</p>
            </article>
            <article className="rounded-[24px] border border-ink/10 bg-white p-6">
              <p className="text-sm text-slate">탈락 누적 표시</p>
              <p className="mt-3 text-2xl font-semibold">{totalDropouts}건</p>
            </article>
          </div>

          <div className="mt-8 overflow-x-auto rounded-[28px] border border-ink/10 bg-white p-4">
            <div className="grid min-w-[980px] grid-cols-7 gap-3">
              {WEEKDAY_LABELS.map((label) => (
                <div key={label} className="rounded-2xl bg-mist px-4 py-3 text-sm font-semibold">
                  {label}
                </div>
              ))}

              {Array.from({ length: leadingEmpty }).map((_, index) => (
                <div key={`empty-start-${index}`} className="min-h-[160px] rounded-2xl border border-dashed border-ink/10" />
              ))}

              {Array.from({ length: daysInMonth }).map((_, index) => {
                const dayNumber = index + 1;
                const entries = dayBuckets.get(dayNumber) ?? [];
                const hasDropout = entries.some((entry) => entry.dropoutCount > 0);
                const hasWarning = entries.some((entry) => entry.warningCount > 0);
                const cellClass = hasDropout
                  ? "border-red-200 bg-red-50"
                  : hasWarning
                    ? "border-amber-200 bg-amber-50"
                    : "border-ink/10 bg-white";

                return (
                  <div key={dayNumber} className={`min-h-[160px] rounded-2xl border p-4 ${cellClass}`}>
                    <div className="text-sm font-semibold">{dayNumber}</div>
                    <div className="mt-3 space-y-3 text-xs leading-6 text-slate">
                      {entries.length === 0 ? (
                        <p>시험 없음</p>
                      ) : (
                        entries.map((entry) => (
                          <div key={entry.sessionId} className="rounded-2xl bg-white/80 p-3">
                            <p className="font-semibold text-ink">{SUBJECT_LABEL[entry.subject]}</p>
                            <p>{entry.weekLabel}</p>
                            <p>현장 {entry.normalCount} / LIVE {entry.liveCount}</p>
                            <p>결시 {entry.absentCount} / 경고 {entry.warningCount}</p>
                            <p>탈락 {entry.dropoutCount}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}

              {Array.from({ length: trailingEmpty }).map((_, index) => (
                <div key={`empty-end-${index}`} className="min-h-[160px] rounded-2xl border border-dashed border-ink/10" />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
