import { AdminRole, DiscountType } from "@prisma/client";
import { notFound } from "next/navigation";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const DISCOUNT_TYPE_LABELS: Record<DiscountType, string> = {
  RATE: "비율(%)",
  FIXED: "정액(원)",
};

function formatKRW(amount: number) {
  return amount.toLocaleString("ko-KR") + "원";
}

function formatDate(dateStr: string | Date) {
  return new Date(dateStr).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function formatDateTime(dateStr: string | Date) {
  return new Date(dateStr).toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function DiscountCodeDetailPage({
  params,
}: {
  params: { id: string };
}) {
  await requireAdminContext(AdminRole.COUNSELOR);

  const id = Number(params.id);
  if (isNaN(id)) notFound();

  const code = await getPrisma().discountCode.findUnique({
    where: { id },
    include: {
      staff: { select: { name: true } },
      usages: {
        orderBy: { usedAt: "desc" },
        include: {
          student: { select: { examNumber: true, name: true, phone: true } },
          payment: {
            select: {
              id: true,
              discountAmount: true,
              netAmount: true,
              createdAt: true,
              enrollmentId: true,
            },
          },
        },
      },
    },
  });

  if (!code) notFound();

  const discountDisplay =
    code.discountType === DiscountType.RATE
      ? `${code.discountValue}%`
      : formatKRW(code.discountValue);

  const usageRate =
    code.maxUsage != null ? Math.round((code.usageCount / code.maxUsage) * 100) : null;

  const totalDiscountGiven = code.usages.reduce(
    (sum, u) => sum + (u.payment?.discountAmount ?? 0),
    0,
  );

  const isExpired =
    code.validUntil != null && new Date(code.validUntil) < new Date();

  return (
    <div className="p-8 sm:p-10">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate">
        <Link href="/admin/settings/discount-codes" className="hover:text-ember transition">
          할인 코드 관리
        </Link>
        <span>/</span>
        <span className="font-mono font-semibold text-ink">{code.code}</span>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
            할인코드 상세
          </div>
          <h1 className="mt-3 text-3xl font-semibold font-mono">{code.code}</h1>
        </div>
        <Link
          href={`/admin/settings/discount-codes/${code.id}/edit`}
          className="inline-flex items-center rounded-full bg-ember px-4 py-2 text-sm font-medium text-white transition hover:bg-ember/90"
        >
          수정
        </Link>
        <Link
          href="/admin/settings/discount-codes"
          className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-medium text-ink transition hover:border-ink/30"
        >
          ← 목록으로
        </Link>
      </div>

      {/* 기본 정보 카드 */}
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-[28px] border border-ink/10 bg-white px-6 py-5">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">할인 방식</p>
          <p className="mt-2 text-xl font-bold text-ink">{DISCOUNT_TYPE_LABELS[code.discountType]}</p>
          <p className="mt-1 text-sm font-semibold text-ember">{discountDisplay}</p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white px-6 py-5">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">사용 횟수</p>
          <p className="mt-2 text-xl font-bold text-ink tabular-nums">
            {code.usageCount}
            <span className="ml-1 text-sm font-normal text-slate">
              / {code.maxUsage != null ? code.maxUsage : "무제한"}
            </span>
          </p>
          {usageRate != null && (
            <div className="mt-2">
              <div className="h-1.5 w-full rounded-full bg-ink/10">
                <div
                  className="h-1.5 rounded-full bg-ember transition-all"
                  style={{ width: `${Math.min(usageRate, 100)}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-slate">{usageRate}% 사용됨</p>
            </div>
          )}
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white px-6 py-5">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">누적 할인 금액</p>
          <p className="mt-2 text-xl font-bold text-ember tabular-nums">
            {formatKRW(totalDiscountGiven)}
          </p>
          <p className="mt-1 text-xs text-slate">이 코드로 발생한 총 할인</p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white px-6 py-5">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">상태</p>
          <div className="mt-2 flex items-center gap-2">
            <span
              className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ${
                code.isActive && !isExpired
                  ? "bg-green-50 text-green-700"
                  : "bg-slate-100 text-slate-500"
              }`}
            >
              {!code.isActive ? "비활성" : isExpired ? "만료됨" : "활성"}
            </span>
          </div>
          <div className="mt-2 text-xs text-slate">
            <div>시작: {formatDate(code.validFrom)}</div>
            {code.validUntil ? (
              <div className={isExpired ? "text-red-600 font-semibold" : ""}>
                종료: {formatDate(code.validUntil)}
              </div>
            ) : (
              <div>종료: 없음</div>
            )}
          </div>
        </div>
      </div>

      {/* 추가 정보 */}
      <div className="mt-4 rounded-[20px] border border-ink/10 bg-white px-6 py-5">
        <h2 className="text-sm font-semibold text-slate uppercase tracking-wider">기본 정보</h2>
        <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <dt className="text-xs text-slate">코드 유형</dt>
            <dd className="mt-1 text-sm font-medium text-ink">{code.type}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate">발급자</dt>
            <dd className="mt-1 text-sm font-medium text-ink">{code.staff?.name ?? "-"}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate">생성일</dt>
            <dd className="mt-1 text-sm font-medium text-ink">{formatDateTime(code.createdAt)}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate">최종 수정</dt>
            <dd className="mt-1 text-sm font-medium text-ink">{formatDateTime(code.updatedAt)}</dd>
          </div>
        </dl>
      </div>

      {/* 사용 이력 테이블 */}
      <div className="mt-6">
        <h2 className="text-lg font-semibold text-ink">
          사용 이력{" "}
          <span className="ml-2 text-sm font-normal text-slate">
            ({code.usages.length}건)
          </span>
        </h2>
        <div className="mt-4 overflow-hidden rounded-[28px] border border-ink/10 bg-white">
          <table className="min-w-full divide-y divide-ink/10 text-sm">
            <thead>
              <tr>
                {["학번", "학생명", "수강 강좌", "할인 금액", "최종 결제", "사용일"].map((h) => (
                  <th
                    key={h}
                    className="bg-mist/50 px-4 py-3 text-left text-xs font-medium uppercase text-slate"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/10">
              {code.usages.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate">
                    사용 이력이 없습니다.
                  </td>
                </tr>
              ) : (
                code.usages.map((usage) => {
                  return (
                    <tr key={usage.id} className="transition hover:bg-mist/30">
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/students/${usage.student.examNumber}`}
                          className="font-mono text-xs text-ink underline-offset-2 hover:underline hover:text-ember"
                        >
                          {usage.student.examNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-3 font-medium text-ink">
                        <Link
                          href={`/admin/students/${usage.student.examNumber}`}
                          className="underline-offset-2 hover:underline hover:text-ember"
                        >
                          {usage.student.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-slate">
                        {usage.payment?.enrollmentId ? (
                          <a
                            href={`/admin/enrollments/${usage.payment.enrollmentId}`}
                            className="text-xs text-forest underline-offset-2 hover:underline"
                          >
                            수강 내역 보기
                          </a>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="px-4 py-3 font-semibold text-red-600 tabular-nums">
                        {usage.payment
                          ? `−${formatKRW(usage.payment.discountAmount)}`
                          : "-"}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-ink">
                        {usage.payment
                          ? formatKRW(usage.payment.netAmount)
                          : "-"}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate">
                        {formatDateTime(usage.usedAt)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
