import Link from "next/link";
import { StudentLookupForm } from "@/components/student-portal/student-lookup-form";
import { formatMonthLabel, formatPoint, POINT_TYPE_LABEL } from "@/lib/analytics/presentation";
import { hasDatabaseConfig } from "@/lib/env";
import { formatDateTime } from "@/lib/format";
import { getStudentPortalViewer } from "@/lib/student-portal/service";
import { getStudentPortalPointsPageData } from "@/student-portal-api-data";

export const dynamic = "force-dynamic";

export default async function StudentPointsPage() {
  if (!hasDatabaseConfig()) {
    return (
      <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl space-y-6">
          <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
            <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
              Student Points Unavailable
            </div>
            <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
              포인트 화면은 DB 연결 후 사용할 수 있습니다.
            </h1>
            <p className="mt-5 text-sm leading-8 text-slate sm:text-base">
              현재 환경에는 포인트 지급 이력을 불러올 데이터베이스가 연결되어 있지 않습니다.
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
              Student Points Login
            </div>
            <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
              포인트 화면은 로그인 후 확인할 수 있습니다.
            </h1>
            <p className="mt-5 text-sm leading-8 text-slate sm:text-base">
              학생 포털에 로그인하면 누적 포인트와 월별 지급 이력을 확인할 수 있습니다.
            </p>
          </section>

          <StudentLookupForm redirectPath="/student/points" />
        </div>
      </main>
    );
  }

  const data = await getStudentPortalPointsPageData({ examNumber: viewer.examNumber });

  if (!data) {
    return null;
  }

  return (
    <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
                Student Points
              </div>
              <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
                {data.student.name}의 포인트
              </h1>
              <p className="mt-5 text-sm leading-8 text-slate sm:text-base">
                누적 포인트와 월별 지급 이력을 학생 포털에서 바로 확인할 수 있습니다.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/student"
                className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
              >
                포털로 돌아가기
              </Link>
            </div>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
              <p className="text-sm text-slate">누적 포인트</p>
              <p className="mt-3 text-xl font-semibold">{formatPoint(data.summary.totalPoints)}</p>
            </article>
            <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
              <p className="text-sm text-slate">이번 달 포인트</p>
              <p className="mt-3 text-xl font-semibold">{formatPoint(data.summary.currentMonthPoints)}</p>
            </article>
            <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
              <p className="text-sm text-slate">지급 이력</p>
              <p className="mt-3 text-xl font-semibold">{data.summary.historyCount}건</p>
            </article>
            <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
              <p className="text-sm text-slate">최근 지급일</p>
              <p className="mt-3 text-xl font-semibold">{data.summary.latestGrantedAt ? formatDateTime(data.summary.latestGrantedAt) : "-"}</p>
            </article>
          </div>
        </section>

        <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">포인트 지급 이력</h2>
              <p className="mt-3 text-sm leading-7 text-slate">
                어떤 사유로 포인트가 지급되었는지 최신 순으로 확인할 수 있습니다.
              </p>
            </div>
          </div>

          {data.pointLogs.length === 0 ? (
            <div className="mt-6 rounded-[24px] border border-dashed border-ink/10 p-8 text-sm text-slate">
              표시할 포인트 이력이 없습니다.
            </div>
          ) : (
            <div className="mt-6 space-y-4">
              {data.pointLogs.map((log) => (
                <article key={log.id} className="rounded-[24px] border border-ink/10 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex rounded-full border border-ink/10 bg-mist px-3 py-1 text-xs font-semibold text-slate">
                          {POINT_TYPE_LABEL[log.type]}
                        </span>
                        {log.year && log.month ? (
                          <span className="inline-flex rounded-full border border-ink/10 bg-white px-3 py-1 text-xs font-semibold text-slate">
                            {formatMonthLabel(log.year, log.month)}
                          </span>
                        ) : null}
                      </div>
                      <h3 className="mt-4 text-xl font-semibold">{formatPoint(log.amount)}</h3>
                      <p className="mt-2 text-sm text-slate">{formatDateTime(log.grantedAt)}</p>
                    </div>
                    <div className="rounded-[20px] border border-ink/10 bg-mist px-4 py-3 text-sm text-slate">
                      {log.period?.name ?? "기간 미지정"}
                    </div>
                  </div>

                  <div className="mt-4 rounded-[20px] border border-ink/10 bg-white px-4 py-4 text-sm leading-7 text-slate">
                    {log.reason}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}