import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import Link from "next/link";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function formatDateKR(d: Date) {
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

function formatDateTimeKR(d: Date) {
  return `${formatDateKR(d)} ${d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: "Asia/Seoul" })}`;
}

function isoDate(d: Date) {
  return d.toISOString().split("T")[0];
}

// Score-related action types we recognize in AuditLog
const SCORE_ACTIONS = [
  "SCORE_CREATE",
  "SCORE_UPDATE",
  "SCORE_DELETE",
  "SCORE_BULK_UPDATE",
  "SCORE_BULK_CREATE",
] as const;
type ScoreAction = (typeof SCORE_ACTIONS)[number];

const SCORE_ACTION_LABEL: Record<ScoreAction, string> = {
  SCORE_CREATE: "성적 생성",
  SCORE_UPDATE: "성적 수정",
  SCORE_DELETE: "성적 삭제",
  SCORE_BULK_UPDATE: "일괄 수정",
  SCORE_BULK_CREATE: "일괄 생성",
};

function getScoreValue(json: unknown): string {
  if (json === null || json === undefined) return "—";
  if (typeof json === "object" && json !== null) {
    const obj = json as Record<string, unknown>;
    const score =
      obj.finalScore ?? obj.rawScore ?? obj.score ?? obj.oxScore ?? null;
    if (score !== null && score !== undefined) return String(score);
    return JSON.stringify(json).slice(0, 40);
  }
  return String(json);
}

function getSubjectFromJson(json: unknown): string {
  if (json === null || json === undefined) return "—";
  if (typeof json === "object" && json !== null) {
    const obj = json as Record<string, unknown>;
    return obj.subject ? String(obj.subject) : "—";
  }
  return "—";
}

function getNoteFromJson(json: unknown): string {
  if (json === null || json === undefined) return "";
  if (typeof json === "object" && json !== null) {
    const obj = json as Record<string, unknown>;
    return obj.note ? String(obj.note) : "";
  }
  return "";
}

function getExamNumberFromJson(targetId: string, json: unknown): string {
  // targetId may be the score id; check after/before for examNumber
  if (typeof json === "object" && json !== null) {
    const obj = json as Record<string, unknown>;
    if (obj.examNumber) return String(obj.examNumber);
  }
  return targetId;
}

export default async function ScoreAuditPage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.MANAGER);
  const prisma = getPrisma();

  const resolvedParams = searchParams ? await searchParams : {};

  const fromParam = Array.isArray(resolvedParams.from)
    ? resolvedParams.from[0]
    : resolvedParams.from;
  const toParam = Array.isArray(resolvedParams.to)
    ? resolvedParams.to[0]
    : resolvedParams.to;
  const examNumberParam = Array.isArray(resolvedParams.examNumber)
    ? resolvedParams.examNumber[0]
    : resolvedParams.examNumber;
  const actionParam = Array.isArray(resolvedParams.action)
    ? resolvedParams.action[0]
    : resolvedParams.action;

  const now = new Date();
  const defaultFrom = new Date(now);
  defaultFrom.setDate(defaultFrom.getDate() - 30);

  const fromDate = fromParam
    ? new Date(fromParam + "T00:00:00")
    : defaultFrom;
  const toDate = toParam
    ? new Date(toParam + "T23:59:59")
    : new Date(now.getTime());
  toDate.setHours(23, 59, 59, 999);

  // Check if AuditLog table exists by attempting a query
  let auditLogs: Array<{
    id: number;
    action: string;
    targetType: string;
    targetId: string;
    before: unknown;
    after: unknown;
    ipAddress: string | null;
    createdAt: Date;
    admin: { id: string; name: string; email: string };
  }> = [];
  let dbError: string | null = null;

  try {
    const where: {
      action?: { in: string[] } | string;
      createdAt?: { gte?: Date; lte?: Date };
    } = {
      action: actionParam
        ? actionParam
        : { in: [...SCORE_ACTIONS] },
      createdAt: { gte: fromDate, lte: toDate },
    };

    const rawLogs = await prisma.auditLog.findMany({
      where,
      select: {
        id: true,
        action: true,
        targetType: true,
        targetId: true,
        before: true,
        after: true,
        ipAddress: true,
        createdAt: true,
        admin: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    // Filter by examNumber if provided
    const filtered = examNumberParam
      ? rawLogs.filter((log) => {
          const examNum =
            getExamNumberFromJson(log.targetId, log.after) ||
            getExamNumberFromJson(log.targetId, log.before);
          return examNum.includes(examNumberParam);
        })
      : rawLogs;

    auditLogs = filtered;
  } catch (err) {
    dbError =
      err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.";
  }

  // KPI: today and this week counts
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - 7);
  weekStart.setHours(0, 0, 0, 0);

  const todayCount = auditLogs.filter(
    (l) => l.createdAt >= todayStart,
  ).length;
  const weekCount = auditLogs.filter((l) => l.createdAt >= weekStart).length;

  // Top editor this week
  const weekLogs = auditLogs.filter((l) => l.createdAt >= weekStart);
  const editorCount = new Map<string, { name: string; count: number }>();
  for (const log of weekLogs) {
    const existing = editorCount.get(log.admin.id) ?? {
      name: log.admin.name,
      count: 0,
    };
    existing.count++;
    editorCount.set(log.admin.id, existing);
  }
  const topEditor =
    [...editorCount.values()].sort((a, b) => b.count - a.count)[0] ?? null;

  return (
    <div className="p-8 sm:p-10">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
            아침 모의고사
          </div>
          <h1 className="mt-5 text-3xl font-semibold text-ink">
            성적 수정 이력
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-8 text-slate">
            관리자의 성적 입력·수정·삭제 이력을 조회합니다. (MANAGER 이상)
          </p>
        </div>
      </div>

      {/* Filter Form */}
      <form method="get" className="mt-8">
        <div className="flex flex-wrap items-end gap-4 rounded-[28px] border border-ink/10 bg-mist p-6">
          <div>
            <label className="mb-2 block text-sm font-medium text-ink">
              시작 날짜
            </label>
            <input
              type="date"
              name="from"
              defaultValue={isoDate(fromDate)}
              className="rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-ink">
              종료 날짜
            </label>
            <input
              type="date"
              name="to"
              defaultValue={isoDate(toDate)}
              className="rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-ink">
              학번
            </label>
            <input
              type="text"
              name="examNumber"
              defaultValue={examNumberParam ?? ""}
              placeholder="학번 검색..."
              className="rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm w-32"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-ink">
              액션 유형
            </label>
            <select
              name="action"
              defaultValue={actionParam ?? ""}
              className="rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
            >
              <option value="">전체</option>
              {SCORE_ACTIONS.map((a) => (
                <option key={a} value={a}>
                  {SCORE_ACTION_LABEL[a]}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="inline-flex items-center rounded-full bg-ink px-6 py-3 text-sm font-semibold text-white transition hover:bg-forest"
          >
            조회
          </button>
        </div>
      </form>

      {/* DB Error: graceful fallback */}
      {dbError && (
        <div className="mt-8 rounded-[28px] border border-amber-200 bg-amber-50 p-8 text-center">
          <p className="text-base font-semibold text-amber-700">
            감사 로그 기능은 준비 중입니다
          </p>
          <p className="mt-2 text-sm text-amber-600">
            성적 수정 이력 조회를 위한 감사 로그가 아직 수집되지 않았습니다.
          </p>
          <p className="mt-4 rounded-xl bg-white p-3 font-mono text-xs text-amber-800">
            {dbError}
          </p>
        </div>
      )}

      {!dbError && (
        <>
          {/* KPI Cards */}
          <div className="mt-8 grid grid-cols-3 gap-4">
            <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate">
                오늘 수정 건
              </p>
              <p className="mt-3 text-3xl font-bold text-ink">{todayCount}</p>
              <p className="mt-1 text-xs text-slate">오늘 성적 변경</p>
            </div>
            <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate">
                이번주 수정 건
              </p>
              <p className="mt-3 text-3xl font-bold text-forest">{weekCount}</p>
              <p className="mt-1 text-xs text-slate">최근 7일</p>
            </div>
            <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate">
                주요 수정 직원
              </p>
              {topEditor ? (
                <>
                  <p className="mt-3 text-xl font-bold text-ember">
                    {topEditor.name}
                  </p>
                  <p className="mt-1 text-xs text-slate">
                    이번주 {topEditor.count}건 처리
                  </p>
                </>
              ) : (
                <p className="mt-3 text-3xl font-bold text-ink/25">—</p>
              )}
            </div>
          </div>

          {/* Table */}
          <div className="mt-8 overflow-hidden rounded-[28px] border border-ink/10 bg-white shadow-panel">
            <div className="border-b border-ink/10 px-6 py-4">
              <h2 className="text-base font-semibold text-ink">
                성적 수정 이력
              </h2>
              <p className="text-xs text-slate">
                {formatDateKR(fromDate)} ~ {formatDateKR(toDate)} ·{" "}
                {auditLogs.length}건
                {auditLogs.length >= 200 && " (최대 200건 표시)"}
              </p>
            </div>

            {auditLogs.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <p className="text-sm font-semibold text-slate">
                  데이터 없음
                </p>
                <p className="mt-2 text-xs text-slate">
                  선택한 기간에 성적 수정 이력이 없습니다.
                </p>
                <p className="mt-1 text-xs text-slate/60">
                  성적 입력·수정·삭제 시 자동으로 기록됩니다.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-ink/10 bg-mist">
                      <th className="px-4 py-3 text-left font-semibold text-ink/60">
                        일시
                      </th>
                      <th className="px-4 py-3 text-left font-semibold text-ink/60">
                        담당자
                      </th>
                      <th className="px-4 py-3 text-left font-semibold text-ink/60">
                        학번
                      </th>
                      <th className="px-4 py-3 text-left font-semibold text-ink/60">
                        과목
                      </th>
                      <th className="px-4 py-3 text-right font-semibold text-ink/60">
                        이전 점수
                      </th>
                      <th className="px-4 py-3 text-right font-semibold text-ink/60">
                        수정 점수
                      </th>
                      <th className="px-4 py-3 text-left font-semibold text-ink/60">
                        수정 사유
                      </th>
                      <th className="px-4 py-3 text-center font-semibold text-ink/60">
                        액션
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink/5">
                    {auditLogs.map((log) => {
                      const examNum = getExamNumberFromJson(
                        log.targetId,
                        log.after ?? log.before,
                      );
                      const subjectBefore = getSubjectFromJson(log.before);
                      const subjectAfter = getSubjectFromJson(log.after);
                      const subject =
                        subjectAfter !== "—" ? subjectAfter : subjectBefore;
                      const oldScore = getScoreValue(log.before);
                      const newScore = getScoreValue(log.after);
                      const note =
                        getNoteFromJson(log.after) ||
                        getNoteFromJson(log.before);
                      const actionLabel =
                        SCORE_ACTION_LABEL[log.action as ScoreAction] ??
                        log.action;
                      const isUpdate =
                        log.action === "SCORE_UPDATE" ||
                        log.action === "SCORE_BULK_UPDATE";

                      return (
                        <tr key={log.id} className="hover:bg-mist/60">
                          <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate">
                            {formatDateTimeKR(log.createdAt)}
                          </td>
                          <td className="px-4 py-3 text-ink">
                            <span className="font-medium">
                              {log.admin.name}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {examNum && examNum !== log.targetId ? (
                              <Link
                                href={`/admin/students/${examNum}`}
                                className="font-mono text-forest hover:underline"
                              >
                                {examNum}
                              </Link>
                            ) : (
                              <span className="font-mono text-slate">
                                {log.targetId}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-ink">{subject}</td>
                          <td className="px-4 py-3 text-right font-mono text-slate">
                            {isUpdate ? oldScore : "—"}
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-semibold text-ink">
                            {newScore}
                          </td>
                          <td className="max-w-xs truncate px-4 py-3 text-xs text-slate">
                            {note || "—"}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                                log.action === "SCORE_DELETE"
                                  ? "bg-red-100 text-red-700"
                                  : log.action === "SCORE_CREATE" ||
                                      log.action === "SCORE_BULK_CREATE"
                                    ? "bg-forest/10 text-forest"
                                    : "bg-amber-100 text-amber-700"
                              }`}
                            >
                              {actionLabel}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Empty state message when no score-specific audit logs exist */}
          {auditLogs.length === 0 && (
            <div className="mt-6 rounded-[28px] border border-dashed border-ink/10 bg-mist p-8 text-center">
              <p className="text-sm font-semibold text-slate">
                감사 로그 기능은 준비 중입니다
              </p>
              <p className="mt-2 text-xs text-slate">
                성적 수정 이력은 관리자가 성적을 입력·수정·삭제할 때 자동으로
                기록됩니다.
              </p>
              <p className="mt-1 text-xs text-slate/60">
                현재 선택한 기간 및 조건에 해당하는 이력이 없습니다.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
