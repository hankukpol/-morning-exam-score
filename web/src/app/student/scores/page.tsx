import Link from "next/link";
import { redirect } from "next/navigation";
import { StudentLookupForm } from "@/components/student-portal/student-lookup-form";
import { formatScore } from "@/lib/analytics/presentation";
import { ATTEND_TYPE_LABEL, SCORE_SOURCE_LABEL, SUBJECT_LABEL } from "@/lib/constants";
import { hasDatabaseConfig } from "@/lib/env";
import { formatDateWithWeekday } from "@/lib/format";
import { getStudentPortalViewer } from "@/lib/student-portal/service";
import { getStudentPortalScorePageData } from "@/student-portal-api-data";
import { ScoreChart } from "./score-chart";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

function readPeriodId(searchParams: PageProps["searchParams"]) {
  const value = searchParams?.periodId;
  const raw = Array.isArray(value) ? value[0] : value;

  if (!raw) {
    return undefined;
  }

  const periodId = Number(raw);
  return Number.isInteger(periodId) && periodId > 0 ? periodId : undefined;
}

function scoreColorClass(score: number | null | undefined): string {
  if (score === null || score === undefined) return "text-slate";
  if (score < 60) return "text-red-600 font-semibold";
  if (score < 80) return "text-amber-600 font-semibold";
  return "text-forest font-semibold";
}

function scoreBgClass(score: number | null | undefined): string {
  if (score === null || score === undefined) return "bg-mist";
  if (score < 60) return "bg-red-50";
  if (score < 80) return "bg-amber-50";
  return "bg-green-50";
}

