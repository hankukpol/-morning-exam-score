import { AdminRole, StudentStatus } from "@/generated/prisma";
import { StatusBadge } from "@/components/analytics/status-badge";
import {
  STATUS_ROW_CLASS,
} from "@/lib/analytics/presentation";
import { getDropoutMonitor } from "@/lib/analytics/service";
import {
  getAnalyticsContext,
  readStringParam,
} from "@/lib/analytics/ui";
import { requireAdminContext } from "@/lib/auth";
import { EXAM_TYPE_LABEL, STUDENT_TYPE_LABEL } from "@/lib/constants";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

const STATUS_FILTER_OPTIONS = [
  { value: "ALL", label: "전체" },
  { value: StudentStatus.DROPOUT, label: "탈락" },
  { value: StudentStatus.WARNING_2, label: "2차 경고" },
  { value: StudentStatus.WARNING_1, label: "1차 경고" },
  { value: StudentStatus.NORMAL, label: "정상" },
] as const;

const CARD_BORDER_CLASS: Record<StudentStatus, string> = {
  NORMAL: "border-ink/10",
  WARNING_1: "border-amber-200",
  WARNING_2: "border-orange-300",
  DROPOUT: "border-red-300",
};

function formatWeekChip(weekKey: string) {
  const parts = weekKey.split("-");
  if (parts.length !== 3) return weekKey;
  const start = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return `${start.getMonth() + 1}/${start.getDate()}~${end.getMonth() + 1}/${end.getDate()}`;
}

function formatMonthChip(monthKey: string) {
  const [, month] = monthKey.split("-");
  return `${parseInt(month ?? "0")}월`;
}

export default async function AdminDropoutPage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.VIEWER);
  const { periods, selectedPeriod, examType } = await getAnalyticsContext(searchParams);
  const selectedStatus = readStringParam(searchParams, "status") ?? "ALL";
  const data = selectedPeriod
    ? await getDropoutMonitor(selectedPeriod.id, examType)
    : null;
  const rows =
    data?.rows.filter((row) => (selectedStatus === "ALL" ? true : row.status === selectedStatus)) ??
    [];

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        F-05 Dropout
      </div>
      <h1 className="mt-5 text-3xl font-semibold">탈락 · 경고 관리</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        주차별 3회, 월 누적 8회 기준을 동시에 계산해서 현재 상태와 복귀 가능일을 확인합니다.
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
          <label className="mb-2 block text-sm font-medium">상태 필터</label>
          <select
            name="status"
            defaultValue={selectedStatus}
            className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
          >
            {STATUS_FILTER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
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

      {!selectedPeriod || !data ? (
        <div className="mt-8 rounded-[28px] border border-dashed border-ink/10 p-8 text-sm text-slate">
          시험 기간을 먼저 선택하세요.
        </div>
      ) : rows.length === 0 ? (
        <div className="mt-8 rounded-[28px] border border-dashed border-ink/10 p-8 text-center text-sm text-slate">
          해당 조건의 학생이 없습니다.
        </div>
      ) : (
        <div className="mt-8 space-y-3">
          <p className="text-sm text-slate">총 {rows.length}명</p>
          {rows.map((row) => {
            const weekEntries = Object.entries(row.weekAbsences).sort(([a], [b]) =>
              a.localeCompare(b),
            );
            const monthEntries = Object.entries(row.monthAbsences).sort(([a], [b]) =>
              a.localeCompare(b),
            );
            const hasAbsences = weekEntries.length > 0 || monthEntries.length > 0;

            return (
              <article
                key={row.examNumber}
                className={`rounded-[28px] border p-5 ${CARD_BORDER_CLASS[row.status]} ${STATUS_ROW_CLASS[row.status]}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-semibold">{row.examNumber}</span>
                    <span className="text-base font-semibold">{row.name}</span>
                    <span className="text-sm text-slate">{STUDENT_TYPE_LABEL[row.studentType]}</span>
                    {!row.isActive && (
                      <span className="rounded-full border border-slate/20 bg-slate/10 px-2 py-0.5 text-xs text-slate">
                        비활성
                      </span>
                    )}
                    <StatusBadge status={row.status} />
                  </div>
                  {row.recoveryDate ? (
                    <span className="text-sm text-slate">
                      복귀 가능일:{" "}
                      <span className="font-medium text-ink">{formatDate(row.recoveryDate)}</span>
                    </span>
                  ) : null}
                </div>

                {hasAbsences && (
                  <div className="mt-3 flex flex-col gap-2 border-t border-ink/10 pt-3">
                    {weekEntries.length > 0 && (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="w-[52px] shrink-0 text-xs font-medium text-slate">
                          주차별
                        </span>
                        {weekEntries.map(([key, count]) => (
                          <span
                            key={key}
                            className={`inline-flex rounded-full border px-3 py-0.5 text-xs font-semibold ${
                              count >= 3
                                ? "border-red-200 bg-red-50 text-red-700"
                                : count >= 2
                                  ? "border-orange-200 bg-orange-50 text-orange-700"
                                  : "border-amber-200 bg-amber-50 text-amber-700"
                            }`}
                          >
                            {formatWeekChip(key)}: {count}회
                          </span>
                        ))}
                      </div>
                    )}
                    {monthEntries.length > 0 && (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="w-[52px] shrink-0 text-xs font-medium text-slate">
                          월별
                        </span>
                        {monthEntries.map(([key, count]) => (
                          <span
                            key={key}
                            className={`inline-flex rounded-full border px-3 py-0.5 text-xs font-semibold ${
                              count >= 8
                                ? "border-red-200 bg-red-50 text-red-700"
                                : "border-amber-200 bg-amber-50 text-amber-700"
                            }`}
                          >
                            {formatMonthChip(key)}: {count}회
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
