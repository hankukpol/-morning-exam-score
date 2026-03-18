import { AdminRole } from "@prisma/client";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { EXAM_CATEGORY_LABEL } from "@/lib/constants";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

function readStringParam(
  searchParams: PageProps["searchParams"],
  key: string,
): string | undefined {
  const v = searchParams?.[key];
  if (Array.isArray(v)) return v[0];
  return v ?? undefined;
}

function fmt(n: number): string {
  return n.toLocaleString("ko-KR");
}

function pct(num: number, den: number): string {
  if (den === 0) return "—";
  return ((num / den) * 100).toFixed(1) + "%";
}

function avgFmt(val: number | null): string {
  if (val === null) return "—";
  return val.toFixed(1);
}

type ColKey =
  | "enrollmentCount"
  | "dropoutRate"
  | "avgScore"
  | "attendanceRate"
  | "revenue";

type CohortRow = {
  id: string;
  name: string;
  examCategory: string;
  startDate: Date;
  endDate: Date;
  enrollmentCount: number;
  dropoutRate: number | null;
  avgScore: number | null;
  attendanceRate: number | null;
  revenue: number;
};

// Determine best/worst indices per numeric column (higher = better except dropout)
function buildColorMap(
  rows: CohortRow[],
  col: ColKey,
): Map<string, "best" | "worst" | "mid"> {
  const colMap = new Map<string, "best" | "worst" | "mid">();
  if (rows.length < 2) return colMap;

  const values = rows.map((r) => r[col] as number | null);
  const valid = values.filter((v): v is number => v !== null);
  if (valid.length < 2) return colMap;

  const max = Math.max(...valid);
  const min = Math.min(...valid);
  if (max === min) return colMap;

  rows.forEach((r) => {
    const v = r[col] as number | null;
    if (v === null) return;
    // For dropout rate, lower is better
    if (col === "dropoutRate") {
      if (v === min) colMap.set(r.id, "best");
      else if (v === max) colMap.set(r.id, "worst");
      else colMap.set(r.id, "mid");
    } else {
      if (v === max) colMap.set(r.id, "best");
      else if (v === min) colMap.set(r.id, "worst");
      else colMap.set(r.id, "mid");
    }
  });
  return colMap;
}

function cellClass(
  colorMap: Map<string, "best" | "worst" | "mid">,
  id: string,
): string {
  const v = colorMap.get(id);
  if (v === "best") return "text-green-700 font-semibold";
  if (v === "worst") return "text-red-600 font-semibold";
  return "";
}

