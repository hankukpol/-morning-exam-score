import { AdminRole, NotificationChannel, NotificationType } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { NOTIFICATION_TYPE_LABEL } from "@/lib/constants";
import { format } from "date-fns";
import { ko } from "date-fns/locale";

export const dynamic = "force-dynamic";

// ─── Channel labels ──────────────────────────────────────────────────────────
const CHANNEL_LABEL: Record<NotificationChannel, string> = {
  ALIMTALK: "알림톡",
  SMS: "SMS",
  WEB_PUSH: "웹 푸시",
};

const CHANNEL_COLOR: Record<NotificationChannel, string> = {
  ALIMTALK: "border-amber-200 bg-amber-50 text-amber-800",
  SMS: "border-sky-200 bg-sky-50 text-sky-800",
  WEB_PUSH: "border-purple-200 bg-purple-50 text-purple-800",
};

// ─── Status ──────────────────────────────────────────────────────────────────
function getStatusBadge(status: string) {
  if (status === "sent") {
    return {
      label: "성공",
      color: "border-forest/30 bg-forest/10 text-forest",
    };
  }
  if (status === "failed") {
    return {
      label: "실패",
      color: "border-red-200 bg-red-50 text-red-700",
    };
  }
  return {
    label: status,
    color: "border-ink/20 bg-ink/5 text-slate",
  };
}

// ─── Date helpers ────────────────────────────────────────────────────────────
function formatSentAt(date: Date): string {
  return format(date, "yyyy-MM-dd(E) HH:mm", { locale: ko });
}

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
  await requireAdminContext(AdminRole.MANAGER);

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

  const [filteredTotal, logs, monthTotal, monthFail] = await Promise.all([
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
  ]);

  const monthSuccess = monthTotal - monthFail;
  const successRate =
    monthTotal > 0 ? Math.round((monthSuccess / monthTotal) * 100) : 100;

  const totalPages = Math.ceil(filteredTotal / limit);

  // Build pagination URL helper
  function pageUrl(p: number) {
    const params = new URLSearchParams();
    if (typeParam !== "ALL") params.set("type", typeParam);
    if (statusParam !== "ALL") params.set("status", statusParam);
    if (dateParam) params.set("date", dateParam);
    params.set("page", String(p));
    return `/admin/notifications/history?${params.toString()}`;
  }

  return (
    <div className="p-8 sm:p-10">
      {/* Header */}
      <div className="inline-flex rounded-full border border-ink/20 bg-ink/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-slate">
        알림·공지
      </div>
      <h1 className="mt-5 text-3xl font-semibold">알림 발송 이력</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        카카오 알림톡·SMS 발송 이력을 조회하고 성공률을 확인합니다.
      </p>

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

      {/* Log Table */}
      <div className="mt-8 rounded-[28px] border border-ink/10 bg-white">
        {logs.length === 0 ? (
          <div className="p-16 text-center">
            <p className="text-sm text-slate">조건에 맞는 발송 이력이 없습니다.</p>
            <p className="mt-2 text-xs text-slate/60">
              알림톡이 발송되면 이 목록에 자동으로 기록됩니다.
            </p>
            <a
              href="/admin/notifications"
              className="mt-6 inline-flex items-center rounded-full bg-ember px-6 py-3 text-sm font-semibold text-white transition hover:bg-ember/90"
            >
              알림 발송 페이지로 이동
            </a>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-ink/10 bg-mist text-left">
                  <th className="whitespace-nowrap px-5 py-4 font-semibold text-slate">
                    발송일시
                  </th>
                  <th className="whitespace-nowrap px-5 py-4 font-semibold text-slate">
                    유형
                  </th>
                  <th className="whitespace-nowrap px-5 py-4 font-semibold text-slate">
                    채널
                  </th>
                  <th className="whitespace-nowrap px-5 py-4 font-semibold text-slate">
                    수신자
                  </th>
                  <th className="whitespace-nowrap px-5 py-4 font-semibold text-slate">
                    연락처
                  </th>
                  <th className="whitespace-nowrap px-5 py-4 font-semibold text-slate">
                    상태
                  </th>
                  <th className="px-5 py-4 font-semibold text-slate">비고</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log, idx) => {
                  const isEven = idx % 2 === 0;
                  const statusBadge = getStatusBadge(log.status);
                  const channelColor = CHANNEL_COLOR[log.channel];
                  const channelLabel = CHANNEL_LABEL[log.channel];
                  const typeLabel =
                    NOTIFICATION_TYPE_LABEL[log.type] ?? log.type;

                  return (
                    <tr
                      key={log.id}
                      className={`border-b border-ink/5 transition hover:bg-mist/60 ${isEven ? "" : "bg-gray-50/40"}`}
                    >
                      {/* 발송일시 */}
                      <td className="whitespace-nowrap px-5 py-3.5 align-top">
                        <p className="font-medium text-ink">
                          {formatSentAt(log.sentAt)}
                        </p>
                      </td>

                      {/* 유형 */}
                      <td className="whitespace-nowrap px-5 py-3.5 align-top">
                        <span className="inline-flex rounded-full border border-ink/20 bg-ink/5 px-2.5 py-1 text-xs font-medium text-ink">
                          {typeLabel}
                        </span>
                      </td>

                      {/* 채널 */}
                      <td className="whitespace-nowrap px-5 py-3.5 align-top">
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${channelColor}`}
                        >
                          {channelLabel}
                        </span>
                      </td>

                      {/* 수신자 */}
                      <td className="whitespace-nowrap px-5 py-3.5 align-top">
                        <a
                          href={`/admin/students/${log.student.examNumber}`}
                          className="font-medium text-ink hover:underline"
                        >
                          {log.student.name}
                        </a>
                        <p className="font-mono text-xs text-slate">
                          {log.student.examNumber}
                        </p>
                      </td>

                      {/* 연락처 */}
                      <td className="whitespace-nowrap px-5 py-3.5 align-top">
                        <span className="font-mono text-xs text-slate">
                          {log.student.phone ?? "-"}
                        </span>
                      </td>

                      {/* 상태 */}
                      <td className="whitespace-nowrap px-5 py-3.5 align-top">
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusBadge.color}`}
                        >
                          {statusBadge.label}
                        </span>
                      </td>

                      {/* 비고 */}
                      <td className="max-w-xs px-5 py-3.5 align-top">
                        {log.failReason ? (
                          <p className="break-words text-xs leading-relaxed text-red-600">
                            {log.failReason}
                          </p>
                        ) : (
                          <span className="text-xs text-slate/50">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-ink/10 px-6 py-4">
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
    </div>
  );
}
