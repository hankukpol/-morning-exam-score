import { redirect } from "next/navigation";
import { StudentLookupForm } from "@/components/student-portal/student-lookup-form";
import { formatScore, STATUS_BADGE_CLASS, STATUS_LABEL } from "@/lib/analytics/presentation";
import { ATTEND_TYPE_LABEL, SUBJECT_LABEL } from "@/lib/constants";
import { hasDatabaseConfig } from "@/lib/env";
import { formatDateWithWeekday } from "@/lib/format";
import { getStudentPortalViewer } from "@/lib/student-portal/service";
import { getStudentPortalAttendancePageData } from "@/student-portal-api-data";

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

export const dynamic = "force-dynamic";

function readPeriodId(searchParams: PageProps["searchParams"]) {
  const value = searchParams?.periodId;
  const raw = Array.isArray(value) ? value[0] : value;

  if (!raw) {
    return undefined;
  }

  const periodId = Number(raw);
  return Number.isInteger(periodId) && periodId > 0 ? periodId : undefined;
}

export default async function StudentAttendancePage({ searchParams }: PageProps) {
  if (!hasDatabaseConfig()) {
    return (
      <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl space-y-6">
          <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
            <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
              Student Attendance Unavailable
            </div>
            <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
              출결 화면은 DB 연결 후 사용할 수 있습니다.
            </h1>
            <p className="mt-5 text-sm leading-8 text-slate sm:text-base">
              현재 환경에는 학생 출결 데이터를 불러올 데이터베이스가 연결되어 있지 않습니다.
            </p>
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
              Student Attendance Login
            </div>
            <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
              출결 화면은 로그인 후 확인할 수 있습니다.
            </h1>
            <p className="mt-5 text-sm leading-8 text-slate sm:text-base">
              학생 포털에 로그인하면 최근 시험 출결과 주간, 월간 결석 현황을 함께 볼 수 있습니다.
            </p>
          </section>

          <StudentLookupForm redirectPath="/student/attendance" />
        </div>
      </main>
    );
  }

  const requestedPeriodId = readPeriodId(searchParams);
  const data = await getStudentPortalAttendancePageData({
    examNumber: viewer.examNumber,
    periodId: requestedPeriodId,
  });

  if (!data) {
    return null;
  }

  if (requestedPeriodId !== undefined && !data.periods.some((period) => period.id === requestedPeriodId)) {
    redirect("/student/attendance");
  }

  return (
    <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
                Student Attendance
              </div>
              <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
                {data.student.name}의 출결 현황
              </h1>
              <p className="mt-5 text-sm leading-8 text-slate sm:text-base">
                주간, 월간 결석 횟수와 최근 시험 출결을 한 화면에서 확인할 수 있습니다.
              </p>
            </div>
            <div className={`inline-flex rounded-full border px-4 py-3 text-sm font-semibold ${STATUS_BADGE_CLASS[data.summary.currentStatus]}`}>
              {STATUS_LABEL[data.summary.currentStatus]}
            </div>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
              <p className="text-sm text-slate">조회 기간</p>
              <p className="mt-3 text-xl font-semibold">{data.selectedPeriod?.name ?? "기간 미선택"}</p>
            </article>
            <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
              <p className="text-sm text-slate">이번 주 결석</p>
              <p className="mt-3 text-xl font-semibold">{data.summary.thisWeekAbsences}회</p>
            </article>
            <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
              <p className="text-sm text-slate">이번 달 결석</p>
              <p className="mt-3 text-xl font-semibold">{data.summary.thisMonthAbsences}회</p>
            </article>
            <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
              <p className="text-sm text-slate">출석률</p>
              <p className="mt-3 text-xl font-semibold">{data.summary.attendanceRate.toFixed(1)}%</p>
            </article>
          </div>
        </section>

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

        <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">최근 시험 출결</h2>
              <p className="mt-3 text-sm leading-7 text-slate">
                최근 회차의 출결, 점수, 출석 인정 여부를 카드 형태로 정리했습니다.
              </p>
            </div>
          </div>

          {data.recentSessions.length === 0 ? (
            <div className="mt-6 rounded-[24px] border border-dashed border-ink/10 p-8 text-sm text-slate">
              선택한 기간에 확인할 출결 정보가 없습니다.
            </div>
          ) : (
            <div className="mt-6 space-y-4">
              {data.recentSessions.map((session) => (
                <article key={session.id} className="rounded-[24px] border border-ink/10 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex rounded-full border border-ink/10 bg-mist px-3 py-1 text-xs font-semibold text-slate">
                          {formatDateWithWeekday(session.examDate)}
                        </span>
                        <span className="inline-flex rounded-full border border-ink/10 bg-white px-3 py-1 text-xs font-semibold text-slate">
                          {session.week}주차
                        </span>
                      </div>
                      <h3 className="mt-4 text-xl font-semibold">{SUBJECT_LABEL[session.subject]}</h3>
                      <p className="mt-2 text-sm text-slate">출결 {ATTEND_TYPE_LABEL[session.attendType]}</p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-[20px] border border-ink/10 bg-mist px-4 py-3 text-sm">
                        <div className="text-slate">점수</div>
                        <div className="mt-2 text-lg font-semibold">{formatScore(session.finalScore)}</div>
                      </div>
                      <div className="rounded-[20px] border border-ink/10 bg-mist px-4 py-3 text-sm">
                        <div className="text-slate">출석 인정</div>
                        <div className="mt-2 text-lg font-semibold">{session.countedAsAttendance ? "인정" : "미인정"}</div>
                      </div>
                    </div>
                  </div>

                  {session.noteReason ? (
                    <div className="mt-4 rounded-[20px] border border-ink/10 bg-white px-4 py-4 text-sm leading-7 text-slate">
                      사유서 메모: {session.noteReason}
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