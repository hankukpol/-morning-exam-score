import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminRole, AttendType } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { SUBJECT_LABEL, EXAM_TYPE_LABEL, ATTEND_TYPE_LABEL } from "@/lib/constants";
import { LockButton } from "./lock-button";

export const dynamic = "force-dynamic";

function formatDate(d: Date) {
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
  return `${d.getFullYear()}.${month}.${day}(${weekdays[d.getDay()]})`;
}

const ATTEND_TYPE_COLOR: Record<AttendType, string> = {
  NORMAL: "border-forest/30 bg-forest/10 text-forest",
  LIVE: "border-sky-200 bg-sky-50 text-sky-700",
  EXCUSED: "border-amber-200 bg-amber-50 text-amber-700",
  ABSENT: "border-red-200 bg-red-50 text-red-700",
};

// Score distribution in 10-point buckets (0-9, 10-19, ..., 90-100)
const DIST_BUCKETS = [
  { label: "0–9", min: 0, max: 10 },
  { label: "10–19", min: 10, max: 20 },
  { label: "20–29", min: 20, max: 30 },
  { label: "30–39", min: 30, max: 40 },
  { label: "40–49", min: 40, max: 50 },
  { label: "50–59", min: 50, max: 60 },
  { label: "60–69", min: 60, max: 70 },
  { label: "70–79", min: 70, max: 80 },
  { label: "80–89", min: 80, max: 90 },
  { label: "90–100", min: 90, max: 101 },
];

