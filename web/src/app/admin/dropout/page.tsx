import { AdminRole, StudentStatus } from "@/generated/prisma";
import { StatusBadge } from "@/components/analytics/status-badge";
import {
  summarizeCountRecord,
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
      ) : (
        <div className="mt-8 overflow-x-auto rounded-[28px] border border-ink/10 bg-white">
          <table className="min-w-full divide-y divide-ink/10 text-sm">
            <thead className="bg-mist/80 text-left">
              <tr>
                <th className="px-4 py-3 font-semibold">수험번호</th>
                <th className="px-4 py-3 font-semibold">이름</th>
                <th className="px-4 py-3 font-semibold">구분</th>
                <th className="px-4 py-3 font-semibold">활성</th>
                <th className="px-4 py-3 font-semibold">현재 상태</th>
                <th className="px-4 py-3 font-semibold">복귀 가능일</th>
                <th className="px-4 py-3 font-semibold">주차별 결시</th>
                <th className="px-4 py-3 font-semibold">월별 결시</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/10">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate">
                    해당 조건의 학생이 없습니다.
                  </td>
                </tr>
              ) : null}
              {rows.map((row) => (
                <tr key={row.examNumber}>
                  <td className="px-4 py-3 font-medium">{row.examNumber}</td>
                  <td className="px-4 py-3">{row.name}</td>
                  <td className="px-4 py-3">{STUDENT_TYPE_LABEL[row.studentType]}</td>
                  <td className="px-4 py-3">{row.isActive ? "활성" : "비활성"}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={row.status} />
                  </td>
                  <td className="px-4 py-3">
                    {row.recoveryDate ? formatDate(row.recoveryDate) : "-"}
                  </td>
                  <td className="px-4 py-3">{summarizeCountRecord(row.weekAbsences)}</td>
                  <td className="px-4 py-3">{summarizeCountRecord(row.monthAbsences)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
