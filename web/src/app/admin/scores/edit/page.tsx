import Link from "next/link";
import { AdminRole } from "@prisma/client";
import { ScoreEditPanel } from "@/components/scores/score-edit-panel";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { filterSessionsByEnabledExamTypes } from "@/lib/periods/exam-types";
import { listPeriods } from "@/lib/periods/service";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminScoreEditPage({ searchParams }: PageProps) {
  const [, periods] = await Promise.all([
    requireAdminContext(AdminRole.TEACHER),
    listPeriods(),
  ]);

  const sp = await searchParams;
  const sessionIdParam = typeof sp.sessionId === "string" ? sp.sessionId : null;
  const initialSessionId = sessionIdParam && !isNaN(Number(sessionIdParam)) ? Number(sessionIdParam) : null;

  // Fetch lock status for pre-selected session (if any)
  let isPreSelectedLocked = false;
  let lockedSessionLabel: string | null = null;

  if (initialSessionId) {
    const session = await getPrisma().examSession.findUnique({
      where: { id: initialSessionId },
      select: {
        isLocked: true,
        lockedAt: true,
        week: true,
        subject: true,
        displaySubjectName: true,
        examDate: true,
      },
    });

    if (session?.isLocked) {
      isPreSelectedLocked = true;
      const dateStr = session.examDate.toLocaleDateString("ko-KR", {
        year: "numeric",
        month: "long",
        day: "numeric",
        weekday: "short",
      });
      const subjectName = session.displaySubjectName?.trim() || session.subject;
      lockedSessionLabel = `${dateStr} · ${session.week}주차 · ${subjectName}`;
    }
  }

  return (
    <div className="p-8 sm:p-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
            F-03b Score Edit
          </div>
          <h1 className="mt-5 text-3xl font-semibold">성적 수정</h1>
          <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
            회차를 선택해 기존 성적을 조회하고, 잘못 입력된 점수나 응시 상태를 직접 수정하거나 삭제합니다.
          </p>
        </div>
        <Link
          href="/admin/scores/input"
          className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
        >
          성적 입력 화면
        </Link>
      </div>

      {/* ── 잠금 경고 배너 (pre-selected session이 잠겨 있을 때만 표시) ── */}
      {isPreSelectedLocked && (
        <div className="mt-6 flex flex-wrap items-center gap-4 rounded-[20px] border border-amber-300 bg-amber-50 px-6 py-4 shadow-sm">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <svg
              className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <div>
              <p className="text-sm font-semibold text-amber-800">
                이 회차는 잠금 상태입니다.
              </p>
              {lockedSessionLabel && (
                <p className="mt-0.5 text-xs text-amber-700">{lockedSessionLabel}</p>
              )}
              <p className="mt-1 text-xs text-amber-700">
                성적을 수정하려면 먼저 잠금을 해제하세요. 잠금 상태에서는 조회만 가능합니다.
              </p>
            </div>
          </div>
          <Link
            href="/admin/scores/sessions"
            className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-full border border-amber-300 bg-white px-4 py-2 text-xs font-semibold text-amber-700 transition hover:bg-amber-100"
          >
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 9.9-1" />
            </svg>
            세션 목록에서 잠금 해제
          </Link>
        </div>
      )}

      <div className="mt-8">
        <ScoreEditPanel
          initialSessionId={initialSessionId}
          periods={periods.map((period) => ({
            id: period.id,
            name: period.name,
            isActive: period.isActive,
            sessions: filterSessionsByEnabledExamTypes(period, period.sessions).map((session) => ({
              id: session.id,
              examType: session.examType,
              week: session.week,
              subject: session.subject,
              displaySubjectName: session.displaySubjectName ?? null,
              examDate: session.examDate.toISOString(),
              isCancelled: session.isCancelled,
              isLocked: session.isLocked,
              lockedAt: session.lockedAt?.toISOString() ?? null,
              lockedBy: session.lockedBy ?? null,
            })),
          }))}
        />
      </div>
    </div>
  );
}
