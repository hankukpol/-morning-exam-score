import Link from "next/link";
import { CourseType, Subject } from "@prisma/client";
import {
  BarComparisonChart,
  RadarComparisonChart,
  TrendLineChart,
} from "@/components/analytics/charts";
import { StudentLookupForm } from "@/components/student-portal/student-lookup-form";
import { WrongNoteSaveButton } from "@/components/student-portal/wrong-note-save-button";
import {
  STATUS_BADGE_CLASS,
  STATUS_LABEL,
} from "@/lib/analytics/presentation";
import { EXAM_TYPE_LABEL, SUBJECT_LABEL } from "@/lib/constants";
import { hasDatabaseConfig } from "@/lib/env";
import { formatDate, formatDateWithWeekday } from "@/lib/format";
import { getPrisma } from "@/lib/prisma";
import { getStudentPortalPageData } from "@/lib/student-portal/service";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

function readParam(searchParams: PageProps["searchParams"], key: string) {
  const value = searchParams?.[key];
  return Array.isArray(value) ? value[0] : value;
}

function formatScore(value: number | null | undefined) {
  return value === null || value === undefined
    ? "-"
    : value.toFixed(2).replace(/\.00$/, "");
}

function questionSummary(
  questionRows: Array<{ searchedStudentCorrect: boolean | null }>,
) {
  const total = questionRows.length;
  const correct = questionRows.filter((row) => row.searchedStudentCorrect === true).length;
  const wrong = questionRows.filter((row) => row.searchedStudentCorrect === false).length;
  const correctRate = total === 0 ? 0 : Math.round((correct / total) * 1000) / 10;

  return {
    total,
    correct,
    wrong,
    correctRate,
  };
}

