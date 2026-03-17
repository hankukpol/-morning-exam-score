import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminRole, AttendType } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { EXAM_TYPE_LABEL } from "@/lib/constants";

export const dynamic = "force-dynamic";

const ATTEND_TYPE_LABEL: Record<AttendType, string> = {
  NORMAL: "출석",
  LIVE: "라이브",
  EXCUSED: "사유 결시",
  ABSENT: "결석",
};

const ATTEND_TYPE_COLOR: Record<AttendType, string> = {
  NORMAL: "bg-forest/10 text-forest border-forest/20",
  LIVE: "bg-sky-50 text-sky-700 border-sky-200",
  EXCUSED: "bg-amber-50 text-amber-700 border-amber-200",
  ABSENT: "bg-red-50 text-red-600 border-red-200",
};

const DAY_KO = ["일", "월", "화", "수", "목", "금", "토"] as const;

function formatAttendDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const dow = DAY_KO[d.getDay()];
  return `${y}-${m}-${day}(${dow})`;
}

const SUB_NAV = [
  { href: "enrollments", label: "수업" },
  { href: "payments", label: "수납" },
  { href: "scores", label: "성적" },
  { href: "attendance", label: "출결" },
] as const;

type PageProps = {
  params: Promise<{ examNumber: string }>;
};

