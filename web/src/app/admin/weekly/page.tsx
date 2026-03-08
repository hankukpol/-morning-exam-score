import { AdminRole } from "@/generated/prisma";
import { StatusBadge } from "@/components/analytics/status-badge";
import {
  STATUS_ROW_CLASS,
  formatScore,
} from "@/lib/analytics/presentation";
import {
  getAnalyticsContext,
  getWeekOptions,
  readNumberParam,
} from "@/lib/analytics/ui";
import { requireAdminContext } from "@/lib/auth";
import { getWeeklyGrid } from "@/lib/analytics/service";
import { EXAM_TYPE_LABEL, STUDENT_TYPE_LABEL, SUBJECT_LABEL } from "@/lib/constants";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

export default async function AdminWeeklyGridPage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.VIEWER);
  const { periods, selectedPeriod, examType } = await getAnalyticsContext(searchParams);
  const weekOptions = getWeekOptions(selectedPeriod, examType);
  const requestedWeek = readNumberParam(searchParams, "week");
  const selectedWeek = weekOptions.includes(requestedWeek ?? -1)
    ? (requestedWeek as number)
    : (weekOptions[0] ?? 1);
  const data =
    selectedPeriod && weekOptions.length > 0
      ? await getWeeklyGrid(selectedPeriod.id, examType, selectedWeek)
      : null;

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        F-04 Weekly Grid
      </div>
      <h1 className="mt-5 text-3xl font-semibold">주간현황 그리드</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        한 주의 모든 회차를 가로로 펼쳐서 출결과 원점수를 확인하고, 경고·탈락 상태를 같은 행에서 점검합니다.
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

      {!selectedPeriod || weekOptions.length === 0 || !data ? (
        <div className="mt-8 rounded-[28px] border border-dashed border-ink/10 p-8 text-sm text-slate">
          선택한 조건에 해당하는 회차가 없습니다.
        </div>
      ) : (
        <div className="mt-8 overflow-x-auto rounded-[28px] border border-ink/10 bg-white">
          <table className="min-w-full divide-y divide-ink/10 text-sm">
            <thead className="bg-mist/80 text-left">
              <tr>
                <th className="px-4 py-3 font-semibold">수험번호</th>
                <th className="px-4 py-3 font-semibold">이름</th>
                <th className="px-4 py-3 font-semibold">구분</th>
                <th className="px-4 py-3 font-semibold">정규화 평균</th>
                <th className="px-4 py-3 font-semibold">결시 수</th>
                <th className="px-4 py-3 font-semibold">상태</th>
                {data.sessions.map((session) => (
                  <th key={session.id} className="min-w-[160px] px-4 py-3 font-semibold">
                    <div>{SUBJECT_LABEL[session.subject]}</div>
                    <div className="mt-1 text-xs font-normal text-slate">
                      {formatDate(session.examDate)}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/10">
              {data.rows.map((row) => (
                <tr key={row.examNumber} className={STATUS_ROW_CLASS[row.weekStatus]}>
                  <td className="px-4 py-3 font-medium">{row.examNumber}</td>
                  <td className="px-4 py-3">{row.name}</td>
                  <td className="px-4 py-3">{STUDENT_TYPE_LABEL[row.studentType]}</td>
                  <td className="px-4 py-3">{formatScore(row.weekAverage)}</td>
                  <td className="px-4 py-3">{row.absentCount}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={row.weekStatus} />
                  </td>
                  {row.cells.map((cell) => (
                    <td key={cell.sessionId} className="px-4 py-3">
                      {cell.display}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
