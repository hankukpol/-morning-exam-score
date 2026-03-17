import Link from "next/link";
import { AdminRole, ExamType, Subject } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { EXAM_TYPE_LABEL, SUBJECT_LABEL } from "@/lib/constants";

export const dynamic = "force-dynamic";

function formatDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
  return `${year}.${month}.${day}(${weekdays[d.getDay()]})`;
}

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ScoreSessionsPage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.TEACHER);

  const sp = await searchParams;

  const examTypeFilter = typeof sp.examType === "string" ? sp.examType : "";
  const subjectFilter = typeof sp.subject === "string" ? sp.subject : "";
  const dateFrom = typeof sp.dateFrom === "string" ? sp.dateFrom : "";
  const dateTo = typeof sp.dateTo === "string" ? sp.dateTo : "";

  // Build where clause
  const where: {
    isCancelled?: boolean;
    examType?: ExamType;
    subject?: Subject;
    examDate?: { gte?: Date; lte?: Date };
  } = {};

  if (examTypeFilter === "GONGCHAE") {
    where.examType = ExamType.GONGCHAE;
  } else if (examTypeFilter === "GYEONGCHAE") {
    where.examType = ExamType.GYEONGCHAE;
  }

  if (subjectFilter && Object.values(Subject).includes(subjectFilter as Subject)) {
    where.subject = subjectFilter as Subject;
  }

  const dateRange: { gte?: Date; lte?: Date } = {};
  if (dateFrom) {
    const d = new Date(dateFrom);
    if (!isNaN(d.getTime())) {
      d.setHours(0, 0, 0, 0);
      dateRange.gte = d;
    }
  }
  if (dateTo) {
    const d = new Date(dateTo);
    if (!isNaN(d.getTime())) {
      d.setHours(23, 59, 59, 999);
      dateRange.lte = d;
    }
  }
  if (Object.keys(dateRange).length > 0) {
    where.examDate = dateRange;
  }

  const sessions = await getPrisma().examSession.findMany({
    where,
    orderBy: [{ examDate: "desc" }, { id: "desc" }],
    take: 200,
    select: {
      id: true,
      examType: true,
      week: true,
      subject: true,
      displaySubjectName: true,
      examDate: true,
      isCancelled: true,
      isLocked: true,
      period: { select: { id: true, name: true, isActive: true } },
      _count: { select: { scores: true } },
    },
  });

  // Total counts for KPI
  const totalAll = await getPrisma().examSession.count({ where: {} });
  const totalFiltered = sessions.length;
  const cancelledCount = sessions.filter((s) => s.isCancelled).length;
  const lockedCount = sessions.filter((s) => s.isLocked && !s.isCancelled).length;
  const missingEntryCount = sessions.filter(
    (s) => !s.isCancelled && s._count.scores === 0,
  ).length;

  const hasFilter = !!(examTypeFilter || subjectFilter || dateFrom || dateTo);

  return (
    <div className="p-8 sm:p-10">
      {/* ── 헤더 ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 mb-2">
        <Link href="/admin/scores" className="text-sm text-slate hover:text-ink transition">
          ← 성적 허브
        </Link>
      </div>
      <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        성적 관리
      </div>
      <h1 className="mt-5 text-3xl font-semibold text-ink">시험 세션 목록</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        전체 시험 세션을 조회하고 직렬·날짜·과목으로 필터링합니다.
        각 세션의 상세 내역 확인과 성적 입력·수정으로 바로 이동할 수 있습니다.
      </p>

      {/* ── KPI 카드 ─────────────────────────────────────────────────── */}
      <section className="mt-8">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <article className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">
              {hasFilter ? "필터 결과" : "전체 세션"}
            </p>
            <p className="mt-3 text-3xl font-semibold text-ink">
              {hasFilter ? totalFiltered : totalAll}
            </p>
            <p className="mt-1 text-xs text-slate">
              {hasFilter ? `전체 ${totalAll}개 중` : "누적 등록 세션 수"}
            </p>
          </article>

          <article
            className={`rounded-[28px] border p-6 shadow-panel ${
              missingEntryCount > 0
                ? "border-amber-200 bg-amber-50/60"
                : "border-ink/10 bg-white"
            }`}
          >
            <p
              className={`text-xs font-semibold uppercase tracking-[0.18em] ${
                missingEntryCount > 0 ? "text-amber-700" : "text-slate"
              }`}
            >
              미입력 세션
            </p>
            <p
              className={`mt-3 text-3xl font-semibold ${
                missingEntryCount > 0 ? "text-amber-700" : "text-ink"
              }`}
            >
              {missingEntryCount}
            </p>
            <p className="mt-1 text-xs text-slate">성적 0건인 비취소 세션</p>
          </article>

          <article className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">
              잠긴 세션
            </p>
            <p className="mt-3 text-3xl font-semibold text-ink">{lockedCount}</p>
            <p className="mt-1 text-xs text-slate">성적 잠금 처리된 세션</p>
          </article>

          <article className="rounded-[28px] border border-red-100 bg-red-50/40 p-6 shadow-panel">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-600">
              취소된 세션
            </p>
            <p className="mt-3 text-3xl font-semibold text-red-600">{cancelledCount}</p>
            <p className="mt-1 text-xs text-slate">isCancelled = true</p>
          </article>
        </div>
      </section>

      {/* ── 필터 폼 ──────────────────────────────────────────────────── */}
      <section className="mt-10">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-slate">
          필터
        </h2>
        <form method="GET" className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* 직렬 */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate" htmlFor="examType">
                직렬
              </label>
              <select
                id="examType"
                name="examType"
                defaultValue={examTypeFilter}
                className="rounded-xl border border-ink/10 bg-mist px-3 py-2 text-sm text-ink focus:border-ember/40 focus:outline-none focus:ring-2 focus:ring-ember/20"
              >
                <option value="">전체</option>
                <option value="GONGCHAE">공채</option>
                <option value="GYEONGCHAE">경채</option>
              </select>
            </div>

            {/* 과목 */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate" htmlFor="subject">
                과목
              </label>
              <select
                id="subject"
                name="subject"
                defaultValue={subjectFilter}
                className="rounded-xl border border-ink/10 bg-mist px-3 py-2 text-sm text-ink focus:border-ember/40 focus:outline-none focus:ring-2 focus:ring-ember/20"
              >
                <option value="">전체</option>
                {Object.entries(SUBJECT_LABEL).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            {/* 시작일 */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate" htmlFor="dateFrom">
                시작일
              </label>
              <input
                id="dateFrom"
                name="dateFrom"
                type="date"
                defaultValue={dateFrom}
                className="rounded-xl border border-ink/10 bg-mist px-3 py-2 text-sm text-ink focus:border-ember/40 focus:outline-none focus:ring-2 focus:ring-ember/20"
              />
            </div>

            {/* 종료일 */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate" htmlFor="dateTo">
                종료일
              </label>
              <input
                id="dateTo"
                name="dateTo"
                type="date"
                defaultValue={dateTo}
                className="rounded-xl border border-ink/10 bg-mist px-3 py-2 text-sm text-ink focus:border-ember/40 focus:outline-none focus:ring-2 focus:ring-ember/20"
              />
            </div>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button
              type="submit"
              className="inline-flex items-center rounded-full border border-ember/30 bg-ember/10 px-5 py-2 text-sm font-semibold text-ember transition hover:bg-ember/20"
            >
              검색
            </button>
            {hasFilter && (
              <Link
                href="/admin/scores/sessions"
                className="inline-flex items-center rounded-full border border-ink/10 px-5 py-2 text-sm font-semibold text-slate transition hover:border-ink/30 hover:text-ink"
              >
                필터 초기화
              </Link>
            )}
          </div>
        </form>
      </section>

      {/* ── 세션 목록 테이블 ─────────────────────────────────────────── */}
      <section className="mt-10">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate">
            세션 목록
            {hasFilter ? ` (${totalFiltered}건)` : ` (최대 200건)`}
          </h2>
        </div>

        {sessions.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-ink/10 p-10 text-center text-sm text-slate">
            {hasFilter ? "검색 조건에 맞는 세션이 없습니다." : "등록된 세션이 없습니다."}
          </div>
        ) : (
          <div className="rounded-[28px] border border-ink/10 bg-white shadow-panel">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[740px] text-sm">
                <thead>
                  <tr className="border-b border-ink/10">
                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate">
                      날짜
                    </th>
                    <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate">
                      기수
                    </th>
                    <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate">
                      직렬
                    </th>
                    <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate">
                      주차
                    </th>
                    <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate">
                      과목
                    </th>
                    <th className="px-4 py-4 text-right text-xs font-semibold uppercase tracking-[0.16em] text-slate">
                      응시자 수
                    </th>
                    <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate">
                      상태
                    </th>
                    <th className="px-4 py-4 text-right text-xs font-semibold uppercase tracking-[0.16em] text-slate">
                      관리
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5">
                  {sessions.map((session) => {
                    const subjectLabel =
                      session.displaySubjectName?.trim() ||
                      SUBJECT_LABEL[session.subject as Subject] ||
                      session.subject;

                    return (
                      <tr
                        key={session.id}
                        className={`transition hover:bg-mist/60 ${
                          session.isCancelled ? "opacity-50" : ""
                        }`}
                      >
                        <td className="px-6 py-3 text-slate">
                          {formatDate(session.examDate)}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1 text-sm text-ink">
                            {session.period.name}
                            {session.period.isActive && (
                              <span className="rounded-full bg-forest/10 px-1.5 py-0.5 text-[10px] font-semibold text-forest">
                                현재
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                              session.examType === "GONGCHAE"
                                ? "border-forest/30 bg-forest/10 text-forest"
                                : "border-ember/30 bg-ember/10 text-ember"
                            }`}
                          >
                            {EXAM_TYPE_LABEL[session.examType as ExamType] ?? session.examType}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="rounded-full bg-ink/5 px-2.5 py-0.5 text-xs font-semibold text-slate">
                            {session.week}주
                          </span>
                        </td>
                        <td className="px-4 py-3 font-medium text-ink">
                          {subjectLabel}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {session._count.scores > 0 ? (
                            <span className="font-mono font-semibold text-ink">
                              {session._count.scores}명
                            </span>
                          ) : session.isCancelled ? (
                            <span className="text-ink/30">—</span>
                          ) : (
                            <span className="font-semibold text-amber-600">미입력</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {session.isCancelled && (
                              <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-600">
                                취소
                              </span>
                            )}
                            {session.isLocked && !session.isCancelled && (
                              <span className="inline-flex items-center rounded-full border border-ink/10 bg-ink/5 px-2 py-0.5 text-[10px] font-semibold text-slate">
                                잠김
                              </span>
                            )}
                            {!session.isCancelled && !session.isLocked && (
                              <span className="inline-flex items-center rounded-full border border-forest/20 bg-forest/5 px-2 py-0.5 text-[10px] font-semibold text-forest">
                                활성
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Link
                              href={`/admin/scores/sessions/${session.id}`}
                              className="inline-flex items-center rounded-full border border-ink/20 px-3 py-1 text-xs font-semibold text-slate transition hover:border-ink/40 hover:text-ink"
                            >
                              상세
                            </Link>
                            {!session.isCancelled &&
                              (session._count.scores === 0 ? (
                                <Link
                                  href={`/admin/scores/input?sessionId=${session.id}`}
                                  className="inline-flex items-center rounded-full border border-ember/30 bg-ember/10 px-3 py-1 text-xs font-semibold text-ember transition hover:bg-ember/20"
                                >
                                  입력
                                </Link>
                              ) : (
                                <Link
                                  href={`/admin/scores/edit?sessionId=${session.id}`}
                                  className="inline-flex items-center rounded-full border border-forest/30 px-3 py-1 text-xs font-semibold text-forest transition hover:bg-forest/10"
                                >
                                  수정
                                </Link>
                              ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {sessions.length === 200 && (
              <p className="border-t border-ink/10 px-6 py-3 text-xs text-slate">
                최대 200건이 표시됩니다. 필터를 사용해 범위를 좁혀주세요.
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
