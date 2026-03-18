import Link from "next/link";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

function readParam(
  searchParams: PageProps["searchParams"],
  key: string,
): string | undefined {
  const val = searchParams?.[key];
  return Array.isArray(val) ? val[0] : val;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

type RiskLevel = "DANGER" | "WARNING";

type RiskStudent = {
  examNumber: string;
  name: string;
  mobile: string | null;
  cohortId: string | null;
  cohortName: string | null;
  consecutiveAbsences: number;
  totalAbsenceCount: number;
  lastAbsenceDate: string | null;
  avgScore: number | null;
  riskLevel: RiskLevel;
  counselingCount: number;
};

const RISK_CONFIG: Record<
  RiskLevel,
  { label: string; badge: string; cardBorder: string; cardBg: string; dot: string; sectionBg: string }
> = {
  DANGER: {
    label: "위험",
    badge: "bg-red-100 text-red-700 border-red-200",
    cardBorder: "border-red-200",
    cardBg: "bg-red-50",
    dot: "bg-red-500",
    sectionBg: "border-red-100",
  },
  WARNING: {
    label: "경고",
    badge: "bg-amber-100 text-amber-700 border-amber-200",
    cardBorder: "border-amber-200",
    cardBg: "bg-amber-50",
    dot: "bg-amber-500",
    sectionBg: "border-amber-100",
  },
};

/**
 * Compute consecutive absences by looking at the last N exam sessions for a student.
 * Consecutive = the most recent streak of ABSENT scores (counting backward from the latest session).
 */
function computeConsecutiveAbsences(
  sessionDates: Date[],
  absentDates: Set<string>,
): number {
  // Sort sessions descending (most recent first)
  const sorted = [...sessionDates].sort((a, b) => b.getTime() - a.getTime());
  let count = 0;
  for (const d of sorted) {
    const key = d.toISOString().slice(0, 10);
    if (absentDates.has(key)) {
      count++;
    } else {
      break;
    }
  }
  return count;
}

export default async function AttendanceRiskPage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.COUNSELOR);

  const selectedCohortId = readParam(searchParams, "cohortId");

  const prisma = getPrisma();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  const currentMonthLabel = `${now.getFullYear()}년 ${now.getMonth() + 1}월`;

  // 활성 기수 목록 (필터 드롭다운용)
  const activeCohorts = await prisma.cohort.findMany({
    where: { isActive: true },
    select: { id: true, name: true, examCategory: true },
    orderBy: { startDate: "desc" },
  });

  // 활성 수강 등록 조회
  const activeEnrollments = await prisma.courseEnrollment.findMany({
    where: {
      status: "ACTIVE",
      courseType: "COMPREHENSIVE",
      ...(selectedCohortId ? { cohortId: selectedCohortId } : {}),
    },
    select: {
      examNumber: true,
      cohortId: true,
      cohort: { select: { id: true, name: true } },
      student: { select: { examNumber: true, name: true, phone: true } },
    },
  });

  const totalActive = activeEnrollments.length;

  // 학생별 첫 번째 등록으로 중복 제거
  const enrollmentByExamNumber = new Map<string, typeof activeEnrollments[0]>();
  for (const e of activeEnrollments) {
    if (!enrollmentByExamNumber.has(e.examNumber)) {
      enrollmentByExamNumber.set(e.examNumber, e);
    }
  }
  const uniqueExamNumbers = [...enrollmentByExamNumber.keys()];

  if (uniqueExamNumbers.length === 0) {
    return (
      <div className="p-8 sm:p-10">
        <Breadcrumbs
          items={[
            { label: "알림", href: "/admin" },
            { label: "출결 위험 알림" },
          ]}
        />
        <div className="mt-8 rounded-[28px] border border-dashed border-ink/10 p-12 text-center">
          <p className="text-sm font-medium text-ink">활성 수강생 없음</p>
          <p className="mt-1 text-xs text-slate">현재 활성 종합반 수강생이 없습니다.</p>
        </div>
      </div>
    );
  }

  // 이번 달 Score.attendType=ABSENT 기록 (결석 일자, 학번)
  const absentScores = await prisma.score.findMany({
    where: {
      examNumber: { in: uniqueExamNumbers },
      attendType: "ABSENT",
      session: {
        examDate: { gte: monthStart, lte: monthEnd },
      },
    },
    select: {
      examNumber: true,
      session: { select: { examDate: true } },
    },
  });

  // 모든 이번달 시험 세션 목록 (student별 consecutive 계산용)
  const allSessionsThisMonth = await prisma.examSession.findMany({
    where: {
      examDate: { gte: monthStart, lte: monthEnd },
      isCancelled: false,
    },
    select: { examDate: true },
  });
  const allSessionDates = allSessionsThisMonth.map((s) => s.examDate);

  // 오늘 결석 학생 수
  const todayAbsentScores = await prisma.score.findMany({
    where: {
      examNumber: { in: uniqueExamNumbers },
      attendType: "ABSENT",
      session: {
        examDate: { gte: todayStart, lte: todayEnd },
      },
    },
    select: { examNumber: true },
  });
  const todayAbsentCount = new Set(todayAbsentScores.map((s) => s.examNumber)).size;

  // 학생별 결석 집계 (날짜 집합 + 마지막 결석일)
  const absenceMap = new Map<string, { dates: Set<string>; lastDate: Date | null }>();
  for (const score of absentScores) {
    const prev = absenceMap.get(score.examNumber) ?? { dates: new Set<string>(), lastDate: null };
    const d = score.session.examDate;
    const dateKey = d.toISOString().slice(0, 10);
    prev.dates.add(dateKey);
    if (prev.lastDate === null || d > prev.lastDate) {
      prev.lastDate = d;
    }
    absenceMap.set(score.examNumber, prev);
  }

  // 이번 달 평균 점수
  const scores = await prisma.score.findMany({
    where: {
      examNumber: { in: uniqueExamNumbers },
      attendType: { not: "ABSENT" },
      finalScore: { not: null },
      session: {
        examDate: { gte: monthStart, lte: monthEnd },
      },
    },
    select: { examNumber: true, finalScore: true },
  });

  const scoreMap = new Map<string, { sum: number; count: number }>();
  for (const s of scores) {
    const prev = scoreMap.get(s.examNumber) ?? { sum: 0, count: 0 };
    scoreMap.set(s.examNumber, {
      sum: prev.sum + (s.finalScore ?? 0),
      count: prev.count + 1,
    });
  }

  // 학생별 면담 횟수 (전체 누적)
  const counselingCounts = await prisma.counselingRecord.groupBy({
    by: ["examNumber"],
    where: { examNumber: { in: uniqueExamNumbers } },
    _count: { id: true },
  });
  const counselingMap = new Map(
    counselingCounts.map((c) => [c.examNumber, c._count.id]),
  );

  // 위험도 분류 (연속 결석 기반)
  // 위험: 4회 이상 연속 결석
  // 경고: 2~3회 연속 결석
  const danger: RiskStudent[] = [];
  const warning: RiskStudent[] = [];

  for (const [examNumber, enrollment] of enrollmentByExamNumber) {
    const absenceInfo = absenceMap.get(examNumber);
    if (!absenceInfo || absenceInfo.dates.size === 0) continue;

    const consecutiveAbsences = computeConsecutiveAbsences(
      allSessionDates,
      absenceInfo.dates,
    );

    // Only flag students with 2+ consecutive absences
    if (consecutiveAbsences < 2) continue;

    const scoreInfo = scoreMap.get(examNumber);
    const avgScore =
      scoreInfo && scoreInfo.count > 0
        ? Math.round((scoreInfo.sum / scoreInfo.count) * 10) / 10
        : null;

    const riskLevel: RiskLevel = consecutiveAbsences >= 4 ? "DANGER" : "WARNING";

    const item: RiskStudent = {
      examNumber,
      name: enrollment.student.name,
      mobile: enrollment.student.phone ?? null,
      cohortId: enrollment.cohortId ?? null,
      cohortName: enrollment.cohort?.name ?? null,
      consecutiveAbsences,
      totalAbsenceCount: absenceInfo.dates.size,
      lastAbsenceDate: absenceInfo.lastDate
        ? absenceInfo.lastDate.toISOString()
        : null,
      avgScore,
      riskLevel,
      counselingCount: counselingMap.get(examNumber) ?? 0,
    };

    if (riskLevel === "DANGER") danger.push(item);
    else warning.push(item);
  }

  danger.sort((a, b) => b.consecutiveAbsences - a.consecutiveAbsences);
  warning.sort((a, b) => b.consecutiveAbsences - a.consecutiveAbsences);

  const allRisk = [...danger, ...warning];

  return (
    <div className="p-8 sm:p-10">
      <Breadcrumbs
        items={[
          { label: "알림", href: "/admin" },
          { label: "출결 위험 알림" },
        ]}
      />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink">출결 위험 알림</h1>
          <p className="mt-1 text-sm text-slate">
            {currentMonthLabel} 기준 · 활성 종합반 수강생 {totalActive}명 대상 ·
            연속 결석 기준 위험도 분류
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* 일괄 알림 button (placeholder) */}
          <button
            type="button"
            disabled
            title="일괄 알림 기능 준비 중"
            className="inline-flex items-center gap-2 rounded-full border border-ember/30 bg-ember/10 px-4 py-2 text-sm font-medium text-ember opacity-60 cursor-not-allowed"
          >
            일괄 알림 발송
          </button>

          {/* 기수 필터 */}
          <form method="GET" className="flex items-center gap-2">
            <label className="text-sm font-medium text-slate" htmlFor="cohortId">
              기수 필터
            </label>
            <select
              id="cohortId"
              name="cohortId"
              defaultValue={selectedCohortId ?? ""}
              className="rounded-2xl border border-ink/10 bg-white px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ember/30"
            >
              <option value="">전체 기수</option>
              {activeCohorts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white transition hover:bg-forest"
            >
              적용
            </button>
            {selectedCohortId && (
              <Link
                href="/admin/alerts/attendance-risk"
                className="rounded-full border border-ink/10 px-4 py-2 text-sm text-slate transition hover:border-ink/30"
              >
                초기화
              </Link>
            )}
          </form>
        </div>
      </div>

      {/* 3 KPI cards */}
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-[24px] border border-red-200 bg-red-50 p-5">
          <p className="text-xs font-medium text-red-600">위험 (4회+ 연속 결석)</p>
          <p className="mt-1 text-2xl font-bold text-red-700">{danger.length}명</p>
          <p className="mt-1 text-[10px] text-slate">즉시 면담 권장</p>
        </div>
        <div className="rounded-[24px] border border-amber-200 bg-amber-50 p-5">
          <p className="text-xs font-medium text-amber-600">경고 (2~3회 연속 결석)</p>
          <p className="mt-1 text-2xl font-bold text-amber-700">{warning.length}명</p>
          <p className="mt-1 text-[10px] text-slate">모니터링 필요</p>
        </div>
        <div className="rounded-[24px] border border-sky-200 bg-sky-50 p-5">
          <p className="text-xs font-medium text-sky-600">오늘 결석</p>
          <p className="mt-1 text-2xl font-bold text-sky-700">{todayAbsentCount}명</p>
          <p className="mt-1 text-[10px] text-slate">{currentMonthLabel}</p>
        </div>
      </div>

      {/* Threshold legend */}
      <div className="mt-6 rounded-[20px] border border-ink/8 bg-mist/60 px-5 py-4">
        <p className="text-xs font-semibold text-slate uppercase tracking-wider">위험도 기준</p>
        <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" />
            <strong className="text-red-700">위험</strong>: 최근 연속 결석 4회 이상
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-500" />
            <strong className="text-amber-700">경고</strong>: 최근 연속 결석 2~3회
          </span>
        </div>
      </div>

      {allRisk.length === 0 ? (
        <div className="mt-8 rounded-[28px] border border-dashed border-ink/10 p-12 text-center">
          <p className="text-sm font-medium text-ink">위험 학생 없음</p>
          <p className="mt-1 text-xs text-slate">
            {currentMonthLabel} 기준 연속 결석 위험 수강생이 없습니다.
          </p>
        </div>
      ) : (
        <div className="mt-8 space-y-8">
          {(
            [
              { level: "DANGER" as RiskLevel, students: danger },
              { level: "WARNING" as RiskLevel, students: warning },
            ] as const
          ).map(({ level, students }) => {
            if (students.length === 0) return null;
            const cfg = RISK_CONFIG[level];
            return (
              <section key={level}>
                <div className="mb-3 flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${cfg.dot}`} />
                  <h2 className="text-base font-semibold text-ink">
                    {cfg.label}
                    <span className="ml-2 text-sm font-normal text-slate">
                      {students.length}명
                    </span>
                  </h2>
                </div>

                <div className="overflow-hidden rounded-[24px] border border-ink/10 bg-white">
                  <table className="min-w-full divide-y divide-ink/10 text-sm">
                    <thead className="bg-mist/60 text-left">
                      <tr>
                        <th className="px-5 py-3 font-semibold text-xs uppercase tracking-wider text-slate">이름 / 학번</th>
                        <th className="px-5 py-3 font-semibold text-xs uppercase tracking-wider text-slate">기수</th>
                        <th className="px-5 py-3 font-semibold text-xs uppercase tracking-wider text-slate">연속 결석</th>
                        <th className="px-5 py-3 font-semibold text-xs uppercase tracking-wider text-slate">이번달 결석</th>
                        <th className="px-5 py-3 font-semibold text-xs uppercase tracking-wider text-slate">마지막 결석일</th>
                        <th className="px-5 py-3 font-semibold text-xs uppercase tracking-wider text-slate">이번달 평균</th>
                        <th className="px-5 py-3 font-semibold text-xs uppercase tracking-wider text-slate">면담 횟수</th>
                        <th className="px-5 py-3 font-semibold text-xs uppercase tracking-wider text-slate">조치</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink/10">
                      {students.map((s) => (
                        <tr key={s.examNumber} className="transition hover:bg-mist/40">
                          <td className="px-5 py-4">
                            <Link
                              href={`/admin/students/${s.examNumber}`}
                              className="font-semibold text-ink transition hover:text-ember"
                            >
                              {s.name}
                            </Link>
                            <p className="text-xs text-slate">{s.examNumber}</p>
                            {s.mobile && (
                              <p className="text-xs text-slate">{s.mobile}</p>
                            )}
                          </td>
                          <td className="px-5 py-4">
                            {s.cohortName ? (
                              <span className="text-sm text-ink">{s.cohortName}</span>
                            ) : (
                              <span className="text-slate">-</span>
                            )}
                          </td>
                          <td className="px-5 py-4">
                            <span
                              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cfg.badge}`}
                            >
                              {s.consecutiveAbsences}회 연속
                            </span>
                          </td>
                          <td className="px-5 py-4 text-sm text-slate">
                            {s.totalAbsenceCount}회
                          </td>
                          <td className="px-5 py-4 text-slate text-xs">
                            {fmtDate(s.lastAbsenceDate)}
                          </td>
                          <td className="px-5 py-4">
                            {s.avgScore !== null ? (
                              <span
                                className={
                                  s.avgScore < 60
                                    ? "font-semibold text-red-600"
                                    : s.avgScore < 70
                                      ? "font-semibold text-amber-600"
                                      : "text-ink"
                                }
                              >
                                {s.avgScore.toFixed(1)}점
                              </span>
                            ) : (
                              <span className="text-slate">-</span>
                            )}
                          </td>
                          <td className="px-5 py-4">
                            <span
                              className={`text-sm font-semibold ${
                                s.counselingCount > 0 ? "text-forest" : "text-slate"
                              }`}
                            >
                              {s.counselingCount}회
                            </span>
                          </td>
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Link
                                href={`/admin/counseling/new?examNumber=${s.examNumber}`}
                                className="inline-flex items-center rounded-full bg-forest/10 px-3 py-1.5 text-xs font-medium text-forest transition hover:bg-forest/20"
                              >
                                면담 신청
                              </Link>
                              <Link
                                href={`/admin/notifications/send?examNumber=${s.examNumber}`}
                                className="inline-flex items-center rounded-full border border-ink/10 px-3 py-1.5 text-xs font-medium text-slate transition hover:border-forest/30 hover:text-forest"
                              >
                                알림 발송
                              </Link>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
