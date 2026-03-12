import Link from "next/link";
import { AdminRole } from "@prisma/client";
import {
  BarComparisonChart,
  RadarComparisonChart,
} from "@/components/analytics/charts";
import { AppointmentManager } from "@/components/counseling/appointment-manager";
import { BulkCounselingForm } from "@/components/counseling/bulk-counseling-form";
import { CounselingPanel } from "@/components/counseling/counseling-panel";
import { WarningStudentsDrawer } from "@/components/counseling/warning-students-drawer";
import {
  buildHref,
  getAnalyticsContext,
  readStringParam,
} from "@/lib/analytics/ui";
import { STATUS_BADGE_CLASS, STATUS_LABEL } from "@/lib/analytics/presentation";
import { requireAdminContext } from "@/lib/auth";
import {
  getCounselingDashboard,
  getCounselingProfile,
  listAppointments,
  listCounselingStudents,
} from "@/lib/counseling/service";
import { EXAM_TYPE_SUBJECTS, EXAM_TYPE_LABEL, SUBJECT_LABEL } from "@/lib/constants";
import { formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

export default async function AdminCounselingPage({ searchParams }: PageProps) {
  const context = await requireAdminContext(AdminRole.TEACHER);
  const { examType } = await getAnalyticsContext(searchParams);
  const search = readStringParam(searchParams, "search") ?? "";
  const examNumber = readStringParam(searchParams, "examNumber") ?? "";

  const [students, profile, dashboard, allAppointments] = await Promise.all([
    search
      ? listCounselingStudents({ examType, search, page: 1, pageSize: 10 })
      : Promise.resolve(null),
    examNumber ? getCounselingProfile(examNumber) : Promise.resolve(null),
    getCounselingDashboard(),
    listAppointments(),
  ]);

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        F-14 Counseling
      </div>
      <h1 className="mt-5 text-3xl font-semibold">학생 면담 지원</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        면담 예약, 상담 기록, 출결과 성적 요약을 한 화면에서 확인하고 관리합니다.
      </p>

      <section className="mt-8 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-[28px] border border-ink/10 bg-white p-6">
            <p className="text-sm text-slate">오늘 면담 일정</p>
            <p className="mt-3 text-3xl font-semibold">
              {dashboard.todayScheduled.length}
              <span className="ml-1 text-base font-normal text-slate">건</span>
            </p>
            <p className="mt-2 text-xs text-slate">당일 예약된 상담 일정</p>
          </article>

          <article className="rounded-[28px] border border-ink/10 bg-white p-6">
            <p className="text-sm text-slate">이번 주 면담 완료</p>
            <p className="mt-3 text-3xl font-semibold">
              {dashboard.thisWeekDoneCount}
              <span className="ml-1 text-base font-normal text-slate">건</span>
            </p>
            <p className="mt-2 text-xs text-slate">이번 주에 기록된 상담 건수</p>
          </article>

          <WarningStudentsDrawer
            warningNoRecentCount={dashboard.warningNoRecentCount}
            warningStudents={dashboard.warningStudents}
          />

          <article className="rounded-[28px] border border-ink/10 bg-white p-6">
            <p className="text-sm text-slate">이번 달 면담 완료</p>
            <p className="mt-3 text-3xl font-semibold">
              {dashboard.thisMonthCount}
              <span className="ml-1 text-base font-normal text-slate">건</span>
            </p>
            <p className="mt-2 text-xs text-slate">이번 달 누적 상담 건수</p>
          </article>
        </div>

        <details
          className={`group rounded-[28px] border transition ${
            dashboard.thisWeekScheduled.length > 0
              ? "border-sky-200 bg-sky-50/60"
              : "border-ink/10 bg-white"
          }`}
        >
          <summary className="flex cursor-pointer list-none items-center justify-between px-6 py-5 [&::-webkit-details-marker]:hidden">
            <div>
              <p className="text-sm text-slate">이번 주 예약 면담</p>
              <p className="mt-1 flex items-baseline gap-1">
                <span
                  className={`text-3xl font-semibold ${
                    dashboard.thisWeekScheduled.length > 0 ? "text-sky-700" : ""
                  }`}
                >
                  {dashboard.thisWeekScheduled.length}
                </span>
                <span className="text-base font-normal text-slate">건 예정</span>
              </p>
              <p className="mt-1 text-xs text-slate">클릭해서 예약 학생 목록 확인</p>
            </div>
            <span className="text-slate transition-transform group-open:rotate-180">▼</span>
          </summary>

          <div className="border-t border-sky-200/70 px-6 pb-5 pt-4">
            {dashboard.thisWeekScheduled.length === 0 ? (
              <p className="text-sm text-slate">이번 주 예약된 면담이 없습니다.</p>
            ) : (
              <div className="space-y-2">
                {dashboard.thisWeekScheduled.map((appt) => {
                  const d = new Date(appt.scheduledAt);
                  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
                  const dateLabel = `${d.getMonth() + 1}/${d.getDate()}(${weekdays[d.getDay()]}) ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
                  return (
                    <Link
                      prefetch={false}
                      key={appt.id}
                      href={buildHref("/admin/counseling", {
                        examType: appt.student.examType,
                        examNumber: appt.student.examNumber,
                        search: appt.student.examNumber,
                      })}
                      className="flex items-center gap-4 rounded-2xl border border-sky-200/80 bg-white px-4 py-3 text-sm transition hover:border-sky-400 hover:bg-sky-50"
                    >
                      <span className="w-28 shrink-0 font-semibold text-sky-800">{dateLabel}</span>
                      <span className="font-semibold">{appt.student.examNumber} · {appt.student.name}</span>
                      <span className="text-slate">{appt.counselorName}</span>
                      {appt.agenda ? (
                        <span className="ml-auto rounded-full border border-sky-200 bg-sky-50 px-3 py-0.5 text-xs text-sky-700">
                          {appt.agenda}
                        </span>
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </details>
      </section>

      {dashboard.todayScheduled.length > 0 ? (
        <section className="mt-6 rounded-[28px] border border-sky-200 bg-sky-50/60 p-5">
          <h2 className="text-sm font-semibold text-sky-800">
            오늘 면담 일정 ({dashboard.todayScheduled.length}건)
          </h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {dashboard.todayScheduled.map((appt) => (
              <Link
                prefetch={false}
                key={appt.id}
                href={buildHref("/admin/counseling", {
                  examType: appt.student.examType,
                  examNumber: appt.student.examNumber,
                  search: appt.student.examNumber,
                })}
                className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition ${
                  appt.student.examNumber === examNumber
                    ? "border-sky-600 bg-sky-600 text-white"
                    : "border-sky-300 bg-white text-sky-800 hover:border-sky-500 hover:bg-sky-50"
                }`}
              >
                {appt.student.examNumber} · {appt.student.name}
                {appt.agenda ? (
                  <span className="ml-2 text-xs font-normal opacity-70">· {appt.agenda}</span>
                ) : null}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-8 rounded-[28px] border border-ink/10 bg-white p-6">
        <div className="mb-5 flex items-baseline justify-between">
          <h2 className="text-xl font-semibold">일괄 면담 기록 등록</h2>
          <p className="text-sm text-slate">여러 학생에게 동일 내용의 면담 기록을 한 번에 등록합니다</p>
        </div>
        <BulkCounselingForm
          defaultCounselorName={context.adminUser.name}
          warningStudents={dashboard.bulkWarningStudents.map((s) => ({
            examNumber: s.examNumber,
            name: s.name,
            currentStatus: s.currentStatus,
            examType: s.examType,
          }))}
        />
      </section>

      <section className="mt-8 rounded-[28px] border border-ink/10 bg-white p-6">
        <h2 className="mb-5 text-xl font-semibold">예약 면담 관리</h2>
        <AppointmentManager
          appointments={allAppointments.map((a) => ({
            id: a.id,
            examNumber: a.examNumber,
            scheduledAt: a.scheduledAt.toISOString(),
            counselorName: a.counselorName,
            agenda: a.agenda,
            status: a.status as "SCHEDULED" | "COMPLETED" | "CANCELLED",
            cancelReason: a.cancelReason,
            student: a.student,
          }))}
          defaultCounselorName={context.adminUser.name}
          defaultExamNumber={examNumber}
          defaultStudentName={profile?.student.name ?? ""}
        />
      </section>

      <form className="mt-8 grid gap-4 rounded-[28px] border border-ink/10 bg-mist p-6 md:grid-cols-[180px_minmax(0,1fr)_140px]">
        <div>
          <label className="mb-2 block text-sm font-medium">직렬</label>
          <select
            name="examType"
            defaultValue={examType}
            className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
          >
            <option value="GONGCHAE">{EXAM_TYPE_LABEL.GONGCHAE}</option>
            <option value="GYEONGCHAE">{EXAM_TYPE_LABEL.GYEONGCHAE}</option>
          </select>
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium">수험번호 / 이름</label>
          <input
            type="text"
            name="search"
            defaultValue={search}
            className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
            placeholder="수험번호 또는 이름을 입력하세요"
          />
        </div>
        <div className="flex items-end">
          <button
            type="submit"
            className="inline-flex w-full items-center justify-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest"
          >
            검색
          </button>
        </div>
      </form>

      {search && students ? (
        <section className="mt-3 rounded-[28px] border border-ink/10 bg-white p-5">
          <p className="text-sm font-medium text-slate">
            {students.totalCount === 0
              ? "검색된 학생이 없습니다."
              : `${students.totalCount}명 검색됨${students.totalCount > 10 ? " · 상위 10명만 표시" : ""}`}
          </p>
          {students.rows.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {students.rows.map((student) => (
                <Link
                  prefetch={false}
                  key={student.examNumber}
                  href={buildHref("/admin/counseling", {
                    examType,
                    search,
                    examNumber: student.examNumber,
                  })}
                  className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition ${
                    student.examNumber === examNumber
                      ? "border-ink bg-ink text-white"
                      : "border-ink/10 hover:border-ember/30 hover:text-ember"
                  }`}
                >
                  <span>
                    {student.examNumber} · {student.name}
                  </span>
                  {student.currentStatus !== "NORMAL" ? (
                    <span
                      className={`rounded-full border px-2 py-0.5 text-xs ${
                        STATUS_BADGE_CLASS[student.currentStatus]
                      }`}
                    >
                      {STATUS_LABEL[student.currentStatus]}
                    </span>
                  ) : null}
                </Link>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {!profile ? (
        <div className="mt-8 rounded-[28px] border border-dashed border-ink/10 p-10 text-center text-sm text-slate">
          학생을 검색하고 선택하면 면담 기록과 성적 요약이 표시됩니다.
        </div>
      ) : (
        <div className="mt-8 space-y-8">
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <article className="rounded-[28px] border border-ink/10 bg-mist p-6">
              <p className="text-sm text-slate">학생</p>
              <p className="mt-4 text-2xl font-semibold">
                {profile.student.name}{" "}
                <span className="text-base font-normal text-slate">
                  ({profile.student.examNumber})
                </span>
              </p>
              <p className="mt-2 text-xs text-slate">{profile.student.phone ?? "-"}</p>
            </article>

            <article className="rounded-[28px] border border-ink/10 bg-mist p-6">
              <p className="text-sm text-slate">최근 4주 결시</p>
              <p className="mt-4 text-2xl font-semibold">{profile.attendanceSummary.absentCount}회</p>
              <p className="mt-2 text-xs text-slate">
                현재 상태{" "}
                <span
                  className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${
                    STATUS_BADGE_CLASS[profile.student.currentStatus]
                  }`}
                >
                  {STATUS_LABEL[profile.student.currentStatus]}
                </span>
              </p>
            </article>

            <article className="rounded-[28px] border border-ink/10 bg-mist p-6">
              <p className="text-sm text-slate">누적 포인트</p>
              <p className="mt-4 text-2xl font-semibold">{profile.totalPoints.toLocaleString("ko-KR")}P</p>
              <p className="mt-2 text-xs text-slate">최근 포인트 지급 이력 기준</p>
            </article>

            <article className="rounded-[28px] border border-ink/10 bg-mist p-6">
              <p className="text-sm text-slate">면담 기록</p>
              <p className="mt-4 text-2xl font-semibold">{profile.counselingRecords.length}건</p>
              <p className="mt-2 text-xs text-slate">
                최근 기록 {profile.counselingRecords[0] ? formatDateTime(profile.counselingRecords[0].counseledAt) : "-"}
              </p>
            </article>
          </section>

          <section className="grid gap-6 xl:grid-cols-2">
            <article className="rounded-[28px] border border-ink/10 bg-white p-6">
              <h2 className="text-xl font-semibold">최근 4주 강점 / 약점</h2>
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <div className="rounded-[24px] border border-forest/20 bg-forest/10 p-4">
                  <p className="text-sm font-semibold text-forest">강점 과목</p>
                  <div className="mt-3 space-y-2 text-sm">
                    {profile.strengths.length === 0 ? <p>-</p> : null}
                    {profile.strengths.map((row) => (
                      <p key={row.subject}>
                        {SUBJECT_LABEL[row.subject]} · {row.average ?? "-"}
                      </p>
                    ))}
                  </div>
                </div>
                <div className="rounded-[24px] border border-amber-200 bg-amber-50 p-4">
                  <p className="text-sm font-semibold text-amber-700">보완 과목</p>
                  <div className="mt-3 space-y-2 text-sm">
                    {profile.weaknesses.length === 0 ? <p>-</p> : null}
                    {profile.weaknesses.map((row) => (
                      <p key={row.subject}>
                        {SUBJECT_LABEL[row.subject]} · {row.average ?? "-"}
                      </p>
                    ))}
                  </div>
                </div>
              </div>
            </article>

            <article className="rounded-[28px] border border-ink/10 bg-white p-6">
              <h2 className="text-xl font-semibold">최근 주차 평균</h2>
              <div className="mt-6 overflow-x-auto rounded-[24px] border border-ink/10">
                <table className="min-w-full divide-y divide-ink/10 text-sm">
                  <thead className="bg-mist/80 text-left">
                    <tr>
                      <th className="px-4 py-3 font-semibold">주차</th>
                      <th className="px-4 py-3 font-semibold">평균</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink/10">
                    {profile.recentWeeklySummary.length === 0 ? (
                      <tr>
                        <td colSpan={2} className="px-4 py-6 text-center text-slate">
                          최근 주차 데이터가 없습니다.
                        </td>
                      </tr>
                    ) : null}
                    {profile.recentWeeklySummary.map((row) => (
                      <tr key={row.week}>
                        <td className="px-4 py-3">{row.week}</td>
                        <td className="px-4 py-3">{row.average ?? "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          </section>

          {profile.monthlyAnalysis ? (
            <section className="grid gap-6 xl:grid-cols-2">
              <article className="rounded-[28px] border border-ink/10 bg-white p-6">
                <h2 className="text-xl font-semibold">이번 달 과목별 비교</h2>
                <div className="mt-4">
                  <RadarComparisonChart data={profile.monthlyAnalysis.radarData} />
                </div>
              </article>
              <article className="rounded-[28px] border border-ink/10 bg-white p-6">
                <h2 className="text-xl font-semibold">이번 달 평균 비교</h2>
                <div className="mt-4">
                  <BarComparisonChart
                    data={profile.monthlyAnalysis.barData}
                    xKey="subject"
                    bars={[
                      { dataKey: "studentAverage", color: "#EA580C", name: "학생 평균" },
                      { dataKey: "cohortAverage", color: "#2563EB", name: "전체 평균" },
                      { dataKey: "top10Average", color: "#0F766E", name: "상위 10%" },
                    ]}
                  />
                </div>
              </article>
            </section>
          ) : null}

          <CounselingPanel
            examNumber={profile.student.examNumber}
            defaultCounselorName={context.adminUser.name}
            targetScores={profile.student.targetScores}
            subjects={EXAM_TYPE_SUBJECTS[profile.student.examType]}
            records={profile.counselingRecords.map((record) => ({
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
    </div>
  );
}