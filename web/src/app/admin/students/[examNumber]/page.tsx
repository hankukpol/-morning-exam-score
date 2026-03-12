import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AdminRole } from "@prisma/client";
import { requireAdminContext, roleAtLeast } from "@/lib/auth";
import { getStudentHistory } from "@/lib/students/service";
import { getStudentCumulativeAnalysis, getStudentDetailAnalysis } from "@/lib/analytics/analysis";
import { getCounselingProfile } from "@/lib/counseling/service";
import { StudentScoreHistoryManager } from "@/components/students/student-score-history-manager";
import { StudentCumulativeAnalysis } from "@/components/students/student-cumulative-analysis";
import { CounselingPanel } from "@/components/counseling/counseling-panel";
import { EXAM_TYPE_SUBJECTS, EXAM_TYPE_LABEL, SUBJECT_LABEL } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import { BarComparisonChart, RadarComparisonChart, TrendLineChart } from "@/components/analytics/charts";

export const dynamic = "force-dynamic";

const TABS = ["history", "cumulative", "analysis", "counseling"] as const;
type Tab = (typeof TABS)[number];

const TAB_LABELS: Record<Tab, string> = {
  history: "성적 이력",
  cumulative: "누적 분석",
  analysis: "기간별 분석",
  counseling: "면담",
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
  let counselingProfile = null;

  if (tab === "cumulative") {
    cumulativeData = await getStudentCumulativeAnalysis(params.examNumber);
  } else if (tab === "analysis") {
    const periodId = Number(readParam(searchParams, "periodId")) || undefined;
    analysisData = await getStudentDetailAnalysis({ examNumber: params.examNumber, periodId });
  } else if (tab === "counseling") {
    if (!canEdit) redirect(`/admin/students/${params.examNumber}?tab=history`);
    counselingProfile = await getCounselingProfile(params.examNumber);
  }

  const visibleTabs: Tab[] = canEdit
    ? ["history", "cumulative", "analysis", "counseling"]
    : ["history", "cumulative", "analysis"];

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
                <button
                  type="submit"
                  className="inline-flex items-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest"
                >
                  기간 변경
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
        {tab === "counseling" && counselingProfile && (
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
        )}
      </div>
    </div>
  );
}
