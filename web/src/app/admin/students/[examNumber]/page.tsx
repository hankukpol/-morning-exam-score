import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AdminRole } from "@prisma/client";
import { requireAdminContext, roleAtLeast } from "@/lib/auth";
import { getStudentHistory } from "@/lib/students/service";
import { getStudentCumulativeAnalysis, getStudentDetailAnalysis, getStudentCounselingBriefing } from "@/lib/analytics/analysis";
import { getCounselingProfile } from "@/lib/counseling/service";
import { getStudentTimeline } from "@/lib/students/timeline";
import { StudentScoreHistoryManager } from "@/components/students/student-score-history-manager";
import { StudentCumulativeAnalysis } from "@/components/students/student-cumulative-analysis";
import { StudentTimeline } from "@/components/students/student-timeline";
import { CounselingPanel } from "@/components/counseling/counseling-panel";
import {
  StudentEnrollmentsPanel,
  type StudentEnrollmentRow,
} from "@/components/students/student-enrollments-panel";
import {
  StudentPaymentHistory,
  type PaymentHistoryRow,
} from "./student-payment-history";
import { StudentScoreChart, type ScoreChartPoint } from "./student-score-chart";
import { getPrisma } from "@/lib/prisma";
import { EXAM_TYPE_SUBJECTS, EXAM_TYPE_LABEL, SUBJECT_LABEL } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import { BarComparisonChart, RadarComparisonChart, TrendLineChart } from "@/components/analytics/charts";
import { SubjectScoreHeatmap } from "@/components/analytics/subject-score-heatmap";
import { CounselingBriefingCard } from "@/components/students/counseling-briefing-card";
import { AbsenceRiskBanner } from "@/components/students/absence-risk-banner";
import { StudentAttendanceCalendar } from "@/components/students/student-attendance-calendar";
import { ConsentToggle } from "./consent-toggle";

export const dynamic = "force-dynamic";

const TABS = [
  "history",
  "score-chart",
  "cumulative",
  "analysis",
  "timeline",
  "counseling",
  "enrollments",
  "payments",
] as const;
type Tab = (typeof TABS)[number];

const TAB_LABELS: Record<Tab, string> = {
  history: "성적 이력",
  "score-chart": "성적 차트",
  cumulative: "누적 분석",
  analysis: "기간별 분석",
  timeline: "타임라인",
  counseling: "면담",
  enrollments: "수업",
  payments: "수납",
};

type PageProps = {
  params: { examNumber: string };
  searchParams?: Record<string, string | string[] | undefined>;
};

function readParam(searchParams: PageProps["searchParams"], key: string) {
  const value = searchParams?.[key];
  return Array.isArray(value) ? value[0] : value;
}