export default async function StudentScoresPage({ searchParams }: PageProps) {
  if (!hasDatabaseConfig()) {
    return (
      <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl space-y-6">
          <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
            <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
              Student Scores Unavailable
            </div>
            <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
              성적 카드는 DB 연결 후 사용할 수 있습니다.
            </h1>
            <p className="mt-5 text-sm leading-8 text-slate sm:text-base">
              현재 환경에는 학생 성적 데이터를 불러올 데이터베이스가 연결되어 있지 않습니다.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/student"
                className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
              >
                학생 포털로 돌아가기
              </Link>
            </div>
          </section>
        </div>
      </main>
    );
  }

  const viewer = await getStudentPortalViewer();

  if (!viewer) {
    return (
      <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl space-y-6">
          <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
            <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
              Student Scores Login
            </div>
            <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
              성적 카드는 로그인 후 확인할 수 있습니다.
            </h1>
            <p className="mt-5 text-sm leading-8 text-slate sm:text-base">
              학생 포털에 로그인하면 기간별 성적 카드와 시험 메모를 함께 볼 수 있습니다.
            </p>
          </section>

          <StudentLookupForm redirectPath="/student/scores" />
        </div>
      </main>
    );
  }

  const requestedPeriodId = readPeriodId(searchParams);
  const data = await getStudentPortalScorePageData({
    examNumber: viewer.examNumber,
    periodId: requestedPeriodId,
  });

  if (!data) {
    return null;
  }

  if (requestedPeriodId !== undefined && !data.periods.some((period) => period.id === requestedPeriodId)) {
    redirect("/student/scores");
  }

  return (
    <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-6">

        {/* 헤더 + KPI 요약 카드 */}
        <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
                Student Scores
              </div>
              <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
                {data.student.name}의 성적 카드
              </h1>
              <p className="mt-5 text-sm leading-8 text-slate sm:text-base">
                기간별 시험 결과를 카드 단위로 확인하고, 출결 상태와 입력 방식까지 함께 볼 수 있습니다.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/student"
                className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
              >
                포털로 돌아가기
              </Link>
              <Link
                href="/student/wrong-notes"
                className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
              >
                오답 노트 보기
              </Link>
            </div>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
              <p className="text-sm text-slate">조회 기간</p>
              <p className="mt-3 text-xl font-semibold">{data.selectedPeriod?.name ?? "기간 미선택"}</p>
            </article>
            <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
              <p className="text-sm text-slate">성적 카드 수</p>
              <p className="mt-3 text-xl font-semibold">{data.summary.totalRows}건</p>
            </article>
            <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
              <p className="text-sm text-slate">평균 점수</p>
              <p className="mt-3 text-xl font-semibold">{formatScore(data.summary.averageScore)}</p>
            </article>
            <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
              <p className="text-sm text-slate">최근 시험일</p>
              <p className="mt-3 text-xl font-semibold">
                {data.summary.latestExamDate ? formatDateWithWeekday(data.summary.latestExamDate) : "-"}
              </p>
            </article>
          </div>
        </section>

        {/* 기간 선택 폼 */}
        <form className="grid gap-4 rounded-[28px] border border-ink/10 bg-white p-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:p-6">
          <div>
            <label className="mb-2 block text-sm font-medium">조회 기간</label>
            <select
              name="periodId"
              defaultValue={data.selectedPeriod?.id ? String(data.selectedPeriod.id) : ""}
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
            >
              {data.periods.map((period) => (
                <option key={period.id} value={period.id}>
                  {period.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              className="inline-flex min-h-12 items-center justify-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest"
            >
              기간 적용
            </button>
          </div>
        </form>

        {/* 최근 시험 요약 카드 */}
        {data.latestSummary ? (
          <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold">최근 시험 요약</h2>
                <p className="mt-1 text-xs text-slate">
                  {data.latestSummary.dateKey}
                  {data.latestSummary.week != null ? ` · ${data.latestSummary.week}주차` : ""}
                </p>
              </div>
              <div className="flex gap-4 text-sm">
                <div className="rounded-[20px] border border-ink/10 bg-mist px-4 py-2 text-center">
                  <div className="text-xs text-slate">합산</div>
                  <div className="mt-1 text-base font-bold text-ink">
                    {formatScore(data.latestSummary.totalScore)}
                  </div>
                </div>
                <div className="rounded-[20px] border border-ink/10 bg-mist px-4 py-2 text-center">
                  <div className="text-xs text-slate">평균</div>
                  <div className="mt-1 text-base font-bold text-ink">
                    {formatScore(data.latestSummary.avgScore)}
                  </div>
                </div>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {data.latestSummary.subjects.map((item) => (
                <div
                  key={item.subject}
                  className={`rounded-[20px] border border-ink/10 px-4 py-3 ${scoreBgClass(item.finalScore)}`}
                >
                  <div className="text-xs text-slate">{SUBJECT_LABEL[item.subject]}</div>
                  <div className={`mt-2 text-xl ${scoreColorClass(item.finalScore)}`}>
                    {formatScore(item.finalScore)}
                  </div>
                  {item.rank ? (
                    <div className="mt-1 text-xs text-slate">
                      석차 {item.rank.rank}위 / {item.rank.total}명
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-slate">
              색상: <span className="text-forest font-medium">초록 80+</span>
              {" · "}
              <span className="text-amber-600 font-medium">노랑 60~79</span>
              {" · "}
              <span className="text-red-600 font-medium">빨강 60미만</span>
            </p>
          </section>
        ) : null}

        {/* 성적 추이 차트 */}
        {data.trendData.length > 1 ? (
          <ScoreChart data={data.trendData} />
        ) : null}

        {/* 과목별 성적 크로스 테이블 */}
        {data.subjectCrossTable.length > 0 && data.crossTableDates.length > 0 ? (
          <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
            <h2 className="mb-1 text-lg font-semibold">과목별 성적 추이표</h2>
            <p className="mb-4 text-xs text-slate">
              최근 {data.crossTableDates.length}회 시험 / 색상: 빨강 60미만 · 노랑 60~79 · 초록 80+
            </p>
            <div className="overflow-x-auto rounded-[24px] border border-ink/10">
              <table className="min-w-full divide-y divide-ink/10 text-sm">
                <thead className="bg-mist/80 text-left">
                  <tr>
                    <th className="sticky left-0 bg-mist/80 px-4 py-3 font-semibold">과목</th>
                    {data.crossTableDates.map((dateKey) => (
                      <th key={dateKey} className="whitespace-nowrap px-4 py-3 font-semibold text-slate">
                        {dateKey}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/10">
                  {data.subjectCrossTable.map((row) => (
                    <tr key={row.subject}>
                      <td className="sticky left-0 bg-white px-4 py-3 font-medium">
                        {SUBJECT_LABEL[row.subject]}
                      </td>
                      {row.scores.map((cell) => (
                        <td
                          key={cell.dateKey}
                          className={`px-4 py-3 text-center ${
                            cell.score === undefined
                              ? "text-slate/40"
                              : scoreColorClass(cell.score)
                          } ${cell.score !== undefined ? scoreBgClass(cell.score) : ""}`}
                        >
                          {cell.score === undefined ? "-" : formatScore(cell.score)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {/* 전체 성적 카드 목록 */}
        <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">전체 성적 카드</h2>
              <p className="mt-3 text-sm leading-7 text-slate">
                시험별 출결, 입력 방식, 최종 점수를 카드 단위로 정리했습니다.
              </p>
            </div>
          </div>

          {data.scoreRows.length === 0 ? (
            <div className="mt-6 rounded-[24px] border border-dashed border-ink/10 p-8 text-sm text-slate">
              선택한 기간에 표시할 성적 카드가 없습니다.
            </div>
          ) : (
            <div className="mt-6 space-y-4">
              {data.scoreRows.map((row) => (
                <article key={row.id} className="rounded-[24px] border border-ink/10 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex rounded-full border border-ink/10 bg-mist px-3 py-1 text-xs font-semibold text-slate">
                          {formatDateWithWeekday(row.session.examDate)}
                        </span>
                        <span className="inline-flex rounded-full border border-ink/10 bg-white px-3 py-1 text-xs font-semibold text-slate">
                          {row.session.week}주차
                        </span>
                      </div>
                      <h3 className="mt-4 text-xl font-semibold">{SUBJECT_LABEL[row.session.subject]}</h3>
                      <p className="mt-2 text-sm text-slate">
                        출결 {ATTEND_TYPE_LABEL[row.attendType]} / 입력 방식 {SCORE_SOURCE_LABEL[row.sourceType]}
                      </p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="rounded-[20px] border border-ink/10 bg-mist px-4 py-3 text-sm">
                        <div className="text-slate">원점수</div>
                        <div className="mt-2 text-lg font-semibold">{formatScore(row.rawScore)}</div>
                      </div>
                      <div className="rounded-[20px] border border-ink/10 bg-mist px-4 py-3 text-sm">
                        <div className="text-slate">OX 점수</div>
                        <div className="mt-2 text-lg font-semibold">{formatScore(row.oxScore)}</div>
                      </div>
                      <div className={`rounded-[20px] border border-ink/10 px-4 py-3 text-sm ${scoreBgClass(row.finalScore)}`}>
                        <div className="text-slate">최종 점수</div>
                        <div className={`mt-2 text-lg ${scoreColorClass(row.finalScore)}`}>{formatScore(row.finalScore)}</div>
                      </div>
                    </div>
                  </div>

                  {row.note ? (
                    <div className="mt-4 rounded-[20px] border border-ink/10 bg-white px-4 py-4 text-sm leading-7 text-slate">
                      메모: {row.note}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
