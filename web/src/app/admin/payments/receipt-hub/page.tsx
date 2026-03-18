import Link from "next/link";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { ReceiptHubClient } from "./receipt-hub-client";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

function sp(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function toDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default async function ReceiptHubPage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.COUNSELOR);

  const prisma = getPrisma();

  const now = new Date();
  const defaultTo = toDateString(now);
  const defaultFrom = toDateString(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29));

  const fromParam = sp(searchParams?.from) ?? defaultFrom;
  const toParam = sp(searchParams?.to) ?? defaultTo;

  const fromDate = new Date(fromParam + "T00:00:00");
  const toDate = new Date(toParam + "T23:59:59");

  const payments = await prisma.payment.findMany({
    where: {
      processedAt: { gte: fromDate, lte: toDate },
      status: { in: ["APPROVED", "PARTIAL_REFUNDED"] },
    },
    include: {
      student: { select: { name: true } },
    },
    orderBy: { processedAt: "desc" },
    take: 500,
  });

  // For each payment, find the related enrollment (via items or direct enrollmentId)
  const paymentIds = payments.map((p) => p.id);
  const enrollmentLinks = paymentIds.length > 0
    ? await prisma.paymentItem.findMany({
        where: { paymentId: { in: paymentIds }, itemType: "TUITION" },
        select: { paymentId: true, itemId: true },
      })
    : [];

  // Build a map of paymentId -> enrollmentId (from items)
  const itemEnrollmentMap = new Map<string, string>();
  for (const item of enrollmentLinks) {
    if (item.itemId) {
      itemEnrollmentMap.set(item.paymentId, item.itemId);
    }
  }

  // Fetch cohort names for enrollments
  const enrollmentIds = Array.from(
    new Set([
      ...Array.from(itemEnrollmentMap.values()),
      ...payments.filter((p) => p.enrollmentId).map((p) => p.enrollmentId as string),
    ])
  );

  const enrollmentDetails =
    enrollmentIds.length > 0
      ? await prisma.courseEnrollment.findMany({
          where: { id: { in: enrollmentIds } },
          select: {
            id: true,
            cohort: { select: { name: true } },
            specialLecture: { select: { name: true } },
          },
        })
      : [];

  const enrollmentDetailMap = new Map(enrollmentDetails.map((e) => [e.id, e]));

  // Build rows
  const rows = payments.map((p) => {
    // Resolve enrollmentId: from direct field or from items
    const enrollmentId = p.enrollmentId ?? itemEnrollmentMap.get(p.id) ?? null;
    const enrollment = enrollmentId ? enrollmentDetailMap.get(enrollmentId) : null;
    const cohortName =
      enrollment?.cohort?.name ?? enrollment?.specialLecture?.name ?? null;

    return {
      id: p.id,
      examNumber: p.examNumber,
      studentName: p.student?.name ?? null,
      cohortName,
      netAmount: p.netAmount,
      method: p.method as string,
      category: p.category as string,
      processedAt: p.processedAt.toISOString(),
      enrollmentId,
    };
  });

  const totalAmount = rows.reduce((s, r) => s + r.netAmount, 0);
  const receiptReadyCount = rows.filter((r) => r.enrollmentId !== null).length;

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        수납 관리
      </div>

      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">영수증 발급 허브</h1>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-slate">
            수납 내역을 조회하고 수강증(영수증) 출력 및 일괄 발급을 처리합니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/payments"
            className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:border-ink/30"
          >
            ← 수납 내역
          </Link>
          <Link
            href="/admin/payments/cash-receipts"
            className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:border-ink/30"
          >
            현금영수증 관리
          </Link>
        </div>
      </div>

      <div className="mt-8">
        <ReceiptHubClient
          payments={rows}
          totalAmount={totalAmount}
          receiptReadyCount={receiptReadyCount}
          initialFrom={fromParam}
          initialTo={toParam}
          initialSearch=""
        />
      </div>
    </div>
  );
}