export default async function StudentHubPage({ params, searchParams }: PageProps) {
  const rawTab = readParam(searchParams, "tab");
  const tab: Tab = TABS.includes(rawTab as Tab) ? (rawTab as Tab) : "history";

  const [context, student] = await Promise.all([
    requireAdminContext(AdminRole.VIEWER),
    getStudentHistory(params.examNumber),
  ]);
  if (!student) notFound();
  const canEdit = roleAtLeast(context.adminUser.role, AdminRole.TEACHER);

  let cumulativeData = null;
  let analysisData = null;
  let timelineData = null;
  let counselingProfile = null;
  let briefingData = null;
  let studentEnrollments: StudentEnrollmentRow[] | null = null;
  let studentPayments: PaymentHistoryRow[] | null = null;
  let scoreChartPoints: ScoreChartPoint[] | null = null;

  if (tab === "score-chart") {
    // student.scores는 이미 로드됨 — AttendType이 ABSENT이 아닌 것만 차트에 표시
    scoreChartPoints = student.scores
      .filter((s) => s.attendType !== "ABSENT" && s.finalScore !== null)
      .map((s) => ({
        sessionId: s.session.id,
        week: s.session.week,
        subject: s.session.subject,
        subjectLabel:
          (
            {
              CONSTITUTIONAL_LAW: "헌법",
              CRIMINAL_LAW: "형법",
              CRIMINAL_PROCEDURE: "형소법",
              POLICE_SCIENCE: "경찰학",
              CRIMINOLOGY: "범죄학",
              CUMULATIVE: "누적",
            } as Record<string, string>
          )[s.session.subject] ?? s.session.subject,
        examDate: s.session.examDate.toISOString(),
        finalScore: s.finalScore,
      }));
  } else if (tab === "cumulative") {
    cumulativeData = await getStudentCumulativeAnalysis(params.examNumber);
  } else if (tab === "analysis") {
    const periodId = Number(readParam(searchParams, "periodId")) || undefined;
    const recent = Number(readParam(searchParams, "recent")) || undefined;
    analysisData = await getStudentDetailAnalysis({ examNumber: params.examNumber, periodId, recent });
  } else if (tab === "timeline") {
    if (!canEdit) redirect(`/admin/students/${params.examNumber}?tab=history`);
    timelineData = await getStudentTimeline({ examNumber: params.examNumber });
  } else if (tab === "counseling") {
    if (!canEdit) redirect(`/admin/students/${params.examNumber}?tab=history`);
    [counselingProfile, briefingData] = await Promise.all([
      getCounselingProfile(params.examNumber),
      getStudentCounselingBriefing(params.examNumber),
    ]);
  } else if (tab === "enrollments") {
    const rows = await getPrisma().courseEnrollment.findMany({
      where: { examNumber: params.examNumber },
      include: {
        cohort: { select: { name: true, examCategory: true } },
        product: { select: { name: true } },
        specialLecture: { select: { name: true } },
        staff: { select: { name: true } },
        leaveRecords: { orderBy: { leaveDate: "desc" } },
      },
      orderBy: { createdAt: "desc" },
    });
    studentEnrollments = rows.map((e) => ({
      id: e.id,
      courseType: e.courseType,
      startDate: e.startDate.toISOString(),
      endDate: e.endDate ? e.endDate.toISOString() : null,
      regularFee: e.regularFee,
      discountAmount: e.discountAmount,
      finalFee: e.finalFee,
      status: e.status,
      isRe: e.isRe,
      createdAt: e.createdAt.toISOString(),
      cohort: e.cohort
        ? { name: e.cohort.name, examCategory: e.cohort.examCategory as string }
        : null,
      product: e.product,
      specialLecture: e.specialLecture,
      staff: e.staff,
      leaveRecords: e.leaveRecords.map((l) => ({
        id: l.id,
        leaveDate: l.leaveDate.toISOString(),
        returnDate: l.returnDate ? l.returnDate.toISOString() : null,
        reason: l.reason,
      })),
    }));
  } else if (tab === "payments") {
    const rows = await getPrisma().payment.findMany({
      where: { examNumber: params.examNumber },
      include: {
        items: true,
        processor: { select: { name: true } },
        refunds: { select: { amount: true, refundType: true, processedAt: true } },
      },
      orderBy: { processedAt: "desc" },
    });
    studentPayments = rows.map((p) => ({
      id: p.id,
      category: p.category,
      method: p.method,
      status: p.status,
      grossAmount: p.grossAmount,
      discountAmount: p.discountAmount,
      couponAmount: p.couponAmount,
      pointAmount: p.pointAmount,
      netAmount: p.netAmount,
      note: p.note,
      processedAt: p.processedAt.toISOString(),
      processor: p.processor,
      items: p.items.map((item) => ({
        id: item.id,
        itemName: item.itemName,
        itemType: item.itemType,
        amount: item.amount,
        quantity: item.quantity,
      })),
      refunds: p.refunds.map((r) => ({
        amount: r.amount,
        refundType: r.refundType as string,
        processedAt: r.processedAt.toISOString(),
      })),
    }));
  }

  const canViewPayments = roleAtLeast(context.adminUser.role, AdminRole.COUNSELOR);
  const visibleTabs: Tab[] = [
    "history",
    "score-chart",
    "cumulative",
    "analysis",
    ...(canEdit ? (["timeline", "counseling"] as Tab[]) : []),
    ...(canViewPayments ? (["enrollments", "payments"] as Tab[]) : []),
  ];

  return (
    <div className="p-8 sm:p-10">
      {/* 헤더 */}
      <div>
        <Link href="/admin/students" className="text-sm text-slate transition hover:text-ember">
          ← 수강생 목록
        </Link>
        <h1 className="mt-3 text-3xl font-semibold">
          {student.name}
          <span className="ml-3 text-xl font-normal text-slate">{student.examNumber}</span>
        </h1>
        <p className="mt-2 text-sm text-slate">
          {EXAM_TYPE_LABEL[student.examType]}
          {student.className ? ` · ${student.className}반` : ""}
          {student.generation ? ` · ${student.generation}기` : ""}
          {!student.isActive && (
            <span className="ml-2 rounded-full border border-ink/10 bg-mist px-2 py-0.5 text-xs font-semibold">
              비활성
            </span>
          )}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href={`/admin/students/${params.examNumber}/score-report`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full border border-forest/20 px-3 py-1.5 text-xs font-semibold text-forest transition hover:border-forest/50"
          >
            성적통지표
          </Link>
          <Link
            href={`/admin/students/${params.examNumber}/documents`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 px-3 py-1.5 text-xs font-semibold text-slate transition hover:border-ink/30"
          >
            공식 서류
          </Link>
        </div>
      </div>

      {/* 탭 */}
      <div className="mt-8 flex gap-1 border-b border-ink/10">
        {visibleTabs.map((t) => (
          <Link
            key={t}
            href={`/admin/students/${params.examNumber}?tab=${t}`}
            className={`rounded-t-2xl px-5 py-2.5 text-sm font-semibold transition ${
              tab === t
                ? "-mb-px border border-b-white border-ink/10 bg-white text-ink"
                : "text-slate hover:text-ink"
            }`}
          >
            {TAB_LABELS[t]}
          </Link>
        ))}
      </div>

      {/* 탭 내용 */}
      <div className="mt-6">
        {/* 성적 이력 */}
        {tab === "history" && (
          <div className="space-y-6">
            <AbsenceRiskBanner
              scores={student.scores.map((score) => ({
                attendType: score.attendType,
                session: { examDate: score.session.examDate.toISOString() },
              }))}
            />
            <StudentAttendanceCalendar
              scores={student.scores.map((score) => ({
                attendType: score.attendType,
                session: {
                  examDate: score.session.examDate.toISOString(),
                  subject: score.session.subject,
                  week: score.session.week,
                  finalScore: score.finalScore,
                },
              }))}
            />
            {/* 개인정보 동의 현황 */}
            <section className="rounded-[28px] border border-ink/10 bg-white p-6">
              <h2 className="text-base font-semibold text-ink">개인정보 동의 현황</h2>
              <div className="mt-4 space-y-4">
                {/* 필수 동의 */}
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-ink">개인정보 수집·이용 동의</p>
                    <p className="mt-0.5 text-xs text-slate">필수 동의</p>
                  </div>
                  <div className="text-right">
                    {student.registeredAt ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-forest/10 px-3 py-1 text-xs font-semibold text-forest">
                        ✓ 동의 완료 ({formatDate(student.registeredAt)})
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
                        ⚠ 미동의 (등록 시 서명 필요)
                      </span>
                    )}
                  </div>
                </div>

                {/* 마케팅 SMS 동의 */}
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-ink">마케팅 SMS 수신 동의</p>
                    <p className="mt-0.5 text-xs text-slate">선택 동의</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {student.notificationConsent ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-forest/10 px-3 py-1 text-xs font-semibold text-forest">
                        ✓ 동의{student.consentedAt ? ` (${formatDate(student.consentedAt)})` : ""}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
                        ☐ 미동의
                      </span>
                    )}
                    {canEdit && (
                      <ConsentToggle
                        examNumber={student.examNumber}
                        currentConsent={student.notificationConsent}
                      />
                    )}
                  </div>
                </div>
              </div>
            </section>

            <StudentScoreHistoryManager
              canEdit={canEdit}
              initialStudent={{
                examNumber: student.examNumber,
                name: student.name,
                className: student.className,
                generation: student.generation,
                examType: student.examType,
                currentStatus: student.currentStatus,
                scores: student.scores.map((score) => ({
                  id: score.id,
                  rawScore: score.rawScore,
                  oxScore: score.oxScore,
                  finalScore: score.finalScore,
                  attendType: score.attendType,
                  note: score.note,
                  sourceType: score.sourceType,
                  session: {
                    id: score.session.id,
                    week: score.session.week,
                    subject: score.session.subject,
                    examDate: score.session.examDate.toISOString(),
                    period: { name: score.session.period.name },
                  },
                })),
              }}
            />
          </div>
        )}

        {/* 누적 분석 */}
        {tab === "cumulative" &&
          (cumulativeData ? (
            <StudentCumulativeAnalysis data={cumulativeData} />
          ) : (
            <div className="rounded-[28px] border border-dashed border-ink/10 p-8 text-center text-sm text-slate">
              아직 성적 데이터가 없습니다.
            </div>
          ))}

        {/* 기간별 분석 */}
        {tab === "analysis" &&
          (!analysisData ? (
            <div className="rounded-[28px] border border-dashed border-ink/10 p-8 text-center text-sm text-slate">
              분석할 성적이 없습니다.
            </div>
          ) : (
            <div className="space-y-6">
              <form className="flex flex-wrap gap-3 rounded-[28px] border border-ink/10 bg-mist p-6">
                <input type="hidden" name="tab" value="analysis" />
                <select
                  name="periodId"
                  defaultValue={
                    analysisData.selectedPeriod?.id ? String(analysisData.selectedPeriod.id) : ""
                  }
                  className="rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
                >
                  {analysisData.availablePeriods.map((period) => (
                    <option key={period.id} value={period.id}>
                      {period.name}
                    </option>
                  ))}
                </select>
                <select
                  name="recent"
                  defaultValue={analysisData.recentCount ? String(analysisData.recentCount) : ""}
                  className="rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
                >
                  <option value="">전체 회차</option>
                  <option value="5">최근 5회</option>
                  <option value="10">최근 10회</option>
                  <option value="20">최근 20회</option>
                </select>
                <button
                  type="submit"
                  className="inline-flex items-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest"
                >
                  적용
                </button>
              </form>

              {analysisData.selectedPeriod && (
                <>
                  <div className="grid gap-6 xl:grid-cols-2">
                    <section className="rounded-[28px] border border-ink/10 bg-white p-6">
                      <h2 className="text-xl font-semibold">과목별 레이더</h2>
                      <div className="mt-4">
                        <RadarComparisonChart data={analysisData.radarData ?? []} />
                      </div>
                    </section>
                    <section className="rounded-[28px] border border-ink/10 bg-white p-6">
                      <h2 className="text-xl font-semibold">과목 평균 비교</h2>
                      <div className="mt-4">
                        <BarComparisonChart
                          data={analysisData.subjectSummary.map((row) => ({
                            subject: row.subject,
                            studentAverage: row.studentAverage ?? 0,
                            cohortAverage: row.cohortAverage ?? 0,
                            top10Average: row.top10Average ?? 0,
                          }))}
                          xKey="subject"
                          bars={[
                            { dataKey: "studentAverage", color: "#EA580C", name: "개인 평균" },
                            { dataKey: "cohortAverage", color: "#2563EB", name: "전체 평균" },
                            { dataKey: "top10Average", color: "#0F766E", name: "상위 10%" },
                          ]}
                        />
                      </div>
                    </section>
                  </div>

                  <section className="rounded-[28px] border border-ink/10 bg-white p-6">
                    <h2 className="text-xl font-semibold">회차별 추이</h2>
                    <div className="mt-4">
                      <TrendLineChart
                        data={analysisData.trendData.map((row) => ({
                          label: row.label,
                          studentScore: row.studentScore,
                          cohortAverage: row.cohortAverage,
                          top10Average: row.top10Average,
                          top30Average: row.top30Average,
                        }))}
                        xKey="label"
                        lines={[
                          { dataKey: "studentScore", color: "#EA580C", name: "개인 점수" },
                          { dataKey: "cohortAverage", color: "#2563EB", name: "전체 평균" },
                          { dataKey: "top10Average", color: "#0F766E", name: "상위 10%" },
                          { dataKey: "top30Average", color: "#7C3AED", name: "상위 30%" },
                        ]}
                      />
                    </div>
                  </section>

                  <section className="rounded-[28px] border border-ink/10 bg-white p-6">
                    <h2 className="text-xl font-semibold">과목별 비교 테이블</h2>
                    <div className="mt-6 overflow-x-auto rounded-[24px] border border-ink/10">
                      <table className="min-w-full divide-y divide-ink/10 text-sm">
                        <thead className="bg-mist/80 text-left">
                          <tr>
                            <th className="px-4 py-3 font-semibold">과목</th>
                            <th className="px-4 py-3 font-semibold">개인 평균</th>
                            <th className="px-4 py-3 font-semibold">목표</th>
                            <th className="px-4 py-3 font-semibold">전체 평균</th>
                            <th className="px-4 py-3 font-semibold">최고점</th>
                            <th className="px-4 py-3 font-semibold">상위 10%</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-ink/10">
                          {analysisData.subjectSummary.map((row) => (
                            <tr key={row.subject}>
                              <td className="px-4 py-3">{SUBJECT_LABEL[row.subject]}</td>
                              <td className="px-4 py-3">{row.studentAverage ?? "-"}</td>
                              <td className="px-4 py-3">{row.targetScore ?? "-"}</td>
                              <td className="px-4 py-3">{row.cohortAverage ?? "-"}</td>
                              <td className="px-4 py-3">{row.highestScore ?? "-"}</td>
                              <td className="px-4 py-3">{row.top10Average ?? "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>

                  <SubjectScoreHeatmap data={analysisData.subjectHeatmap} />

                  {analysisData.monthlyBreakdown.length > 0 && (
                    <section className="rounded-[28px] border border-ink/10 bg-white p-6">
                      <h2 className="text-xl font-semibold">월별 성적 요약</h2>
                      <div className="mt-6 overflow-x-auto rounded-[24px] border border-ink/10">
                        <table className="min-w-full divide-y divide-ink/10 text-sm">
                          <thead className="bg-mist/80 text-left">
                            <tr>
                              <th className="px-4 py-3 font-semibold">월</th>
                              <th className="px-4 py-3 font-semibold">응시/전체</th>
                              <th className="px-4 py-3 font-semibold">개인 평균</th>
                              <th className="px-4 py-3 font-semibold">전체 평균</th>
                              <th className="px-4 py-3 font-semibold">석차(%)</th>
                              <th className="px-4 py-3 font-semibold">무단결시</th>
                              <th className="px-4 py-3 font-semibold">전월 대비</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-ink/10">
                            {analysisData.monthlyBreakdown.map((row) => (
                              <tr key={`${row.year}-${row.month}`}>
                                <td className="px-4 py-3 font-medium">{row.monthLabel}</td>
                                <td className="px-4 py-3">
                                  {row.attendedCount}/{row.sessionCount}
                                </td>
                                <td className="px-4 py-3">
                                  {row.studentAverage !== null ? row.studentAverage.toFixed(1) : "-"}
                                </td>
                                <td className="px-4 py-3">
                                  {row.cohortAverage !== null ? row.cohortAverage.toFixed(1) : "-"}
                                </td>
                                <td className="px-4 py-3">
                                  {row.studentRank !== null ? `상위 ${row.studentRank.toFixed(1)}%` : "-"}
                                </td>
                                <td className="px-4 py-3">{row.absentCount}회</td>
                                <td className="px-4 py-3">
                                  {row.changeFromPrevMonth === null ? (
                                    "-"
                                  ) : (
                                    <span
                                      className={
                                        row.changeFromPrevMonth > 0
                                          ? "font-semibold text-forest"
                                          : row.changeFromPrevMonth < 0
                                            ? "font-semibold text-ember"
                                            : "text-slate"
                                      }
                                    >
                                      {row.changeFromPrevMonth > 0 ? "+" : ""}
                                      {row.changeFromPrevMonth.toFixed(1)}
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  )}

                  <section className="rounded-[28px] border border-ink/10 bg-white p-6">
                    <h2 className="text-xl font-semibold">오답 상위 문항</h2>
                    <div className="mt-6 overflow-x-auto rounded-[24px] border border-ink/10">
                      <table className="min-w-full divide-y divide-ink/10 text-sm">
                        <thead className="bg-mist/80 text-left">
                          <tr>
                            <th className="px-4 py-3 font-semibold">시험일</th>
                            <th className="px-4 py-3 font-semibold">과목</th>
                            <th className="px-4 py-3 font-semibold">문항</th>
                            <th className="px-4 py-3 font-semibold">정답</th>
                            <th className="px-4 py-3 font-semibold">학생 답안</th>
                            <th className="px-4 py-3 font-semibold">정답률</th>
                            <th className="px-4 py-3 font-semibold">난이도</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-ink/10">
                          {analysisData.wrongQuestionRows.length === 0 ? (
                            <tr>
                              <td colSpan={7} className="px-4 py-8 text-center text-slate">
                                오답 문항 데이터가 없습니다.
                              </td>
                            </tr>
                          ) : null}
                          {analysisData.wrongQuestionRows.map((row) => (
                            <tr key={row.id}>
                              <td className="px-4 py-3">{formatDate(row.examDate)}</td>
                              <td className="px-4 py-3">{SUBJECT_LABEL[row.subject]}</td>
                              <td className="px-4 py-3">{row.questionNo}</td>
                              <td className="px-4 py-3">{row.correctAnswer}</td>
                              <td className="px-4 py-3">{row.answer}</td>
                              <td className="px-4 py-3">
                                {row.correctRate !== null && row.correctRate !== undefined
                                  ? `${row.correctRate.toFixed(1)}%`
                                  : "-"}
                              </td>
                              <td className="px-4 py-3">{row.difficulty ?? "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </>
              )}
            </div>
          ))}

        {/* 면담 */}
        {tab === "timeline" && timelineData && (
          <StudentTimeline examNumber={params.examNumber} initialData={timelineData} />
        )}

        {tab === "counseling" && counselingProfile && (
          <div className="space-y-6">
            {briefingData && <CounselingBriefingCard briefing={briefingData} />}
            <CounselingPanel
              examNumber={counselingProfile.student.examNumber}
              defaultCounselorName={context.adminUser.name}
              targetScores={counselingProfile.student.targetScores}
              subjects={EXAM_TYPE_SUBJECTS[counselingProfile.student.examType]}
              records={counselingProfile.counselingRecords.map((record) => ({
                id: record.id,
                examNumber: record.examNumber,
                counselorName: record.counselorName,
                content: record.content,
                recommendation: record.recommendation,
                counseledAt: record.counseledAt.toISOString(),
                nextSchedule: record.nextSchedule ? record.nextSchedule.toISOString() : null,
              }))}
            />
          </div>
        )}

        {/* 수업 탭 */}
        {tab === "enrollments" && (
          <StudentEnrollmentsPanel
            examNumber={params.examNumber}
            enrollments={studentEnrollments ?? []}
          />
        )}

        {/* 성적 차트 탭 */}
        {tab === "score-chart" && (
          <StudentScoreChart scores={scoreChartPoints ?? []} />
        )}

        {/* 수납 탭 */}
        {tab === "payments" && (
          <StudentPaymentHistory
            examNumber={params.examNumber}
            payments={studentPayments ?? []}
          />
        )}
      </div>
    </div>
  );
}