export default async function SessionDetailPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const id = parseInt(sessionId, 10);

  const { adminUser } = await requireAdminContext(AdminRole.TEACHER);
  const managerRoles: AdminRole[] = [
    AdminRole.MANAGER,
    AdminRole.DEPUTY_DIRECTOR,
    AdminRole.DIRECTOR,
    AdminRole.SUPER_ADMIN,
  ];
  const isManager = managerRoles.includes(adminUser.role);

  if (isNaN(id)) notFound();

  const prisma = getPrisma();

  const session = await prisma.examSession.findUnique({
    where: { id },
    select: {
      id: true,
      examType: true,
      week: true,
      subject: true,
      displaySubjectName: true,
      examDate: true,
      isCancelled: true,
      isLocked: true,
      lockedBy: true,
      lockedAt: true,
      period: {
        select: {
          id: true,
          name: true,
          isActive: true,
        },
      },
      scores: {
        select: {
          examNumber: true,
          finalScore: true,
          rawScore: true,
          attendType: true,
          note: true,
          student: {
            select: {
              name: true,
            },
          },
        },
        orderBy: { examNumber: "asc" },
      },
    },
  });

  if (!session) notFound();

  const subjectLabel =
    session.displaySubjectName?.trim() ||
    SUBJECT_LABEL[session.subject] ||
    session.subject;

  // Compute stats
  const validAttendTypes = [AttendType.NORMAL, AttendType.LIVE] as AttendType[];
  const absentTypes = [AttendType.ABSENT, AttendType.EXCUSED] as AttendType[];

  const presentScores = session.scores.filter((s) =>
    validAttendTypes.includes(s.attendType),
  );
  const absentScores = session.scores.filter((s) =>
    absentTypes.includes(s.attendType),
  );

  const scoreValues = presentScores
    .map((s) => s.finalScore ?? s.rawScore)
    .filter((v): v is number => v !== null && v !== undefined);

  const avgScore =
    scoreValues.length > 0
      ? Math.round(
          (scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length) * 10,
        ) / 10
      : null;

  // Build ranked list (only present students get numeric rank)
  type ScoreRow = {
    rank: number | null;
    examNumber: string;
    name: string;
    score: number | null;
    attendType: AttendType;
    note: string | null;
  };

  // Sort present by score desc, then absent alphabetically
  const presentSorted = [...presentScores].sort((a, b) => {
    const sa = a.finalScore ?? a.rawScore ?? -1;
    const sb = b.finalScore ?? b.rawScore ?? -1;
    return sb - sa;
  });

  const absentSorted = [...absentScores].sort((a, b) =>
    a.examNumber.localeCompare(b.examNumber),
  );

  const rows: ScoreRow[] = [
    ...presentSorted.map((s, i) => ({
      rank: i + 1,
      examNumber: s.examNumber,
      name: s.student.name,
      score: s.finalScore ?? s.rawScore ?? null,
      attendType: s.attendType,
      note: s.note,
    })),
    ...absentSorted.map((s) => ({
      rank: null,
      examNumber: s.examNumber,
      name: s.student.name,
      score: null,
      attendType: s.attendType,
      note: s.note,
    })),
  ];

  // Build distribution
  const distribution = DIST_BUCKETS.map((b) => ({
    label: b.label,
    count: scoreValues.filter((v) => v >= b.min && v < b.max).length,
  }));
  const maxDistCount = Math.max(...distribution.map((d) => d.count), 1);

  return (
    <div className="p-8 sm:p-10">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
            시험 회차 상세
          </div>
          <h1 className="mt-5 text-3xl font-semibold text-ink">
            {subjectLabel} &mdash; {session.period.name}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-slate">
            <span>{formatDate(session.examDate)}</span>
            <span className="text-ink/20">|</span>
            <span>{session.week}주차</span>
            <span className="text-ink/20">|</span>
            <span
              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                session.examType === "GONGCHAE"
                  ? "border-forest/30 bg-forest/10 text-forest"
                  : "border-ember/30 bg-ember/10 text-ember"
              }`}
            >
              {EXAM_TYPE_LABEL[session.examType]}
            </span>
            {session.isCancelled && (
              <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-600">
                취소됨
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isManager && (
            <LockButton sessionId={session.id} isLocked={session.isLocked} />
          )}
          <Link
            href="/admin/exams/morning/scores"
            className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
          >
            <svg
              className="h-3.5 w-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
            목록으로
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate">응시 인원</p>
          <p className="mt-3 text-3xl font-bold text-ink">{presentScores.length}</p>
          <p className="mt-1 text-xs text-slate">전체 {session.scores.length}명</p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate">결석</p>
          <p className="mt-3 text-3xl font-bold text-red-600">{absentScores.length}</p>
          <p className="mt-1 text-xs text-slate">무단·공결 포함</p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate">평균 점수</p>
          {avgScore !== null ? (
            <p className="mt-3 text-3xl font-bold text-forest">{avgScore}점</p>
          ) : (
            <p className="mt-3 text-3xl font-bold text-ink/25">—</p>
          )}
          <p className="mt-1 text-xs text-slate">응시자 기준</p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate">잠금 상태</p>
          {session.isLocked ? (
            <>
              <p className="mt-3 text-xl font-bold text-amber-600">잠금됨</p>
              <p className="mt-1 text-xs text-slate">
                {session.lockedAt ? formatDate(session.lockedAt) : ""}
              </p>
            </>
          ) : (
            <>
              <p className="mt-3 text-xl font-bold text-forest">열림</p>
              <p className="mt-1 text-xs text-slate">수정 가능</p>
            </>
          )}
        </div>
      </div>

      {/* Score Distribution */}
      <div className="mt-8 rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
        <h2 className="text-base font-semibold text-ink">점수 분포</h2>
        <p className="mt-1 text-xs text-slate">10점 구간별 응시자 수</p>
        <div className="mt-6 flex items-end gap-1.5">
          {distribution.map((bucket) => {
            const heightPct =
              maxDistCount > 0 ? (bucket.count / maxDistCount) * 100 : 0;
            const bucketMin = parseInt(bucket.label.split("–")[0], 10);
            const barColor =
              bucketMin >= 90
                ? "#1F4D3A"
                : bucketMin >= 80
                  ? "#4ADE80"
                  : bucketMin >= 70
                    ? "#FCD34D"
                    : bucketMin >= 60
                      ? "#FB923C"
                      : "#C55A11";
            return (
              <div key={bucket.label} className="flex flex-1 flex-col items-center gap-1">
                <span className="text-xs font-semibold text-ink">
                  {bucket.count > 0 ? bucket.count : ""}
                </span>
                <div className="w-full" style={{ height: "120px" }}>
                  <div
                    className="mx-auto w-full max-w-[32px] rounded-t-sm transition-all"
                    style={{
                      height: `${heightPct}%`,
                      backgroundColor: bucket.count > 0 ? barColor : "#e5e7eb",
                      minHeight: bucket.count > 0 ? "4px" : "0",
                    }}
                  />
                </div>
                <span
                  className="text-[10px] text-slate"
                  style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
                >
                  {bucket.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Score Table */}
      <div className="mt-8 overflow-hidden rounded-[28px] border border-ink/10 bg-white shadow-panel">
        <div className="border-b border-ink/10 px-6 py-4">
          <h2 className="text-base font-semibold text-ink">성적 목록</h2>
          <p className="text-xs text-slate">응시자 순위 기준 정렬</p>
        </div>
        {rows.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-slate">
            등록된 성적이 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink/10 bg-mist">
                  <th className="px-4 py-3 text-left font-semibold text-ink/60">순위</th>
                  <th className="px-4 py-3 text-left font-semibold text-ink/60">학번</th>
                  <th className="px-4 py-3 text-left font-semibold text-ink/60">이름</th>
                  <th className="px-4 py-3 text-right font-semibold text-ink/60">점수</th>
                  <th className="px-4 py-3 text-center font-semibold text-ink/60">유형</th>
                  <th className="px-4 py-3 text-left font-semibold text-ink/60">메모</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {rows.map((row) => (
                  <tr
                    key={row.examNumber}
                    className={`transition hover:bg-mist/60 ${
                      (row.attendType === AttendType.ABSENT ||
                        row.attendType === AttendType.EXCUSED)
                        ? "opacity-60"
                        : ""
                    }`}
                  >
                    <td className="px-4 py-3 font-mono text-slate">
                      {row.rank !== null ? (
                        <span
                          className={`font-bold ${row.rank <= 3 ? "text-ember" : "text-ink"}`}
                        >
                          {row.rank}
                        </span>
                      ) : (
                        <span className="text-ink/25">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/students/${row.examNumber}`}
                        className="font-mono text-forest hover:underline"
                      >
                        {row.examNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-medium text-ink">{row.name}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-ink">
                      {row.score !== null ? (
                        `${row.score}점`
                      ) : (
                        <span className="text-ink/25">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${ATTEND_TYPE_COLOR[row.attendType]}`}
                      >
                        {ATTEND_TYPE_LABEL[row.attendType]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate">
                      {row.note ? (
                        <span className="text-xs">{row.note}</span>
                      ) : (
                        <span className="text-ink/20">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
