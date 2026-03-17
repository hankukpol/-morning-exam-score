import { AdminRole, NotificationChannel, NotificationType } from "@prisma/client";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { NOTIFICATION_TYPE_LABEL } from "@/lib/constants";
import {
  NotificationHistoryClient,
  type NotificationLogRow,
} from "./notification-history-client";

export const dynamic = "force-dynamic";

// ─── Type filter values ───────────────────────────────────────────────────────
const TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "ALL", label: "전체 유형" },
  { value: NotificationType.ENROLLMENT_COMPLETE, label: NOTIFICATION_TYPE_LABEL.ENROLLMENT_COMPLETE },
  { value: NotificationType.PAYMENT_COMPLETE, label: NOTIFICATION_TYPE_LABEL.PAYMENT_COMPLETE },
  { value: NotificationType.REFUND_COMPLETE, label: NOTIFICATION_TYPE_LABEL.REFUND_COMPLETE },
  { value: NotificationType.WARNING_1, label: NOTIFICATION_TYPE_LABEL.WARNING_1 },
  { value: NotificationType.WARNING_2, label: NOTIFICATION_TYPE_LABEL.WARNING_2 },
  { value: NotificationType.DROPOUT, label: NOTIFICATION_TYPE_LABEL.DROPOUT },
  { value: NotificationType.ABSENCE_NOTE, label: NOTIFICATION_TYPE_LABEL.ABSENCE_NOTE },
  { value: NotificationType.POINT, label: NOTIFICATION_TYPE_LABEL.POINT },
  { value: NotificationType.NOTICE, label: NOTIFICATION_TYPE_LABEL.NOTICE },
  { value: NotificationType.SCORE_DEADLINE, label: NOTIFICATION_TYPE_LABEL.SCORE_DEADLINE },
];

// ─── Page Props ───────────────────────────────────────────────────────────────
type PageProps = {
  searchParams?: {
    page?: string;
    type?: string;
    status?: string;
    date?: string;
  };
};

