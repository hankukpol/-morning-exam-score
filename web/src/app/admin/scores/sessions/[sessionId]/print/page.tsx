import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminRole, AttendType } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { EXAM_TYPE_LABEL, SUBJECT_LABEL, ATTEND_TYPE_LABEL } from "@/lib/constants";
import { ScorePrintButton } from "./print-button";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ sessionId: string }> };

function formatDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
  return `${year}년 ${month}월 ${day}일 (${weekdays[d.getDay()]})`;
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

export default async function ScoreSessionPrintPage({ params }: PageProps) {
  const { sessionId } = await params;
  await requireAdminContext(AdminRole.TEACHER);

  const sessionIdNum = Number(sessionId);
  if (!Number.isFinite(sessionIdNum) || sessionIdNum <= 0) notFound();

  const session = await getPrisma().examSession.findUnique({
    where: { id: sessionIdNum },
    include: {
      scores: {
        include: {
          student: {
            select: { name: true, examNumber: true },
          },
        },
        orderBy: [{ finalScore: "desc" }],
      },
      period: { select: { name: true } },
    },
  });

  if (!session) notFound();

  // Assign dense rank to scores that have finalScore and are NORMAL or LIVE
  type ScoreWithRank = (typeof session.scores)[number] & { rank: number | null };

  let currentRank = 0;
  let prevScore: number | null = undefined as unknown as number | null;

  const rankedScores: ScoreWithRank[] = session.scores.map((s) => {
    let rank: number | null = null;
    if (
      s.finalScore !== null &&
      s.finalScore !== undefined &&
      (s.attendType === AttendType.NORMAL || s.attendType === AttendType.LIVE)
    ) {
      if (s.finalScore !== prevScore) {
        currentRank += 1;
        prevScore = s.finalScore;
      }
      rank = currentRank;
    }
    return { ...s, rank };
  });

  const subjectLabel =
    session.displaySubjectName?.trim() ||
    SUBJECT_LABEL[session.subject] ||
    session.subject;

  const examTypeLabel =
    EXAM_TYPE_LABEL[session.examType as keyof typeof EXAM_TYPE_LABEL] ??
    session.examType;

  const chunks = chunkArray(rankedScores, 50);

  const printDate = new Date().toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="min-h-screen bg-gray-100">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; margin: 0; padding: 0; }
          .print-root { background: white !important; padding: 0 !important; }
          .print-sheet {
            box-shadow: none !important;
            border-radius: 0 !important;
            margin: 0 !important;
          }
          .page-break { page-break-before: always; }
          @page { size: A4; margin: 12mm 10mm; }
        }
      `}</style>

      {/* Screen-only toolbar */}
      <div className="no-print flex items-center justify-between gap-4 border-b bg-white px-6 py-4 shadow-sm">
        <Link
          href={`/admin/scores/sessions/${sessionId}`}
          className="inline-flex items-center gap-2 rounded-full border border-ink/20 px-4 py-2 text-sm font-semibold text-slate transition hover:border-ink/40 hover:text-ink"
        >
          ← 성적 상세
        </Link>
        <span className="text-sm text-slate">
          {session.period.name} &middot; {subjectLabel} &middot; {formatDate(session.examDate)}
        </span>
        <ScorePrintButton />
      </div>

      {/* Print content */}
      <div className="print-root p-8">
        {chunks.map((chunk, chunkIdx) => (
          <div
            key={chunkIdx}
            className={`print-sheet mx-auto mb-8 w-full max-w-4xl rounded-[12px] bg-white px-10 py-8 shadow-xl ${
              chunkIdx > 0 ? "page-break" : ""
            }`}
            style={{
              fontFamily:
                "'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif",
            }}
          >
            {/* Document header — shown on every page chunk */}
            <div className="mb-6 border-b-2 border-ink pb-5 text-center">
              <div className="text-xl font-bold tracking-tight text-ink">
                한국경찰학원
              </div>
              <div className="mt-1 text-lg font-semibold text-ink">
                {subjectLabel} 성적표
              </div>
              <div className="mt-1 text-sm text-slate">
                {session.period.name} &nbsp;|&nbsp; {examTypeLabel} &nbsp;|&nbsp;{" "}
                {formatDate(session.examDate)} &nbsp;|&nbsp; 총{" "}
                {rankedScores.length}명
                {chunks.length > 1 && (
                  <span className="ml-2 text-xs text-slate/60">
                    ({chunkIdx + 1}/{chunks.length} 페이지)
                  </span>
                )}
              </div>
            </div>

            {/* Score table */}
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-ink text-white">
                  <th className="border border-ink/20 px-3 py-2 text-center text-xs font-semibold tracking-wide">
                    석차
                  </th>
                  <th className="border border-ink/20 px-3 py-2 text-left text-xs font-semibold tracking-wide">
                    학번
                  </th>
                  <th className="border border-ink/20 px-3 py-2 text-left text-xs font-semibold tracking-wide">
                    이름
                  </th>
                  <th className="border border-ink/20 px-3 py-2 text-right text-xs font-semibold tracking-wide">
                    원점수
                  </th>
                  <th className="border border-ink/20 px-3 py-2 text-right text-xs font-semibold tracking-wide">
                    OX 점수
                  </th>
                  <th className="border border-ink/20 px-3 py-2 text-right text-xs font-semibold tracking-wide">
                    최종점수
                  </th>
                  <th className="border border-ink/20 px-3 py-2 text-center text-xs font-semibold tracking-wide">
                    출결
                  </th>
                </tr>
              </thead>
              <tbody>
                {chunk.map((row, rowIdx) => {
                  const isAbsent =
                    row.attendType === AttendType.ABSENT ||
                    row.attendType === AttendType.EXCUSED;
                  return (
                    <tr
                      key={row.id}
                      className={`${
                        (chunkIdx * 50 + rowIdx) % 2 === 0
                          ? "bg-white"
                          : "bg-gray-50/60"
                      } ${isAbsent ? "opacity-60" : ""}`}
                    >
                      <td className="border border-ink/10 px-3 py-2 text-center font-mono font-semibold text-slate">
                        {row.rank !== null ? `${row.rank}위` : "—"}
                      </td>
                      <td className="border border-ink/10 px-3 py-2 font-mono text-xs text-slate">
                        {row.student.examNumber}
                      </td>
                      <td className="border border-ink/10 px-3 py-2 font-medium text-ink">
                        {row.student.name}
                      </td>
                      <td className="border border-ink/10 px-3 py-2 text-right font-mono text-slate">
                        {row.rawScore !== null && row.rawScore !== undefined
                          ? row.rawScore
                          : "—"}
                      </td>
                      <td className="border border-ink/10 px-3 py-2 text-right font-mono text-slate">
                        {row.oxScore !== null && row.oxScore !== undefined
                          ? row.oxScore
                          : "—"}
                      </td>
                      <td className="border border-ink/10 px-3 py-2 text-right font-mono font-bold text-ink">
                        {row.finalScore !== null && row.finalScore !== undefined
                          ? row.finalScore
                          : "—"}
                      </td>
                      <td className="border border-ink/10 px-3 py-2 text-center text-xs text-slate">
                        {ATTEND_TYPE_LABEL[row.attendType] ?? row.attendType}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Footer */}
            <div className="mt-4 flex items-center justify-between text-xs text-slate/60">
              <span>
                한국경찰학원 · 대구광역시 중구 중앙대로 390 센트럴엠빌딩 · Tel: 053-241-0112
              </span>
              <span>인쇄일: {printDate}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