export default async function StudentAttendancePage({ params }: PageProps) {
  const { examNumber } = await params;

  await requireAdminContext(AdminRole.TEACHER);

  // Fetch student basic info
  const student = await getPrisma().student.findUnique({
    where: { examNumber },
    select: {
      examNumber: true,
      name: true,
      examType: true,
      className: true,
      generation: true,
      isActive: true,
    },
  });

  if (!student) notFound();

  // Fetch all attendance logs (no date limit — full history)
  const logs = await getPrisma().classroomAttendanceLog.findMany({
    where: { examNumber },
    include: {
      classroom: { select: { name: true, generation: true } },
    },
    orderBy: { attendDate: "desc" },
  });

  // ── KPI calculations ─────────────────────────────────────────────────────
  const total = logs.length;

  const counts: Record<AttendType, number> = {
    NORMAL: 0,
    LIVE: 0,
    EXCUSED: 0,
    ABSENT: 0,
  };
  for (const log of logs) {
    counts[log.attendType]++;
  }

  // 출석률 = (NORMAL + LIVE + EXCUSED) / total
  const presentCount = counts.NORMAL + counts.LIVE + counts.EXCUSED;
  const attendanceRate =
    total > 0 ? Math.round((presentCount / total) * 1000) / 10 : null;

  // Late / tardy proxy: LIVE counts as "라이브" not late in this system
  // Use ABSENT as absence count
  const absentCount = counts.ABSENT;
  const liveCount = counts.LIVE;

  return (
    <div className="p-8 sm:p-10">
      {/* ── 헤더 ────────────────────────────────────────────────────────── */}
      <div>
        <Link
          href={`/admin/students/${examNumber}`}
          className="text-sm text-slate transition hover:text-ember"
        >
          ← {student.name} ({examNumber})
        </Link>
        <h1 className="mt-3 text-3xl font-semibold">
          {student.name}
          <span className="ml-3 text-xl font-normal text-slate">
            {examNumber}
          </span>
        </h1>
        <p className="mt-1 text-sm text-slate">
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

      {/* ── 서브 내비게이션 ──────────────────────────────────────────────── */}
      <div className="mt-6 flex gap-1 border-b border-ink/10">
        {SUB_NAV.map((item) => {
          const active = item.href === "attendance";
          return (
            <Link
              key={item.href}
              href={`/admin/students/${examNumber}/${item.href}`}
              className={`rounded-t-2xl px-5 py-2.5 text-sm font-semibold transition ${
                active
                  ? "-mb-px border border-b-white border-ink/10 bg-white text-ink"
                  : "text-slate hover:text-ink"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>

      {/* ── KPI 카드 ─────────────────────────────────────────────────────── */}
      <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* 출석률 */}
        <article className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">
            출석률
          </p>
          <p
            className={`mt-3 text-3xl font-semibold ${
              attendanceRate === null
                ? "text-slate"
                : attendanceRate >= 90
                  ? "text-forest"
                  : attendanceRate >= 70
                    ? "text-amber-600"
                    : "text-red-600"
            }`}
          >
            {attendanceRate !== null ? `${attendanceRate}%` : "—"}
          </p>
          <p className="mt-1 text-xs text-slate">전체 출결 대비</p>
        </article>

        {/* 총 출결 일수 */}
        <article className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">
            총 출결 일수
          </p>
          <p className="mt-3 text-3xl font-semibold text-ink">
            {total}
            <span className="ml-1 text-base font-normal text-slate">일</span>
          </p>
          <p className="mt-1 text-xs text-slate">전체 기간 누적</p>
        </article>

        {/* 결석 횟수 */}
        <article
          className={`rounded-[28px] border p-6 shadow-panel ${
            absentCount > 0
              ? "border-red-200 bg-red-50/60"
              : "border-ink/10 bg-white"
          }`}
        >
          <p
            className={`text-xs font-semibold uppercase tracking-[0.18em] ${
              absentCount > 0 ? "text-red-600" : "text-slate"
            }`}
          >
            결석
          </p>
          <p
            className={`mt-3 text-3xl font-semibold ${
              absentCount > 0 ? "text-red-600" : "text-ink"
            }`}
          >
            {absentCount}
            <span className="ml-1 text-base font-normal text-slate">회</span>
          </p>
          <p className="mt-1 text-xs text-slate">무단 결석 (ABSENT)</p>
        </article>

        {/* 라이브 횟수 */}
        <article className="rounded-[28px] border border-sky-200 bg-sky-50/60 p-6 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
            라이브
          </p>
          <p className="mt-3 text-3xl font-semibold text-sky-700">
            {liveCount}
            <span className="ml-1 text-base font-normal text-sky-500">회</span>
          </p>
          <p className="mt-1 text-xs text-sky-600">라이브 출결 (LIVE)</p>
        </article>
      </section>

      {/* ── 출결 유형 요약 ───────────────────────────────────────────────── */}
      {total > 0 && (
        <section className="mt-6 grid gap-4 sm:grid-cols-4">
          {(["NORMAL", "LIVE", "EXCUSED", "ABSENT"] as AttendType[]).map(
            (type) => (
              <div
                key={type}
                className={`flex items-center justify-between rounded-2xl border px-5 py-3 ${ATTEND_TYPE_COLOR[type]}`}
              >
                <span className="text-sm font-semibold">
                  {ATTEND_TYPE_LABEL[type]}
                </span>
                <span className="text-lg font-bold">
                  {counts[type]}
                  <span className="ml-0.5 text-xs font-normal">일</span>
                </span>
              </div>
            ),
          )}
        </section>
      )}

      {/* ── 출결 로그 테이블 ─────────────────────────────────────────────── */}
      <section className="mt-8">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-slate">
          전체 출결 이력
        </h2>

        {logs.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-ink/10 p-12 text-center text-sm text-slate">
            출결 기록이 없습니다.
          </div>
        ) : (
          <div className="rounded-[28px] border border-ink/10 bg-white shadow-panel">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <thead>
                  <tr className="border-b border-ink/10 text-left text-xs text-slate">
                    <th className="px-6 py-3 font-semibold">날짜</th>
                    <th className="px-4 py-3 font-semibold">담임반</th>
                    <th className="px-4 py-3 font-semibold">출결</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5">
                  {logs.map((log) => (
                    <tr
                      key={log.id}
                      className="transition hover:bg-mist/40"
                    >
                      <td className="px-6 py-3 font-mono text-xs text-ink">
                        {formatAttendDate(new Date(log.attendDate))}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate">
                        {log.classroom
                          ? `${log.classroom.name}${log.classroom.generation ? ` ${log.classroom.generation}기` : ""}`
                          : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${ATTEND_TYPE_COLOR[log.attendType]}`}
                        >
                          {ATTEND_TYPE_LABEL[log.attendType]}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {logs.length > 100 && (
              <p className="border-t border-ink/10 px-6 py-3 text-xs text-slate">
                총 {logs.length}건의 출결 기록이 있습니다.
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
