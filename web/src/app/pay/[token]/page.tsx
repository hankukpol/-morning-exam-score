import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function PayPage({ params }: { params: { token: string } }) {
  const { token } = params;

  const link = await getPrisma().paymentLink.findUnique({
    where: { token },
    include: {
      course: {
        select: { name: true, cohortStartDate: true, cohortEndDate: true },
      },
    },
  });

  if (!link) {
    notFound();
  }

  const now = new Date();
  const isExpired = link.expiresAt < now || link.status === "EXPIRED";
  const isDisabled = link.status === "DISABLED";
  const isUsedUp = link.status === "USED_UP" || (link.maxUsage != null && link.usageCount >= link.maxUsage);
  const isUnavailable = isExpired || isDisabled || isUsedUp;

  const formatDate = (d: Date | null) =>
    d ? `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}` : null;

  return (
    <div className="min-h-screen bg-mist flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
            한국경찰학원
          </div>
          <h1 className="mt-4 text-2xl font-bold text-ink">온라인 결제</h1>
        </div>

        {/* Card */}
        <div className="rounded-[28px] border border-ink/10 bg-white shadow-sm overflow-hidden">
          {/* Link info */}
          <div className="p-6 border-b border-ink/5">
            <h2 className="text-xl font-semibold text-ink">{link.title}</h2>
            {link.course && (
              <p className="mt-1 text-sm text-slate">{link.course.name}</p>
            )}
            {link.course?.cohortStartDate || link.course?.cohortEndDate ? (
              <p className="mt-1 text-xs text-slate">
                수강 기간: {formatDate(link.course.cohortStartDate) ?? "??"} ~{" "}
                {formatDate(link.course.cohortEndDate) ?? "??"}
              </p>
            ) : null}
          </div>

          {/* Pricing */}
          <div className="p-6 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-slate">결제 금액</span>
              <span className="font-medium text-ink tabular-nums">
                {link.amount.toLocaleString()}원
              </span>
            </div>
            {link.discountAmount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-slate">할인</span>
                <span className="font-medium text-red-600 tabular-nums">
                  -{link.discountAmount.toLocaleString()}원
                </span>
              </div>
            )}
            <div className="border-t border-ink/5 pt-3 flex justify-between">
              <span className="font-semibold text-ink">최종 결제 금액</span>
              <span className="text-lg font-bold text-forest tabular-nums">
                {link.finalAmount.toLocaleString()}원
              </span>
            </div>
            {link.allowPoint && (
              <p className="text-xs text-slate">* 보유 포인트 사용 가능</p>
            )}
          </div>

          {/* Action area */}
          <div className="px-6 pb-6">
            {isUnavailable ? (
              <div className="rounded-2xl bg-red-50 border border-red-200 px-4 py-4 text-center">
                <p className="text-sm font-semibold text-red-700">
                  {isDisabled
                    ? "이 결제 링크는 비활성화되었습니다."
                    : isExpired
                      ? "이 결제 링크는 만료되었습니다."
                      : "이 결제 링크는 최대 사용 횟수에 도달했습니다."}
                </p>
                <p className="mt-1 text-xs text-red-600">
                  학원에 문의해 주세요. ☎ 053-241-0112
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3">
                  <p className="text-xs text-amber-800 font-medium">
                    온라인 결제 기능은 준비 중입니다.
                  </p>
                  <p className="mt-1 text-xs text-amber-700">
                    결제를 원하시면 학원에 직접 방문하시거나 전화해 주세요.
                  </p>
                </div>
                <a
                  href="tel:053-241-0112"
                  className="block w-full rounded-full bg-ember px-5 py-3 text-center text-sm font-semibold text-white transition hover:bg-ember/90"
                >
                  ☎ 053-241-0112 전화하기
                </a>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-slate">
          한국경찰학원 · 대구광역시 중구 중앙대로 390 센트럴엠빌딩
        </p>
      </div>
    </div>
  );
}
