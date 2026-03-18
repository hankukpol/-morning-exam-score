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

type RiskLevel = "DANGER" | "WARNING" | "CAUTION";

type RiskStudent = {
  examNumber: string;
  name: string;
  mobile: string | null;
  cohortId: string | null;
  cohortName: string | null;
  absenceCount: number;
  lastAbsenceDate: string | null;
  avgScore: number | null;
  riskLevel: RiskLevel;
};

const RISK_CONFIG: Record<
  RiskLevel,
  { label: string; badge: string; cardBorder: string; cardBg: string; dot: string }
> = {
  DANGER: {
    label: "위험",
    badge: "bg-red-100 text-red-700 border-red-200",
    cardBorder: "border-red-200",
    cardBg: "bg-red-50",
    dot: "bg-red-500",
  },
  WARNING: {
    label: "경고",
    badge: "bg-amber-100 text-amber-700 border-amber-200",
    cardBorder: "border-amber-200",
    cardBg: "bg-amber-50",
    dot: "bg-amber-500",
  },
  CAUTION: {
    label: "주의",
    badge: "bg-sky-100 text-sky-700 border-sky-200",
    cardBorder: "border-sky-200",
    cardBg: "bg-sky-50",
    dot: "bg-sky-500",
  },
};

export default async function AttendanceRiskPage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.COUNSELOR);

  const selectedCohortId = readParam(searchParams, "cohortId");

  const prisma = getPrisma();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
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

  // 이번 달 결석 AbsenceNote (PENDING + APPROVED)
  const absenceNotes = await prisma.absenceNote.findMany({
    where: {
      examNumber: { in: uniqueExamNumbers },
      status: { in: ["PENDING", "APPROVED"] },
      session: {
        examDate: { gte: monthStart, lte: monthEnd },
      },
    },
    select: {
      examNumber: true,
      session: { select: { examDate: true } },
    },
  });

  const absenceMap = new Map<string, { count: number; lastDate: Date | null }>();
  for (const note of absenceNotes) {
    const prev = absenceMap.get(note.examNumber) ?? { count: 0, lastDate: null };
    const d = note.session.examDate;
    absenceMap.set(note.examNumber, {
      count: prev.count + 1,
      lastDate: prev.lastDate === null || d > prev.lastDate ? d : prev.lastDate,
    });
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

  // 위험도 분류
  const danger: RiskStudent[] = [];
  const warning: RiskStudent[] = [];
  const caution: RiskStudent[] = [];

  for (const [examNumber, enrollment] of enrollmentByExamNumber) {
    const absenceInfo = absenceMap.get(examNumber) ?? { count: 0, lastDate: null };
    const scoreInfo = scoreMap.get(examNumber);
    const avgScore =
      scoreInfo && scoreInfo.count > 0
        ? Math.round((scoreInfo.sum / scoreInfo.count) * 10) / 10
        : null;
    const absenceCount = absenceInfo.count;

    let riskLevel: RiskLevel | null = null;
    if (absenceCount >= 5) riskLevel = "DANGER";
    else if (absenceCount >= 3) riskLevel = "WARNING";
    else if (absenceCount >= 1 && (avgScore === null || avgScore < 60)) riskLevel = "CAUTION";

    if (!riskLevel) continue;

    const item: RiskStudent = {
      examNumber,
      name: enrollment.student.name,
      mobile: enrollment.student.phone ?? null,
      cohortId: enrollment.cohortId ?? null,
      cohortName: enrollment.cohort?.name ?? null,
      absenceCount,
      lastAbsenceDate: absenceInfo.lastDate
        ? absenceInfo.lastDate.toISOString()
        : null,
      avgScore,
      riskLevel,
    };

    if (riskLevel === "DANGER") danger.push(item);
    else if (riskLevel === "WARNING") warning.push(item);
    else caution.push(item);
  }

  danger.sort((a, b) => b.absenceCount - a.absenceCount);
  warning.sort((a, b) => b.absenceCount - a.absenceCount);
  caution.sort((a, b) => b.absenceCount - a.absenceCount);

  const allRisk = [...danger, ...warning, ...caution];

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
            {currentMonthLabel} 기준 · 활성 종합반 수강생 {totalActive}명 대상
          </p>
        </div>

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

      {/* 요약 카드 */}
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-[24px] border border-ink/10 bg-white p-5">
          <p className="text-xs font-medium text-slate">전체 활성</p>
          <p className="mt-1 text-2xl font-bold text-ink">{totalActive}명</p>
        </div>
        <div className="rounded-[24px] border border-red-200 bg-red-50 p-5">
          <p className="text-xs font-medium text-red-600">위험 (5회 이상)</p>
          <p className="mt-1 text-2xl font-bold text-red-700">{danger.length}명</p>
        </div>
        <div className="rounded-[24px] border border-amber-200 bg-amber-50 p-5">
          <p className="text-xs font-medium text-amber-600">경고 (3-4회)</p>
          <p className="mt-1 text-2xl font-bold text-amber-700">{warning.length}명</p>
        </div>
        <div className="rounded-[24px] border border-sky-200 bg-sky-50 p-5">
          <p className="text-xs font-medium text-sky-600">주의 (1-2회 + 저성적)</p>
          <p className="mt-1 text-2xl font-bold text-sky-700">{caution.length}명</p>
        </div>
      </div>

      {allRisk.length === 0 ? (
        <div className="mt-8 rounded-[28px] border border-dashed border-ink/10 p-12 text-center">
          <p className="text-sm font-medium text-ink">위험 학생 없음</p>
          <p className="mt-1 text-xs text-slate">
            {currentMonthLabel} 기준 출결 위험 수강생이 없습니다.
          </p>
        </div>
      ) : (
        <div className="mt-8 space-y-8">
          {(
            [
              { level: "DANGER" as RiskLevel, students: danger },
              { level: "WARNING" as RiskLevel, students: warning },
              { level: "CAUTION" as RiskLevel, students: caution },
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
                        <th className="px-5 py-3 font-semibold">이름 / 학번</th>
                        <th className="px-5 py-3 font-semibold">기수</th>
                        <th className="px-5 py-3 font-semibold">결석 횟수</th>
                        <th className="px-5 py-3 font-semibold">마지막 결석일</th>
                        <th className="px-5 py-3 font-semibold">이번달 평균</th>
                        <th className="px-5 py-3 font-semibold">위험도</th>
                        <th className="px-5 py-3 font-semibold">알림</th>
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
                              <span className="text-sm">{s.cohortName}</span>
                            ) : (
                              <span className="text-slate">-</span>
                            )}
                          </td>
                          <td className="px-5 py-4">
                            <span
                              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cfg.badge}`}
                            >
                              {s.absenceCount}회
                            </span>
                          </td>
                          <td className="px-5 py-4 text-slate">
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
                              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${cfg.badge}`}
                            >
                              <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
                              {cfg.label}
                            </span>
                          </td>
                          <td className="px-5 py-4">
                            <Link
                              href={`/admin/notifications/send?examNumber=${s.examNumber}`}
                              className="inline-flex items-center rounded-full border border-ink/10 px-3 py-1.5 text-xs font-medium text-slate transition hover:border-forest/30 hover:text-forest"
                            >
                              알림 발송
                            </Link>
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
