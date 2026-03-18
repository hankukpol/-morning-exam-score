import Link from "next/link";
import { redirect } from "next/navigation";
import { StudentLookupForm } from "@/components/student-portal/student-lookup-form";
import { AttendanceSection } from "@/components/student-portal/attendance-section";
import { STATUS_BADGE_CLASS, STATUS_LABEL } from "@/lib/analytics/presentation";
import { hasDatabaseConfig } from "@/lib/env";
import { getStudentPortalViewer } from "@/lib/student-portal/service";
import {
  getStudentPortalAttendancePageData,
  getStudentPortalAttendanceCalendarData,
} from "@/student-portal-api-data";

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

function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
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

  // 출결 페이지 데이터 + 이번 달 캘린더 데이터 병렬 로드
  const [data, calendarData] = await Promise.all([
    getStudentPortalAttendancePageData({
      examNumber: viewer.examNumber,
      periodId: requestedPeriodId,
    }),
    getStudentPortalAttendanceCalendarData({
      examNumber: viewer.examNumber,
      month: currentMonthKey(),
    }),
  ]);

  if (!data) {
    return null;
  }

  if (requestedPeriodId !== undefined && !data.periods.some((period) => period.id === requestedPeriodId)) {
    redirect("/student/attendance");
  }

  const initialMonth = calendarData?.month ?? currentMonthKey();
  const initialCalendarRecords = calendarData?.records ?? [];
  const initialMonthlySummary = calendarData?.summary ?? {
    present: 0,
    excused: 0,
    absent: 0,
    total: 0,
    attendanceRate: 0,
    streak: 0,
  };

  return (
    <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        {/* ── 헤더 ── */}
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
                월별 캘린더, 출석률, 연속 출석 스트릭을 한 화면에서 확인할 수 있습니다.
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <div
                className={`inline-flex rounded-full border px-4 py-3 text-sm font-semibold ${STATUS_BADGE_CLASS[data.summary.currentStatus]}`}
              >
                {STATUS_LABEL[data.summary.currentStatus]}
              </div>
              <Link
                href="/student/check-in/history"
                className="inline-flex items-center gap-1.5 rounded-full border border-forest/30 bg-forest/5 px-4 py-2 text-sm font-semibold text-forest transition hover:bg-forest/10"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                  <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
                </svg>
                출석 이력
              </Link>
              <Link
                href="/student/absence-notes"
                className="inline-flex items-center gap-1.5 rounded-full border border-ember/30 bg-ember/5 px-4 py-2 text-sm font-semibold text-ember transition hover:bg-ember/10"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                  <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
                </svg>
                결석확인서 제출
              </Link>
            </div>
          </div>
        </section>

        {/* ── 기간 선택 폼 ── */}
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

        {/* ── 요약 + 캘린더 + 상세 목록 (클라이언트 컴포넌트) ── */}
        <AttendanceSection
          initialCalendarRecords={initialCalendarRecords}
          initialMonthlySummary={initialMonthlySummary}
          initialMonth={initialMonth}
          summary={data.summary}
          recentSessions={data.recentSessions}
          studentName={data.student.name}
        />
      </div>
    </main>
  );
}
