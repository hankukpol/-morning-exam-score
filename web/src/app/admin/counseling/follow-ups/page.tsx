import Link from "next/link";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function formatDate(date: Date): string {
  return date.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export default async function CounselingFollowUpsPage() {
  await requireAdminContext(AdminRole.COUNSELOR);

  const prisma = getPrisma();

  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);
  const weekEnd = new Date(now);
  weekEnd.setDate(now.getDate() + 7);
  weekEnd.setHours(23, 59, 59, 999);

  // Records where nextSchedule is set and falls within today + 7 days (includes overdue)
  const followUpRecords = await prisma.counselingRecord.findMany({
    where: {
      nextSchedule: {
        not: null,
        lte: weekEnd,
      },
    },
    include: {
      student: {
        select: {
          examNumber: true,
          name: true,
          phone: true,
          examType: true,
        },
      },
    },
    orderBy: { nextSchedule: "asc" },
  });

  // Also include records with nextSchedule past 7 days if overdue (extra safety: already covered by lte weekEnd with no gte)
  // Actually we need overdue too: get all with nextSchedule < todayStart that are NOT in followUpRecords
  const overdueRecords = await prisma.counselingRecord.findMany({
    where: {
      nextSchedule: {
        not: null,
        lt: todayStart,
      },
    },
    include: {
      student: {
        select: {
          examNumber: true,
          name: true,
          phone: true,
          examType: true,
        },
      },
    },
    orderBy: { nextSchedule: "asc" },
  });

  // Combine: overdue + within-7-days (from followUpRecords, which already includes today and next 7 days from now)
  // followUpRecords has nextSchedule <= weekEnd (includes overdue before now as well if lte weekEnd includes past dates)
  // Re-query cleanly: all records with nextSchedule set, split by category
  const allFollowUpIds = new Set<number>();

  type FollowUpRecord = {
    id: number;
    examNumber: string;
    counselorName: string;
    content: string;
    counseledAt: Date;
    nextSchedule: Date;
    student: {
      examNumber: string;
      name: string;
      phone: string | null;
      examType: string;
    };
  };

  // Build distinct lists
  const overdueList: FollowUpRecord[] = [];
  const todayList: FollowUpRecord[] = [];
  const thisWeekList: FollowUpRecord[] = [];

  // Process overdue (nextSchedule < todayStart)
  for (const rec of overdueRecords) {
    if (!rec.nextSchedule) continue;
    if (allFollowUpIds.has(rec.id)) continue;
    allFollowUpIds.add(rec.id);
    overdueList.push({
      id: rec.id,
      examNumber: rec.examNumber,
      counselorName: rec.counselorName,
      content: rec.content,
      counseledAt: rec.counseledAt,
      nextSchedule: rec.nextSchedule,
      student: rec.student,
    });
  }

  // Process today and this-week
  for (const rec of followUpRecords) {
    if (!rec.nextSchedule) continue;
    if (allFollowUpIds.has(rec.id)) continue;
    allFollowUpIds.add(rec.id);
    const entry: FollowUpRecord = {
      id: rec.id,
      examNumber: rec.examNumber,
      counselorName: rec.counselorName,
      content: rec.content,
      counseledAt: rec.counseledAt,
      nextSchedule: rec.nextSchedule,
      student: rec.student,
    };
    if (isSameDay(rec.nextSchedule, now)) {
      todayList.push(entry);
    } else if (rec.nextSchedule >= todayStart) {
      thisWeekList.push(entry);
    }
    // nextSchedule < todayStart already handled via overdueRecords
  }

  const totalCount = overdueList.length + todayList.length + thisWeekList.length;

  return (
    <div className="p-8 sm:p-10">
      {/* Header */}
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        상담 관리
      </div>
      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">후속 연락 대상</h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-slate">
            연락 예정 또는 기한이 지난 상담 내역을 확인합니다. 면담 기록의
            &apos;다음 면담 예정일&apos;이 설정된 건을 기준으로 오늘 기준 7일
            이내와 기한 초과 항목을 표시합니다.
          </p>
        </div>
        <Link
          href="/admin/counseling"
          className="inline-flex items-center rounded-full border border-ink/10 px-5 py-2.5 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
        >
          ← 면담 허브
        </Link>
      </div>

      {/* KPI row */}
      <section className="mt-8 grid gap-4 sm:grid-cols-3">
        <article
          className={`rounded-[28px] border p-6 ${
            overdueList.length > 0
              ? "border-red-200 bg-red-50"
              : "border-ink/10 bg-white"
          }`}
        >
          <p className="text-sm text-slate">기한 초과</p>
          <p
            className={`mt-3 text-3xl font-semibold ${
              overdueList.length > 0 ? "text-red-600" : ""
            }`}
          >
            {overdueList.length}
            <span className="ml-1 text-base font-normal text-slate">건</span>
          </p>
          <p className="mt-2 text-xs text-slate">
            예정일이 지났지만 아직 미완료
          </p>
        </article>

        <article
          className={`rounded-[28px] border p-6 ${
            todayList.length > 0
              ? "border-amber-200 bg-amber-50"
              : "border-ink/10 bg-white"
          }`}
        >
          <p className="text-sm text-slate">오늘 연락 예정</p>
          <p
            className={`mt-3 text-3xl font-semibold ${
              todayList.length > 0 ? "text-amber-700" : ""
            }`}
          >
            {todayList.length}
            <span className="ml-1 text-base font-normal text-slate">건</span>
          </p>
          <p className="mt-2 text-xs text-slate">오늘 연락 예정된 상담 건수</p>
        </article>

        <article className="rounded-[28px] border border-ink/10 bg-white p-6">
          <p className="text-sm text-slate">이번 주 예정</p>
          <p className="mt-3 text-3xl font-semibold">
            {thisWeekList.length}
            <span className="ml-1 text-base font-normal text-slate">건</span>
          </p>
          <p className="mt-2 text-xs text-slate">7일 내 예정된 후속 연락</p>
        </article>
      </section>

      {totalCount === 0 ? (
        <div className="mt-10 rounded-[28px] border border-dashed border-ink/10 p-12 text-center text-sm text-slate">
          후속 연락이 필요한 상담 기록이 없습니다.
        </div>
      ) : (
        <div className="mt-10 space-y-10">
          {/* Overdue section */}
          {overdueList.length > 0 ? (
            <section>
              <div className="mb-4 flex items-center gap-3">
                <h2 className="text-xl font-semibold text-red-600">
                  기한 초과
                </h2>
                <span className="rounded-full border border-red-200 bg-red-50 px-3 py-0.5 text-xs font-semibold text-red-600">
                  {overdueList.length}건
                </span>
              </div>
              <p className="mb-5 text-sm text-slate">
                예정일이 지났지만 아직 후속 면담이 이루어지지 않은 건입니다.
                빠르게 연락해 주세요.
              </p>
              <div className="space-y-3">
                {overdueList.map((rec) => (
                  <FollowUpCard
                    key={rec.id}
                    rec={rec}
                    variant="overdue"
                  />
                ))}
              </div>
            </section>
          ) : null}

          {/* Today section */}
          {todayList.length > 0 ? (
            <section>
              <div className="mb-4 flex items-center gap-3">
                <h2 className="text-xl font-semibold text-amber-700">
                  오늘 연락 예정
                </h2>
                <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-0.5 text-xs font-semibold text-amber-700">
                  {todayList.length}건
                </span>
              </div>
              <p className="mb-5 text-sm text-slate">
                오늘 연락하기로 예정된 후속 상담 건입니다.
              </p>
              <div className="space-y-3">
                {todayList.map((rec) => (
                  <FollowUpCard
                    key={rec.id}
                    rec={rec}
                    variant="today"
                  />
                ))}
              </div>
            </section>
          ) : null}

          {/* This week section */}
          {thisWeekList.length > 0 ? (
            <section>
              <div className="mb-4 flex items-center gap-3">
                <h2 className="text-xl font-semibold">이번 주 예정</h2>
                <span className="rounded-full border border-ink/10 bg-mist px-3 py-0.5 text-xs font-semibold text-slate">
                  {thisWeekList.length}건
                </span>
              </div>
              <p className="mb-5 text-sm text-slate">
                7일 이내 후속 연락이 예정된 상담 건입니다.
              </p>
              <div className="space-y-3">
                {thisWeekList.map((rec) => (
                  <FollowUpCard
                    key={rec.id}
                    rec={rec}
                    variant="week"
                  />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}

// ── Sub-component ──────────────────────────────────────────

type FollowUpCardProps = {
  rec: {
    id: number;
    examNumber: string;
    counselorName: string;
    content: string;
    counseledAt: Date;
    nextSchedule: Date;
    student: {
      examNumber: string;
      name: string;
      phone: string | null;
      examType: string;
    };
  };
  variant: "overdue" | "today" | "week";
};

function FollowUpCard({ rec, variant }: FollowUpCardProps) {
  const borderClass =
    variant === "overdue"
      ? "border-red-200 bg-red-50/40 hover:border-red-400"
      : variant === "today"
        ? "border-amber-200 bg-amber-50/40 hover:border-amber-400"
        : "border-ink/10 bg-white hover:border-ink/20";

  const badgeClass =
    variant === "overdue"
      ? "border-red-200 bg-red-100 text-red-700"
      : variant === "today"
        ? "border-amber-200 bg-amber-100 text-amber-700"
        : "border-ink/10 bg-mist text-slate";

  const badgeLabel =
    variant === "overdue"
      ? "기한 초과"
      : variant === "today"
        ? "오늘 예정"
        : "이번 주";

  const snippet =
    rec.content.length > 80 ? rec.content.slice(0, 80) + "..." : rec.content;

  return (
    <div
      className={`rounded-[24px] border p-5 transition ${borderClass}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          {/* Top row: name, badge, phone */}
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/admin/students/${rec.student.examNumber}`}
              className="text-base font-semibold text-ink transition hover:text-ember"
            >
              {rec.student.name}
            </Link>
            <span className="text-sm text-slate">
              ({rec.student.examNumber})
            </span>
            <span
              className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${badgeClass}`}
            >
              {badgeLabel}
            </span>
            {rec.student.phone ? (
              <span className="text-sm text-slate">{rec.student.phone}</span>
            ) : (
              <span className="text-sm text-slate/50">연락처 없음</span>
            )}
          </div>

          {/* Meta row */}
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate">
            <span>
              상담일:{" "}
              <span className="font-medium text-ink">
                {formatDate(rec.counseledAt)}
              </span>
            </span>
            <span>
              후속 예정:{" "}
              <span
                className={`font-semibold ${
                  variant === "overdue"
                    ? "text-red-600"
                    : variant === "today"
                      ? "text-amber-700"
                      : "text-ink"
                }`}
              >
                {formatDate(rec.nextSchedule)}
              </span>
            </span>
            <span>
              담당:{" "}
              <span className="font-medium text-ink">{rec.counselorName}</span>
            </span>
          </div>

          {/* Content snippet */}
          <p className="mt-3 text-sm leading-6 text-slate">{snippet}</p>
        </div>

        {/* Action button */}
        <Link
          href={`/admin/counseling/${rec.id}`}
          className="inline-flex shrink-0 items-center rounded-full border border-ink/10 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:border-ember/30 hover:text-ember"
        >
          상담 상세
        </Link>
      </div>
    </div>
  );
}