export default async function StudentPortalPage({ searchParams }: PageProps) {
  if (!hasDatabaseConfig()) {
    return (
      <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl space-y-6">
          <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
            <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
              학생 포털 준비 중
            </div>
            <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
              학생 포털은 DB 연결 후 사용할 수 있습니다.
            </h1>
            <p className="mt-5 text-sm leading-8 text-slate sm:text-base">
              현재 환경에는 학생 성적과 공지 데이터를 불러올 데이터베이스가 연결되어 있지 않습니다.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/"
                className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
              >
                홈으로
              </Link>
            </div>
          </section>
        </div>
      </main>
    );
  }

  const data = await getStudentPortalPageData({
    periodId: Number(readParam(searchParams, "periodId") ?? 0) || undefined,
    date: readParam(searchParams, "date") ?? undefined,
    monthKey: readParam(searchParams, "monthKey") ?? undefined,
    subject: (readParam(searchParams, "subject") as Subject | undefined) ?? undefined,
  });

  if (!data) {
    return (
      <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl space-y-6">
          <section className="overflow-hidden rounded-[32px] border border-ink/10 bg-white shadow-panel">
            <div className="bg-hero-grid bg-[size:28px_28px] px-6 py-8 sm:px-8 sm:py-10">
              <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
                학생 포털
              </div>
              <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
                학생 포털에 로그인해 주세요.
              </h1>
              <p className="mt-5 max-w-3xl text-sm leading-8 text-slate sm:text-base">
                수험번호와 이름으로 로그인하면 성적, 출결, 공지, 사유서, 오답 노트를 한 곳에서 확인할 수 있습니다.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/student/notices"
                  className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
                >
                  공지사항 보기
                </Link>
                <Link
                  href="/"
                  className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
                >
                  홈으로
                </Link>
              </div>
            </div>
          </section>

          <StudentLookupForm />
        </div>
      </main>
    );
  }

  const activeEnrollment = await getPrisma().courseEnrollment.findFirst({
    where: {
      examNumber: data.student.examNumber,
      status: "ACTIVE",
    },
    orderBy: { createdAt: "desc" },
    include: {
      cohort: { select: { name: true } },
      product: { select: { name: true } },
      specialLecture: { select: { name: true } },
    },
  });

  function getEnrollmentCourseName(
    enrollment: typeof activeEnrollment,
  ): string {
    if (!enrollment) return "";
    if (enrollment.courseType === CourseType.SPECIAL_LECTURE) {
      return enrollment.specialLecture?.name ?? "특강";
    }
    return enrollment.cohort?.name ?? enrollment.product?.name ?? "종합반";
  }

  function computeDDay(endDate: Date | null): string {
    if (!endDate) return "";
    const now = new Date();
    const diff = Math.ceil(
      (endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
    );
    if (diff < 0) return "만료됨";
    if (diff === 0) return "D-Day";
    return `D-${diff}`;
  }

  const ENROLLMENT_STATUS_LABEL: Record<string, string> = {
    PENDING: "대기 중",
    ACTIVE: "수강 중",
    WAITING: "대기자",
    SUSPENDED: "휴원",
    COMPLETED: "수료",
    WITHDRAWN: "자퇴",
    CANCELLED: "취소",
  };

  const ENROLLMENT_STATUS_BADGE: Record<string, string> = {
    PENDING: "border-amber-200 bg-amber-50 text-amber-700",
    ACTIVE: "border-forest/20 bg-forest/10 text-forest",
    WAITING: "border-amber-200 bg-amber-50 text-amber-700",
    SUSPENDED: "border-slate/20 bg-slate/10 text-slate",
    COMPLETED: "border-ink/10 bg-mist text-ink",
    WITHDRAWN: "border-red-200 bg-red-50 text-red-700",
    CANCELLED: "border-red-200 bg-red-50 text-red-700",
  };

  const wrongNoteQuestionIds = new Set(data.wrongNoteQuestionIds);
  const classLabel = data.student.className ?? "반 정보 없음";
  const generationLabel = data.student.generation ? `${data.student.generation}기` : "기수 미지정";

  return (
    <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="overflow-hidden rounded-[32px] border border-ink/10 bg-white shadow-panel">
          <div className="bg-hero-grid bg-[size:28px_28px] px-6 py-8 sm:px-8 sm:py-10">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
                  학생 포털
                </div>
                <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
                  {data.student.name} ({data.student.examNumber})
                </h1>
                <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
                  {EXAM_TYPE_LABEL[data.student.examType]} / {classLabel} / {generationLabel}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <span
                  className={`inline-flex rounded-full border px-3 py-2 text-sm font-semibold ${STATUS_BADGE_CLASS[data.student.currentStatus]}`}
                >
                  {STATUS_LABEL[data.student.currentStatus]}
                </span>
                <span className="inline-flex rounded-full border border-ink/10 bg-white/70 px-3 py-2 text-sm font-semibold">
                  오답 노트 {data.wrongNoteCount}건
                </span>
              </div>
            </div>

            <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <article className="rounded-[24px] border border-ink/10 bg-white/75 p-4">
                <p className="text-sm text-slate">조회 기간</p>
                <p className="mt-3 text-xl font-semibold">
                  {data.selectedPeriod?.name ?? "기간 미선택"}
                </p>
              </article>
              <article className="rounded-[24px] border border-ink/10 bg-white/75 p-4">
                <p className="text-sm text-slate">선택 일자</p>
                <p className="mt-3 text-xl font-semibold">{data.selectedDate || "-"}</p>
              </article>
              <article className="rounded-[24px] border border-ink/10 bg-white/75 p-4">
                <p className="text-sm text-slate">선택 월</p>
                <p className="mt-3 text-xl font-semibold">
                  {data.selectedMonth
                    ? `${data.selectedMonth.year}년 ${data.selectedMonth.month}월`
                    : "-"}
                </p>
              </article>
              <article className="rounded-[24px] border border-ink/10 bg-white/75 p-4">
                <p className="text-sm text-slate">선택 과목</p>
                <p className="mt-3 text-xl font-semibold">
                  {data.selectedSubject ? SUBJECT_LABEL[data.selectedSubject] : "-"}
                </p>
              </article>
            </div>
          </div>
        </section>

        <StudentLookupForm
          currentStudent={{
            examNumber: data.student.examNumber,
            name: data.student.name,
            examType: data.student.examType,
          }}
        />

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Link
            href="/student/scores"
            className="rounded-[24px] border border-ink/10 bg-white px-5 py-4 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
          >
            성적 카드
          </Link>
          <Link
            href="/student/attendance"
            className="rounded-[24px] border border-ink/10 bg-white px-5 py-4 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
          >
            출결 현황
          </Link>
          <Link
            href="/student/notices"
            className="rounded-[24px] border border-ink/10 bg-white px-5 py-4 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
          >
            공지사항
          </Link>
          <Link
            href="/student/absence-notes"
            className="rounded-[24px] border border-ink/10 bg-white px-5 py-4 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
          >
            사유서
          </Link>
          <Link
            href="/student/points"
            className="rounded-[24px] border border-ink/10 bg-white px-5 py-4 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
          >
            포인트
          </Link>
          <Link
            href="/student/wrong-notes"
            className="rounded-[24px] border border-ink/10 bg-white px-5 py-4 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
          >
            오답 노트
          </Link>
        </section>

        <section className="rounded-[28px] border border-ink/10 bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-xl font-semibold">내 수강 정보</h2>
            <Link
              href="/student/enrollment"
              className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
            >
              상세 보기
            </Link>
          </div>

          {activeEnrollment ? (
            <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
                <p className="text-sm text-slate">강좌명</p>
                <p className="mt-3 text-base font-semibold leading-snug">
                  {getEnrollmentCourseName(activeEnrollment)}
                </p>
              </article>
              <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
                <p className="text-sm text-slate">수강 상태</p>
                <p className="mt-3">
                  <span
                    className={`inline-flex rounded-full border px-3 py-1 text-sm font-semibold ${ENROLLMENT_STATUS_BADGE[activeEnrollment.status] ?? "border-ink/10 bg-mist text-ink"}`}
                  >
                    {ENROLLMENT_STATUS_LABEL[activeEnrollment.status] ?? activeEnrollment.status}
                  </span>
                </p>
              </article>
              <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
                <p className="text-sm text-slate">수강 기간</p>
                <p className="mt-3 text-sm font-semibold">
                  {formatDateWithWeekday(activeEnrollment.startDate)}
                  {activeEnrollment.endDate
                    ? ` ~ ${formatDateWithWeekday(activeEnrollment.endDate)}`
                    : ""}
                </p>
              </article>
              <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
                <p className="text-sm text-slate">남은 기간</p>
                <p className="mt-3 text-xl font-semibold">
                  {activeEnrollment.endDate
                    ? computeDDay(activeEnrollment.endDate)
                    : "-"}
                </p>
              </article>
            </div>
          ) : (
            <div className="mt-4 rounded-[24px] border border-dashed border-ink/10 p-6 text-sm text-slate">
              현재 등록된 강좌가 없습니다.{" "}
              <span className="text-ink">문의: 053-241-0112</span>
            </div>
          )}
        </section>

        <form className="grid gap-4 rounded-[28px] border border-ink/10 bg-white p-5 sm:grid-cols-2 xl:grid-cols-5 sm:p-6">
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
          <div>
            <label className="mb-2 block text-sm font-medium">일자</label>
            <select
              name="date"
              defaultValue={data.selectedDate}
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
            >
              {data.dateOptions.map((date) => (
                <option key={date} value={date}>
                  {date}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">월</label>
            <select
              name="monthKey"
              defaultValue={data.selectedMonthKey}
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
            >
              {data.monthOptions.map((option) => (
                <option key={`${option.year}-${option.month}`} value={`${option.year}-${option.month}`}>
                  {option.year}년 {option.month}월
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">과목</label>
            <select
              name="subject"
              defaultValue={data.selectedSubject ?? ""}
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
            >
              {data.subjectOptions.map((subject) => (
                <option key={subject} value={subject}>
                  {SUBJECT_LABEL[subject]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              className="inline-flex w-full items-center justify-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest"
            >
              조회 적용
            </button>
          </div>
        </form>

        <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold">일자별 시험 분석</h2>
              <p className="mt-3 text-sm leading-7 text-slate">
                선택한 날짜의 과목별 비교표와 문항 분석을 확인할 수 있습니다.
              </p>
            </div>
          </div>

          {data.dailyAnalysis.length === 0 ? (
            <div className="mt-6 rounded-[24px] border border-dashed border-ink/10 p-8 text-sm text-slate">
              선택한 날짜에 표시할 시험 데이터가 없습니다.
            </div>
          ) : (
            <div className="mt-6 space-y-8">
              <div className="overflow-x-auto rounded-[24px] border border-ink/10">
                <table className="min-w-full divide-y divide-ink/10 text-sm">
                  <thead className="bg-mist/80 text-left">
                    <tr>
                      <th className="px-4 py-3 font-semibold">과목</th>
                      <th className="px-4 py-3 font-semibold">내 점수</th>
                      <th className="px-4 py-3 font-semibold">석차</th>
                      <th className="px-4 py-3 font-semibold">전체 평균</th>
                      <th className="px-4 py-3 font-semibold">상위 10%</th>
                      <th className="px-4 py-3 font-semibold">상위 30%</th>
                      <th className="px-4 py-3 font-semibold">최고점</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink/10">
                    {data.dailyAnalysis.map((session) => (
                      <tr key={session.sessionId}>
                        <td className="px-4 py-3">{SUBJECT_LABEL[session.subject]}</td>
                        <td className="px-4 py-3">{formatScore(session.searchedStudent?.score)}</td>
                        <td className="px-4 py-3">
                          {session.searchedStudent?.rank
                            ? `${session.searchedStudent.rank}/${session.participantCount}`
                            : "-"}
                        </td>
                        <td className="px-4 py-3">{formatScore(session.averageScore)}</td>
                        <td className="px-4 py-3">{formatScore(session.top10Average)}</td>
                        <td className="px-4 py-3">{formatScore(session.top30Average)}</td>
                        <td className="px-4 py-3">{formatScore(session.highestScore)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {data.dailyAnalysis.map((session) => {
                const summary = questionSummary(session.questionRows);

                return (
                  <article key={session.sessionId} className="space-y-6 rounded-[24px] border border-ink/10 p-4 sm:p-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <h3 className="text-xl font-semibold">{SUBJECT_LABEL[session.subject]}</h3>
                        <p className="mt-2 text-sm text-slate">
                          {formatDate(session.examDate)} / {session.week}주차 / 응시 {session.participantCount}명
                        </p>
                        {session.searchedStudent ? (
                          <p className="mt-2 text-sm text-slate">
                            내 점수 {formatScore(session.searchedStudent.score)} / 석차 {session.searchedStudent.rank ?? "-"}등
                          </p>
                        ) : null}
                      </div>
                      <div className="grid gap-3 sm:grid-cols-4">
                        <div className="rounded-2xl bg-mist px-4 py-3 text-sm">
                          <div className="text-slate">총 문항</div>
                          <div className="mt-2 text-lg font-semibold">{summary.total}</div>
                        </div>
                        <div className="rounded-2xl bg-mist px-4 py-3 text-sm">
                          <div className="text-slate">정답</div>
                          <div className="mt-2 text-lg font-semibold">{summary.correct}</div>
                        </div>
                        <div className="rounded-2xl bg-mist px-4 py-3 text-sm">
                          <div className="text-slate">오답</div>
                          <div className="mt-2 text-lg font-semibold">{summary.wrong}</div>
                        </div>
                        <div className="rounded-2xl bg-mist px-4 py-3 text-sm">
                          <div className="text-slate">정답률</div>
                          <div className="mt-2 text-lg font-semibold">{summary.correctRate}%</div>
                        </div>
                      </div>
                    </div>

                    <BarComparisonChart
                      data={[
                        {
                          label: SUBJECT_LABEL[session.subject],
                          highestScore: session.highestScore ?? 0,
                          myScore: session.searchedStudent?.score ?? 0,
                          top10Average: session.top10Average ?? 0,
                          top30Average: session.top30Average ?? 0,
                        },
                      ]}
                      xKey="label"
                      bars={[
                        { dataKey: "highestScore", color: "#0F766E", name: "최고점" },
                        { dataKey: "myScore", color: "#EA580C", name: "내 점수" },
                        { dataKey: "top10Average", color: "#2563EB", name: "상위 10%" },
                        { dataKey: "top30Average", color: "#7C3AED", name: "상위 30%" },
                      ]}
                    />

                    <div className="overflow-x-auto rounded-[24px] border border-ink/10">
                      <table className="min-w-full divide-y divide-ink/10 text-sm">
                        <thead className="bg-mist/80 text-left">
                          <tr>
                            <th className="px-4 py-3 font-semibold">문항</th>
                            <th className="px-4 py-3 font-semibold">정답</th>
                            <th className="px-4 py-3 font-semibold">내 답안</th>
                            <th className="px-4 py-3 font-semibold">정오</th>
                            <th className="px-4 py-3 font-semibold">정답률</th>
                            <th className="px-4 py-3 font-semibold">난이도</th>
                            <th className="px-4 py-3 font-semibold">노트</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-ink/10">
                          {session.questionRows.map((question) => (
                            <tr key={question.questionId}>
                              <td className="px-4 py-3">{question.questionNo}</td>
                              <td className="px-4 py-3">{question.correctAnswer}</td>
                              <td className="px-4 py-3">{question.searchedStudentAnswer ?? "-"}</td>
                              <td className="px-4 py-3">
                                {question.searchedStudentCorrect === null
                                  ? "-"
                                  : question.searchedStudentCorrect
                                    ? "O"
                                    : "X"}
                              </td>
                              <td className="px-4 py-3">{question.correctRate.toFixed(1)}%</td>
                              <td className="px-4 py-3">{question.difficulty ?? "-"}</td>
                              <td className="px-4 py-3">
                                {question.searchedStudentCorrect === false ? (
                                  <WrongNoteSaveButton
                                    questionId={question.questionId}
                                    initiallySaved={wrongNoteQuestionIds.has(question.questionId)}
                                  />
                                ) : (
                                  "-"
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="overflow-x-auto rounded-[24px] border border-ink/10">
                      <table className="min-w-full divide-y divide-ink/10 text-sm">
                        <thead className="bg-mist/80 text-left">
                          <tr>
                            <th className="px-4 py-3 font-semibold">상위 오답 TOP5</th>
                            <th className="px-4 py-3 font-semibold">정답</th>
                            <th className="px-4 py-3 font-semibold">정답률</th>
                            <th className="px-4 py-3 font-semibold">최다 오답</th>
                            <th className="px-4 py-3 font-semibold">내 답안</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-ink/10">
                          {session.topWrongQuestions.map((question) => (
                            <tr key={`${session.sessionId}-${question.questionNo}`}>
                              <td className="px-4 py-3">{question.questionNo}번</td>
                              <td className="px-4 py-3">{question.correctAnswer}</td>
                              <td className="px-4 py-3">{question.correctRate.toFixed(1)}%</td>
                              <td className="px-4 py-3">{question.mostCommonWrongAnswer ?? "-"}</td>
                              <td className="px-4 py-3">{question.searchedStudentAnswer ?? "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold">월간 종합 분석</h2>
              <p className="mt-3 text-sm leading-7 text-slate">
                월 평균, 출결, 과목별 비교를 함께 확인할 수 있습니다.
              </p>
            </div>
          </div>

          {!data.monthlyAnalysis ? (
            <div className="mt-6 rounded-[24px] border border-dashed border-ink/10 p-8 text-sm text-slate">
              선택한 월의 분석 데이터가 없습니다.
            </div>
          ) : (
            <div className="mt-6 space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
                  <p className="text-sm text-slate">내 평균</p>
                  <p className="mt-3 text-xl font-semibold">
                    {formatScore(data.monthlyAnalysis.summary.monthlyAverage)}
                  </p>
                </article>
                <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
                  <p className="text-sm text-slate">출석률</p>
                  <p className="mt-3 text-xl font-semibold">
                    {data.monthlyAnalysis.summary.attendanceRate.toFixed(1)}%
                  </p>
                </article>
                <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
                  <p className="text-sm text-slate">응시 횟수</p>
                  <p className="mt-3 text-xl font-semibold">
                    {data.monthlyAnalysis.summary.attendedCount} / {data.monthlyAnalysis.summary.sessionCount}
                  </p>
                </article>
                <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
                  <p className="text-sm text-slate">직렬</p>
                  <p className="mt-3 text-xl font-semibold">
                    {EXAM_TYPE_LABEL[data.monthlyAnalysis.student.examType]}
                  </p>
                </article>
              </div>

              <div className="grid gap-6 xl:grid-cols-2">
                <article className="rounded-[24px] border border-ink/10 p-4">
                  <h3 className="text-lg font-semibold">과목별 균형</h3>
                  <div className="mt-4">
                    <RadarComparisonChart data={data.monthlyAnalysis.radarData} />
                  </div>
                </article>
                <article className="rounded-[24px] border border-ink/10 p-4">
                  <h3 className="text-lg font-semibold">내 점수 vs 코호트</h3>
                  <div className="mt-4">
                    <BarComparisonChart
                      data={data.monthlyAnalysis.barData}
                      xKey="subject"
                      bars={[
                        { dataKey: "studentAverage", color: "#EA580C", name: "내 평균" },
                        { dataKey: "cohortAverage", color: "#2563EB", name: "전체 평균" },
                        { dataKey: "top10Average", color: "#0F766E", name: "상위 10%" },
                      ]}
                    />
                  </div>
                </article>
              </div>

              <div className="overflow-x-auto rounded-[24px] border border-ink/10">
                <table className="min-w-full divide-y divide-ink/10 text-sm">
                  <thead className="bg-mist/80 text-left">
                    <tr>
                      <th className="px-4 py-3 font-semibold">과목</th>
                      <th className="px-4 py-3 font-semibold">내 평균</th>
                      <th className="px-4 py-3 font-semibold">석차</th>
                      <th className="px-4 py-3 font-semibold">전체 평균</th>
                      <th className="px-4 py-3 font-semibold">상위 10%</th>
                      <th className="px-4 py-3 font-semibold">상위 30%</th>
                      <th className="px-4 py-3 font-semibold">목표</th>
                      <th className="px-4 py-3 font-semibold">달성률</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink/10">
                    {data.monthlyAnalysis.subjectSummary.map((row) => (
                      <tr key={row.subject}>
                        <td className="px-4 py-3">{SUBJECT_LABEL[row.subject]}</td>
                        <td className="px-4 py-3">{formatScore(row.studentAverage)}</td>
                        <td className="px-4 py-3">
                          {row.rank ? `${row.rank}/${row.participantCount}` : "-"}
                        </td>
                        <td className="px-4 py-3">{formatScore(row.cohortAverage)}</td>
                        <td className="px-4 py-3">{formatScore(row.top10Average)}</td>
                        <td className="px-4 py-3">{formatScore(row.top30Average)}</td>
                        <td className="px-4 py-3">{formatScore(row.targetScore)}</td>
                        <td className="px-4 py-3">
                          {row.achievementRate ? `${row.achievementRate.toFixed(1)}%` : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>

        <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold">과목별 추이</h2>
              <p className="mt-3 text-sm leading-7 text-slate">
                선택한 과목의 회차별 변화와 비교 지표를 확인할 수 있습니다.
              </p>
            </div>
          </div>

          {data.subjectAnalysis.length === 0 ? (
            <div className="mt-6 rounded-[24px] border border-dashed border-ink/10 p-8 text-sm text-slate">
              선택한 과목의 추이 데이터가 없습니다.
            </div>
          ) : (
            <div className="mt-6 space-y-6">
              <TrendLineChart
                data={data.subjectAnalysis.map((row) => ({
                  label: formatDate(row.examDate),
                  studentScore: row.studentScore ?? 0,
                  averageScore: row.averageScore ?? 0,
                  top10Average: row.top10Average ?? 0,
                  top30Average: row.top30Average ?? 0,
                  targetScore:
                    data.student.targetScores[data.selectedSubject ?? Subject.CUMULATIVE] ?? 0,
                }))}
                xKey="label"
                lines={[
                  { dataKey: "studentScore", color: "#EA580C", name: "내 점수" },
                  { dataKey: "averageScore", color: "#2563EB", name: "전체 평균" },
                  { dataKey: "top10Average", color: "#0F766E", name: "상위 10%" },
                  { dataKey: "top30Average", color: "#7C3AED", name: "상위 30%" },
                  { dataKey: "targetScore", color: "#475569", name: "목표 점수" },
                ]}
              />

              <div className="overflow-x-auto rounded-[24px] border border-ink/10">
                <table className="min-w-full divide-y divide-ink/10 text-sm">
                  <thead className="bg-mist/80 text-left">
                    <tr>
                      <th className="px-4 py-3 font-semibold">시험일</th>
                      <th className="px-4 py-3 font-semibold">주차</th>
                      <th className="px-4 py-3 font-semibold">응시자 수</th>
                      <th className="px-4 py-3 font-semibold">내 점수</th>
                      <th className="px-4 py-3 font-semibold">전체 평균</th>
                      <th className="px-4 py-3 font-semibold">상위 10%</th>
                      <th className="px-4 py-3 font-semibold">상위 30%</th>
                      <th className="px-4 py-3 font-semibold">최고점</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink/10">
                    {data.subjectAnalysis.map((row) => (
                      <tr key={row.sessionId}>
                        <td className="px-4 py-3">{formatDate(row.examDate)}</td>
                        <td className="px-4 py-3">{row.week}주차</td>
                        <td className="px-4 py-3">{row.participantCount}</td>
                        <td className="px-4 py-3">{formatScore(row.studentScore)}</td>
                        <td className="px-4 py-3">{formatScore(row.averageScore)}</td>
                        <td className="px-4 py-3">{formatScore(row.top10Average)}</td>
                        <td className="px-4 py-3">{formatScore(row.top30Average)}</td>
                        <td className="px-4 py-3">{formatScore(row.highestScore)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}