// ─── Page ────────────────────────────────────────────────────────────────────
export default async function NotificationHistoryPage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.COUNSELOR);

  const page = Math.max(1, parseInt(searchParams?.page ?? "1", 10));
  const limit = 20;

  const typeParam = searchParams?.type?.trim() || "ALL";
  const statusParam = searchParams?.status?.trim() || "ALL";
  const dateParam = searchParams?.date?.trim() || "";

  const typeFilter =
    typeParam !== "ALL" &&
    Object.values(NotificationType).includes(typeParam as NotificationType)
      ? (typeParam as NotificationType)
      : undefined;

  const statusFilter = statusParam !== "ALL" ? statusParam : undefined;

  let sentAtFilter: { gte?: Date; lte?: Date } | undefined;
  if (dateParam && /^\d{4}-\d{2}$/.test(dateParam)) {
    const [year, month] = dateParam.split("-").map(Number);
    sentAtFilter = {
      gte: new Date(year, month - 1, 1, 0, 0, 0),
      lte: new Date(year, month, 0, 23, 59, 59),
    };
  }

  const where = {
    ...(typeFilter ? { type: typeFilter } : {}),
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(sentAtFilter ? { sentAt: sentAtFilter } : {}),
  };

  const prisma = getPrisma();

  // Current month KPI
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  // Last 6 months for chart
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1, 0, 0, 0);

  const [filteredTotal, logs, monthTotal, monthFail, chartRawLogs] = await Promise.all([
    prisma.notificationLog.count({ where }),
    prisma.notificationLog.findMany({
      where,
      include: {
        student: {
          select: {
            examNumber: true,
            name: true,
            phone: true,
          },
        },
      },
      orderBy: { sentAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.notificationLog.count({
      where: { sentAt: { gte: monthStart, lte: monthEnd } },
    }),
    prisma.notificationLog.count({
      where: {
        sentAt: { gte: monthStart, lte: monthEnd },
        status: "failed",
      },
    }),
    prisma.notificationLog.findMany({
      where: { sentAt: { gte: sixMonthsAgo } },
      select: { sentAt: true, status: true },
      orderBy: { sentAt: "asc" },
    }),
  ]);

  const monthSuccess = monthTotal - monthFail;
  const successRate = monthTotal > 0 ? Math.round((monthSuccess / monthTotal) * 100) : 100;
  const totalPages = Math.ceil(filteredTotal / limit);

  // Build monthly chart data
  const chartMap = new Map<string, { sent: number; failed: number }>();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    chartMap.set(key, { sent: 0, failed: 0 });
  }
  for (const log of chartRawLogs) {
    const d = log.sentAt;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (chartMap.has(key)) {
      const entry = chartMap.get(key)!;
      if (log.status === "sent") entry.sent += 1;
      else if (log.status === "failed") entry.failed += 1;
    }
  }
  const monthlyChart = Array.from(chartMap.entries()).map(([month, counts]) => ({
    month,
    ...counts,
  }));

  // Build pagination URL helper
  function pageUrl(p: number) {
    const params = new URLSearchParams();
    if (typeParam !== "ALL") params.set("type", typeParam);
    if (statusParam !== "ALL") params.set("status", statusParam);
    if (dateParam) params.set("date", dateParam);
    params.set("page", String(p));
    return `/admin/notifications/history?${params.toString()}`;
  }

  // Serialize logs for client component
  const serializedLogs: NotificationLogRow[] = logs.map((log) => ({
    id: log.id,
    type: log.type,
    channel: log.channel,
    status: log.status,
    message: log.message,
    failReason: log.failReason,
    sentAt: log.sentAt.toISOString(),
    student: {
      examNumber: log.student.examNumber,
      name: log.student.name,
      phone: log.student.phone,
    },
  }));

  return (
    <div className="p-8 sm:p-10">
      {/* Header */}
      <div className="inline-flex rounded-full border border-ink/20 bg-ink/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-slate">
        알림·공지
      </div>
      <div className="mt-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">알림 발송 이력</h1>
          <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
            카카오 알림톡·SMS 발송 이력을 조회하고 성공률을 확인합니다.
            실패 건은 재발송 버튼으로 즉시 재처리할 수 있습니다.
          </p>
        </div>
        <Link
          href="/admin/notifications/send"
          className="flex-shrink-0 inline-flex items-center rounded-full bg-ember px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-ember/90"
        >
          수동 발송
        </Link>
      </div>

      {/* KPI Cards */}
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <div className="rounded-[28px] border border-ink/10 bg-white p-6">
          <p className="text-sm text-slate">이번 달 총 발송</p>
          <p className="mt-2 text-3xl font-bold text-ink">
            {monthTotal.toLocaleString("ko-KR")}
            <span className="ml-1 text-base font-normal text-slate">건</span>
          </p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-6">
          <p className="text-sm text-slate">이번 달 성공률</p>
          <p
            className={`mt-2 text-3xl font-bold ${
              successRate >= 95
                ? "text-forest"
                : successRate >= 80
                  ? "text-amber-600"
                  : "text-red-600"
            }`}
          >
            {successRate}
            <span className="ml-0.5 text-base font-normal text-slate">%</span>
          </p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-6">
          <p className="text-sm text-slate">이번 달 실패</p>
          <p
            className={`mt-2 text-3xl font-bold ${monthFail > 0 ? "text-red-600" : "text-ink"}`}
          >
            {monthFail.toLocaleString("ko-KR")}
            <span className="ml-1 text-base font-normal text-slate">건</span>
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <form
        method="GET"
        action="/admin/notifications/history"
        className="mt-8 rounded-[28px] border border-ink/10 bg-mist p-6"
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Type filter */}
          <div>
            <label htmlFor="type" className="mb-2 block text-sm font-medium">
              알림 유형
            </label>
            <select
              id="type"
              name="type"
              defaultValue={typeParam}
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
            >
              {TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Status filter */}
          <div>
            <label htmlFor="status" className="mb-2 block text-sm font-medium">
              발송 상태
            </label>
            <select
              id="status"
              name="status"
              defaultValue={statusParam}
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
            >
              <option value="ALL">전체 상태</option>
              <option value="sent">성공</option>
              <option value="failed">실패</option>
              <option value="skipped">제외</option>
            </select>
          </div>

          {/* Date filter (yyyy-MM) */}
          <div>
            <label htmlFor="date" className="mb-2 block text-sm font-medium">
              발송 월
            </label>
            <input
              id="date"
              type="month"
              name="date"
              defaultValue={dateParam}
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
            />
          </div>

          {/* Submit area */}
          <div className="flex items-end gap-3">
            <a
              href="/admin/notifications/history"
              className="inline-flex items-center rounded-full border border-ink/20 bg-white px-5 py-3 text-sm font-medium text-slate transition hover:border-ink/40"
            >
              초기화
            </a>
            <button
              type="submit"
              className="inline-flex items-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest"
            >
              검색
            </button>
          </div>
        </div>

        <p className="mt-4 text-sm text-slate">
          {filteredTotal.toLocaleString("ko-KR")}건 조회됨
        </p>
      </form>

      {/* Client section: Chart + Table */}
      <div className="mt-8 space-y-8">
        <NotificationHistoryClient
          logs={serializedLogs}
          monthlyChart={monthlyChart}
        />
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-between rounded-[28px] border border-ink/10 bg-white px-6 py-4">
          <p className="text-sm text-slate">
            {page} / {totalPages} 페이지 &nbsp;·&nbsp;{" "}
            {filteredTotal.toLocaleString("ko-KR")}건
          </p>
          <div className="flex gap-2">
            {page > 1 ? (
              <a
                href={pageUrl(page - 1)}
                className="inline-flex items-center rounded-full border border-ink/20 px-4 py-2 text-sm font-medium text-ink transition hover:border-ink/40"
              >
                ← 이전
              </a>
            ) : (
              <span className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-medium text-slate/40">
                ← 이전
              </span>
            )}
            {page < totalPages ? (
              <a
                href={pageUrl(page + 1)}
                className="inline-flex items-center rounded-full border border-ink/20 px-4 py-2 text-sm font-medium text-ink transition hover:border-ink/40"
              >
                다음 →
              </a>
            ) : (
              <span className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-medium text-slate/40">
                다음 →
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