export default async function CohortComparisonPage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.MANAGER);

  const courseIdParam = readStringParam(searchParams, "courseId");

  const prisma = getPrisma();

  // Fetch last 10 cohorts, optionally filtered by cohort that has related payments
  // (Course doesn't link to Cohort directly in schema — filter by examCategory if courseId present)
  // courseId filter: read course to get examCategory
  let examCategoryFilter: string | undefined;
  if (courseIdParam) {
    const course = await prisma.course.findUnique({
      where: { id: parseInt(courseIdParam, 10) },
      select: { examType: true },
    });
    // ExamType → ExamCategory mapping (best-effort)
    if (course?.examType === "GONGCHAE") examCategoryFilter = "GONGCHAE";
    else if (course?.examType === "GYEONGCHAE") examCategoryFilter = "GYEONGCHAE";
  }

  const cohorts = await prisma.cohort.findMany({
    where: examCategoryFilter
      ? { examCategory: examCategoryFilter as never }
      : undefined,
    orderBy: { startDate: "desc" },
    take: 10,
    select: {
      id: true,
      name: true,
      examCategory: true,
      startDate: true,
      endDate: true,
    },
  });

  // Fetch enrollment stats per cohort in a single query
  const enrollmentGroups = await prisma.courseEnrollment.groupBy({
    by: ["cohortId", "status"],
    _count: { status: true },
    where: {
      cohortId: { in: cohorts.map((c) => c.id) },
    },
  });

  // Fetch payment totals per cohort
  // Payments link to enrollments which link to cohorts
  const paymentAggData = await prisma.payment.findMany({
    where: {
      status: "APPROVED",
      enrollmentId: {
        in: await prisma.courseEnrollment
          .findMany({
            where: {
              cohortId: { in: cohorts.map((c) => c.id) },
            },
            select: { id: true },
          })
          .then((rows) => rows.map((r) => r.id)),
      },
    },
    select: {
      netAmount: true,
      enrollmentId: true,
    },
  });

  // Map enrollmentId → cohortId
  const enrollmentCohortMap = new Map<string, string>();
  const enrollmentRows = await prisma.courseEnrollment.findMany({
    where: { cohortId: { in: cohorts.map((c) => c.id) } },
    select: { id: true, cohortId: true },
  });
  for (const e of enrollmentRows) {
    if (e.cohortId) enrollmentCohortMap.set(e.id, e.cohortId);
  }

  // Revenue per cohort
  const revenueMap = new Map<string, number>();
  for (const p of paymentAggData) {
    if (!p.enrollmentId) continue;
    const cohortId = enrollmentCohortMap.get(p.enrollmentId);
    if (!cohortId) continue;
    revenueMap.set(cohortId, (revenueMap.get(cohortId) ?? 0) + p.netAmount);
  }

  // Attendance: ClassroomAttendanceLog doesn't directly reference cohortId.
  // We need to go through students' cohort enrollments.
  // Get student-cohort membership
  const cohortStudentsMap = new Map<string, Set<string>>();
  for (const e of enrollmentRows) {
    if (!e.cohortId) continue;
    if (!cohortStudentsMap.has(e.cohortId)) {
      cohortStudentsMap.set(e.cohortId, new Set());
    }
    cohortStudentsMap.get(e.cohortId)!.add(
      enrollmentRows.find((r) => r.id === e.id)?.cohortId ?? "",
    );
  }

  // Rebuild correctly: examNumber per cohort
  const cohortExamNumbersMap = new Map<string, string[]>();
  const enrollmentExamMap = await prisma.courseEnrollment.findMany({
    where: { cohortId: { in: cohorts.map((c) => c.id) } },
    select: { cohortId: true, examNumber: true },
  });
  for (const e of enrollmentExamMap) {
    if (!e.cohortId) continue;
    if (!cohortExamNumbersMap.has(e.cohortId)) {
      cohortExamNumbersMap.set(e.cohortId, []);
    }
    cohortExamNumbersMap.get(e.cohortId)!.push(e.examNumber);
  }

  // Attendance logs per cohort: count PRESENT vs total within cohort date range
  const attendanceMap = new Map<string, { present: number; total: number }>();
  for (const cohort of cohorts) {
    const examNumbers = cohortExamNumbersMap.get(cohort.id) ?? [];
    if (examNumbers.length === 0) {
      attendanceMap.set(cohort.id, { present: 0, total: 0 });
      continue;
    }
    const logs = await prisma.classroomAttendanceLog.groupBy({
      by: ["attendType"],
      _count: { attendType: true },
      where: {
        examNumber: { in: examNumbers },
        attendDate: {
          gte: cohort.startDate,
          lte: cohort.endDate,
        },
      },
    });
    // NORMAL and LIVE are both "present" attendance types
    const present = logs
      .filter((l) => l.attendType === "NORMAL" || l.attendType === "LIVE")
      .reduce((s, l) => s + l._count.attendType, 0);
    const total = logs.reduce((s, l) => s + l._count.attendType, 0);
    attendanceMap.set(cohort.id, { present, total });
  }

  // Scores: Score is per ExamSession (not directly cohort-linked).
  // Approximate: students in cohort × their scores within the cohort date range.
  const scoreMap = new Map<string, number | null>();
  for (const cohort of cohorts) {
    const examNumbers = cohortExamNumbersMap.get(cohort.id) ?? [];
    if (examNumbers.length === 0) {
      scoreMap.set(cohort.id, null);
      continue;
    }
    const result = await prisma.score.aggregate({
      _avg: { finalScore: true },
      where: {
        examNumber: { in: examNumbers },
        finalScore: { not: null },
        session: {
          examDate: {
            gte: cohort.startDate,
            lte: cohort.endDate,
          },
        },
      },
    });
    scoreMap.set(cohort.id, result._avg.finalScore ?? null);
  }

  // Build rows
  const rows: CohortRow[] = cohorts.map((cohort) => {
    const groups = enrollmentGroups.filter((g) => g.cohortId === cohort.id);
    const total = groups.reduce((s, g) => s + g._count.status, 0);
    const suspended = groups
      .filter((g) => g.status === "SUSPENDED")
      .reduce((s, g) => s + g._count.status, 0);

    const att = attendanceMap.get(cohort.id) ?? { present: 0, total: 0 };

    return {
      id: cohort.id,
      name: cohort.name,
      examCategory: cohort.examCategory,
      startDate: cohort.startDate,
      endDate: cohort.endDate,
      enrollmentCount: total,
      dropoutRate: total > 0 ? (suspended / total) * 100 : null,
      avgScore: scoreMap.get(cohort.id) ?? null,
      attendanceRate:
        att.total > 0 ? (att.present / att.total) * 100 : null,
      revenue: revenueMap.get(cohort.id) ?? 0,
    };
  });

  // Color maps per KPI column
  const enrollColorMap = buildColorMap(rows, "enrollmentCount");
  const dropColorMap = buildColorMap(rows, "dropoutRate");
  const scoreColorMap = buildColorMap(rows, "avgScore");
  const attColorMap = buildColorMap(rows, "attendanceRate");
  const revColorMap = buildColorMap(rows, "revenue");

  // Summary totals
  const totalEnrollments = rows.reduce((s, r) => s + r.enrollmentCount, 0);
  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const scoredRows = rows.filter((r) => r.avgScore !== null);
  const overallAvgScore =
    scoredRows.length > 0
      ? scoredRows.reduce((s, r) => s + r.avgScore!, 0) / scoredRows.length
      : null;

  // Courses for filter dropdown
  const courses = await prisma.course.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
    take: 50,
  });

  return (
    <div className="p-8 sm:p-10">
      {/* Badge */}
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        분석
      </div>
      <h1 className="mt-5 text-3xl font-semibold">기수별 비교 분석</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        최근 기수들의 등록 수, 중도탈락율, 평균 성적, 출석률, 수납액을 한눈에 비교합니다.
      </p>

      {/* Filter */}
      <form method="get" className="mt-8 flex flex-wrap gap-4 rounded-[28px] border border-ink/10 bg-mist p-6">
        <div className="min-w-[220px] flex-1">
          <label className="mb-2 block text-sm font-medium">강좌 필터 (카테고리 기준)</label>
          <select
            name="courseId"
            defaultValue={courseIdParam ?? ""}
            className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
          >
            <option value="">전체</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <button
            type="submit"
            className="inline-flex items-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest"
          >
            필터 적용
          </button>
        </div>
        {courseIdParam && (
          <div className="flex items-end">
            <Link
              href="/admin/analytics/cohorts"
              className="inline-flex items-center rounded-full border border-ink/20 px-5 py-3 text-sm font-medium text-ink transition hover:border-forest/40 hover:text-forest"
            >
              초기화
            </Link>
          </div>
        )}
      </form>

      {/* Summary KPIs */}
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">조회 기수</p>
          <p className="mt-2 text-3xl font-semibold text-ink">{rows.length}개</p>
          <p className="mt-1 text-xs text-slate">최근 순</p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">총 등록</p>
          <p className="mt-2 text-3xl font-semibold text-forest">{fmt(totalEnrollments)}명</p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">평균 성적</p>
          <p className="mt-2 text-3xl font-semibold text-ember">
            {overallAvgScore !== null ? overallAvgScore.toFixed(1) : "—"}
          </p>
          <p className="mt-1 text-xs text-slate">전체 기수 평균</p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">총 수납액</p>
          <p className="mt-2 text-3xl font-semibold text-sky-600">
            {fmt(totalRevenue)}원
          </p>
        </div>
      </div>

      {/* Comparison Table */}
      <section className="mt-8 rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">기수 비교 테이블</h2>
        <p className="mt-1 text-xs text-slate">
          각 열에서{" "}
          <span className="font-semibold text-green-700">초록색</span>이 최우수,{" "}
          <span className="font-semibold text-red-600">빨간색</span>이 최하위입니다.
          (휴원율은 낮을수록 좋음)
        </p>

        {rows.length === 0 ? (
          <div className="mt-6 rounded-[20px] border border-dashed border-ink/10 py-12 text-center text-sm text-slate">
            조건에 해당하는 기수가 없습니다.
          </div>
        ) : (
          <div className="mt-6 overflow-x-auto rounded-[20px] border border-ink/10">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-ink/10 bg-mist text-left">
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate">기수명</th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate">카테고리</th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate">기간</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate">
                    등록 수
                  </th>
                  <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate">
                    휴원율
                  </th>
                  <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate">
                    평균 성적
                  </th>
                  <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate">
                    출석률
                  </th>
                  <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate">
                    수납액
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {rows.map((row) => (
                  <tr key={row.id} className="transition-colors hover:bg-mist/60">
                    <td className="px-5 py-3 font-medium text-ink">
                      <Link
                        href={`/admin/settings/cohorts/${row.id}`}
                        className="text-forest hover:underline"
                      >
                        {row.name}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-slate">
                      {EXAM_CATEGORY_LABEL[row.examCategory as keyof typeof EXAM_CATEGORY_LABEL] ??
                        row.examCategory}
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-slate">
                      {row.startDate.toLocaleDateString("ko-KR", {
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit",
                      })}
                      {" ~ "}
                      {row.endDate.toLocaleDateString("ko-KR", {
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit",
                      })}
                    </td>
                    <td
                      className={`px-5 py-3 text-right font-mono ${cellClass(enrollColorMap, row.id)}`}
                    >
                      {fmt(row.enrollmentCount)}명
                    </td>
                    <td
                      className={`px-5 py-3 text-right font-mono ${cellClass(dropColorMap, row.id)}`}
                    >
                      {row.dropoutRate !== null
                        ? row.dropoutRate.toFixed(1) + "%"
                        : "—"}
                    </td>
                    <td
                      className={`px-5 py-3 text-right font-mono ${cellClass(scoreColorMap, row.id)}`}
                    >
                      {avgFmt(row.avgScore)}
                    </td>
                    <td
                      className={`px-5 py-3 text-right font-mono ${cellClass(attColorMap, row.id)}`}
                    >
                      {row.attendanceRate !== null
                        ? row.attendanceRate.toFixed(1) + "%"
                        : "—"}
                    </td>
                    <td
                      className={`px-5 py-3 text-right font-mono ${cellClass(revColorMap, row.id)}`}
                    >
                      {fmt(row.revenue)}원
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-ink/10 bg-mist/80">
                  <td className="px-5 py-3 text-xs font-semibold text-slate" colSpan={3}>
                    합계 / 평균
                  </td>
                  <td className="px-5 py-3 text-right font-mono text-sm font-semibold text-ink">
                    {fmt(totalEnrollments)}명
                  </td>
                  <td className="px-5 py-3 text-right font-mono text-sm text-slate">
                    {rows.length > 0
                      ? pct(
                          rows.reduce(
                            (s, r) => s + (r.dropoutRate !== null ? r.dropoutRate : 0),
                            0,
                          ) / rows.filter((r) => r.dropoutRate !== null).length,
                          100,
                        )
                      : "—"}
                  </td>
                  <td className="px-5 py-3 text-right font-mono text-sm text-slate">
                    {overallAvgScore !== null ? overallAvgScore.toFixed(1) : "—"}
                  </td>
                  <td className="px-5 py-3 text-right font-mono text-sm text-slate">
                    {rows.filter((r) => r.attendanceRate !== null).length > 0
                      ? (
                          rows
                            .filter((r) => r.attendanceRate !== null)
                            .reduce((s, r) => s + r.attendanceRate!, 0) /
                          rows.filter((r) => r.attendanceRate !== null).length
                        ).toFixed(1) + "%"
                      : "—"}
                  </td>
                  <td className="px-5 py-3 text-right font-mono text-sm font-semibold text-ink">
                    {fmt(totalRevenue)}원
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      {/* Legend */}
      <section className="mt-6 rounded-[28px] border border-ink/10 bg-mist p-6">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-slate">지표 설명</h2>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3 text-sm">
          <div>
            <dt className="font-semibold text-ink">등록 수</dt>
            <dd className="mt-1 text-slate">대기(WAITING) 포함 전체 수강 신청 건수</dd>
          </div>
          <div>
            <dt className="font-semibold text-ink">휴원율</dt>
            <dd className="mt-1 text-slate">현재 상태가 SUSPENDED인 비율 (낮을수록 좋음)</dd>
          </div>
          <div>
            <dt className="font-semibold text-ink">평균 성적</dt>
            <dd className="mt-1 text-slate">기수 소속 학생들의 기수 기간 내 finalScore 평균</dd>
          </div>
          <div>
            <dt className="font-semibold text-ink">출석률</dt>
            <dd className="mt-1 text-slate">기수 기간 내 PRESENT 로그 / 전체 출석 로그 비율</dd>
          </div>
          <div>
            <dt className="font-semibold text-ink">수납액</dt>
            <dd className="mt-1 text-slate">APPROVED 상태 Payment.netAmount 합계</dd>
          </div>
        </dl>
      </section>

      {/* Navigation */}
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href="/admin/analytics"
          className="inline-flex items-center gap-1.5 rounded-full border border-ink/20 bg-white px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-forest/40 hover:text-forest"
        >
          ← 분석 허브
        </Link>
        <Link
          href="/admin/settings/cohorts"
          className="inline-flex items-center gap-1.5 rounded-full border border-ink/20 bg-white px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-forest/40 hover:text-forest"
        >
          기수 관리 →
        </Link>
        <Link
          href="/admin/analytics/retention"
          className="inline-flex items-center gap-1.5 rounded-full border border-ink/20 bg-white px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-forest/40 hover:text-forest"
        >
          재원율 분석 →
        </Link>
      </div>
    </div>
  );
}
