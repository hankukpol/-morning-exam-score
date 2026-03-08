import Link from "next/link";
import { AdminRole } from "@/generated/prisma";
import {
  BarComparisonChart,
  RadarComparisonChart,
} from "@/components/analytics/charts";
import { CounselingPanel } from "@/components/counseling/counseling-panel";
import { EXAM_TYPE_SUBJECTS, EXAM_TYPE_LABEL, SUBJECT_LABEL } from "@/lib/constants";
import { getAnalyticsContext, readStringParam } from "@/lib/analytics/ui";
import { requireAdminContext } from "@/lib/auth";
import {
  getCounselingProfile,
  listCounselingStudents,
} from "@/lib/counseling/service";
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
  const [students, profile] = await Promise.all([
    listCounselingStudents({
      examType,
      search,
    }),
    examNumber ? getCounselingProfile(examNumber) : Promise.resolve(null),
  ]);

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        F-14 Counseling
      </div>
      <h1 className="mt-5 text-3xl font-semibold">학생 면담 지원</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        학생 검색, 최근 4주 요약, 강점/약점, 면담 기록, 목표 점수 설정을 한 화면에서
        처리합니다.
      </p>

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
            placeholder="학생 검색"
          />
        </div>
        <div className="flex items-end">
          <button
            type="submit"
            className="inline-flex w-full items-center justify-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest"
          >
            조회
          </button>
        </div>
      </form>

      <section className="mt-8 rounded-[28px] border border-ink/10 bg-white p-6">
        <h2 className="text-xl font-semibold">검색 결과</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          {students.length === 0 ? (
            <div className="text-sm text-slate">검색된 학생이 없습니다.</div>
          ) : null}
          {students.map((student) => (
            <Link
              key={student.examNumber}
              href={`/admin/counseling?examType=${examType}&search=${encodeURIComponent(search)}&examNumber=${student.examNumber}`}
              className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                student.examNumber === examNumber
                  ? "border-ink bg-ink text-white"
                  : "border-ink/10 hover:border-ember/30 hover:text-ember"
              }`}
            >
              {student.examNumber} · {student.name}
            </Link>
          ))}
        </div>
      </section>

      {!profile ? (
        <div className="mt-8 rounded-[28px] border border-dashed border-ink/10 p-8 text-sm text-slate">
          학생을 선택하면 면담 화면이 열립니다.
        </div>
      ) : (
        <div className="mt-8 space-y-8">
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <article className="rounded-[28px] border border-ink/10 bg-mist p-6">
              <p className="text-sm text-slate">학생</p>
              <p className="mt-4 text-2xl font-semibold">
                {profile.student.name} ({profile.student.examNumber})
              </p>
              <p className="mt-2 text-xs text-slate">{profile.student.phone ?? "-"}</p>
            </article>
            <article className="rounded-[28px] border border-ink/10 bg-mist p-6">
              <p className="text-sm text-slate">최근 4주 결시</p>
              <p className="mt-4 text-2xl font-semibold">{profile.attendanceSummary.absentCount}회</p>
              <p className="mt-2 text-xs text-slate">현재 상태 {profile.student.currentStatus}</p>
            </article>
            <article className="rounded-[28px] border border-ink/10 bg-mist p-6">
              <p className="text-sm text-slate">누적 포인트</p>
              <p className="mt-4 text-2xl font-semibold">{profile.totalPoints.toLocaleString("ko-KR")}P</p>
              <p className="mt-2 text-xs text-slate">최근 지급 이력 10건 기준</p>
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
              <h2 className="text-xl font-semibold">최근 주간 평균</h2>
              <div className="mt-6 overflow-x-auto rounded-[24px] border border-ink/10">
                <table className="min-w-full divide-y divide-ink/10 text-sm">
                  <thead className="bg-mist/80 text-left">
                    <tr>
                      <th className="px-4 py-3 font-semibold">주차 키</th>
                      <th className="px-4 py-3 font-semibold">평균</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink/10">
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
                <h2 className="text-xl font-semibold">이번 달 레이더</h2>
                <div className="mt-4">
                  <RadarComparisonChart data={profile.monthlyAnalysis.radarData} />
                </div>
              </article>
              <article className="rounded-[28px] border border-ink/10 bg-white p-6">
                <h2 className="text-xl font-semibold">이번 달 과목 비교</h2>
                <div className="mt-4">
                  <BarComparisonChart
                    data={profile.monthlyAnalysis.barData}
                    xKey="subject"
                    bars={[
                      { dataKey: "studentAverage", color: "#EA580C", name: "개인 평균" },
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
