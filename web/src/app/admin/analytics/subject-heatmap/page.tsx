import { AdminRole } from "@prisma/client";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { SubjectHeatmap } from "@/components/analytics/subject-heatmap";
import { listPeriodsBasic } from "@/lib/periods/service";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

function readParam(sp: PageProps["searchParams"], key: string): string | undefined {
  const v = sp?.[key];
  return Array.isArray(v) ? v[0] : v;
}

export default async function SubjectHeatmapPage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.VIEWER);

  const examNumber = readParam(searchParams, "examNumber")?.trim() ?? "";
  const periodIdRaw = readParam(searchParams, "periodId");
  const periodId = periodIdRaw ? parseInt(periodIdRaw, 10) : null;

  // Load periods for selector (basic list: id, name, startDate, endDate, isActive)
  const periods = await listPeriodsBasic();

  // If examNumber provided, lookup student
  let student: { examNumber: string; name: string } | null = null;
  if (examNumber) {
    student = await getPrisma().student.findUnique({
      where: { examNumber },
      select: { examNumber: true, name: true },
    });
  }

  return (
    <div className="p-8 sm:p-10">
      {/* Header */}
      <div className="inline-flex rounded-full border border-ink/20 bg-ink/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-slate">
        성적 분석
      </div>
      <h1 className="mt-5 text-3xl font-semibold">과목별 성적 히트맵</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        학생의 과목별 주차 성적 분포를 색상으로 시각화합니다.
      </p>

      {/* Search form */}
      <form
        method="GET"
        className="mt-8 rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="text-xs font-medium text-slate">학번</label>
            <input
              type="text"
              name="examNumber"
              defaultValue={examNumber}
              placeholder="수험번호 입력"
              className="mt-1 block w-full rounded-2xl border border-ink/20 bg-mist/30 px-4 py-2.5 text-sm text-ink placeholder:text-slate/50 focus:border-ember/50 focus:outline-none focus:ring-2 focus:ring-ember/10"
            />
          </div>
          <div className="flex-1">
            <label className="text-xs font-medium text-slate">기간 (Period)</label>
            <select
              name="periodId"
              defaultValue={periodId ?? ""}
              className="mt-1 block w-full rounded-2xl border border-ink/20 bg-white px-4 py-2.5 text-sm text-ink focus:border-ember/50 focus:outline-none focus:ring-2 focus:ring-ember/10"
            >
              <option value="">기간 선택</option>
              {periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name ?? `Period ${p.id}`}
                  {p.isActive ? " (활성)" : ""}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="rounded-2xl bg-ember px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-ember/90"
          >
            조회
          </button>
        </div>
        {examNumber && !student && (
          <p className="mt-3 text-sm text-red-600">해당 학번의 학생을 찾을 수 없습니다.</p>
        )}
        {student && (
          <p className="mt-3 text-sm text-slate">
            <Link
              href={`/admin/students/${student.examNumber}`}
              className="font-semibold text-ember hover:underline"
            >
              {student.name}
            </Link>{" "}
            ({student.examNumber})
          </p>
        )}
      </form>

      {/* Heatmap */}
      {examNumber && periodId !== null && !isNaN(periodId) && student ? (
        <div className="mt-6 rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
          <h2 className="mb-4 text-sm font-semibold text-ink">
            {student.name} — 과목·주차별 점수
          </h2>
          <SubjectHeatmap examNumber={examNumber} periodId={periodId} />
        </div>
      ) : examNumber && periodId !== null && !isNaN(periodId) && !student ? (
        <div className="mt-6 rounded-[28px] border border-ink/10 bg-white p-8 shadow-panel text-center">
          <p className="text-sm text-slate">학생 정보를 찾을 수 없습니다.</p>
        </div>
      ) : (
        <div className="mt-6 rounded-[28px] border border-ink/10 bg-white p-8 shadow-panel text-center">
          <p className="text-sm text-slate">학번과 기간을 입력하면 히트맵이 표시됩니다.</p>
        </div>
      )}
    </div>
  );
}
