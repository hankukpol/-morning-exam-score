import { AdminRole, EnrollmentStatus } from "@prisma/client";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import {
  ENROLLMENT_STATUS_LABEL,
  ENROLLMENT_STATUS_COLOR,
} from "@/lib/constants";
import { UnpaidListClient, type UnpaidRow } from "./unpaid-list-client";

export const dynamic = "force-dynamic";

// ─── helpers ─────────────────────────────────────────────────────────────────

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}.${m}.${d}`;
}

const UNPAID_STATUSES: EnrollmentStatus[] = ["PENDING", "ACTIVE", "SUSPENDED"];

// ─── page ────────────────────────────────────────────────────────────────────

export default async function UnpaidPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  await requireAdminContext(AdminRole.COUNSELOR);

  const prisma = getPrisma();

  // 1. Fetch up to 500 enrollments with the relevant statuses
  const enrollments = await prisma.courseEnrollment.findMany({
    where: {
      status: { in: UNPAID_STATUSES },
    },
    include: {
      student: {
        select: { name: true, phone: true, examNumber: true },
      },
      cohort: { select: { name: true } },
      product: { select: { name: true } },
      specialLecture: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  // 2. Fetch all APPROVED payments linked to these enrollments (by enrollmentId)
  const enrollmentIds = enrollments.map((e) => e.id);

  const approvedPayments = await prisma.payment.findMany({
    where: {
      enrollmentId: { in: enrollmentIds },
      status: "APPROVED",
    },
    select: {
      enrollmentId: true,
      netAmount: true,
    },
  });

  // Build a map: enrollmentId → total paid
  const paidMap = new Map<string, number>();
  for (const p of approvedPayments) {
    if (!p.enrollmentId) continue;
    paidMap.set(p.enrollmentId, (paidMap.get(p.enrollmentId) ?? 0) + p.netAmount);
  }

  // 3. Compute unpaid rows (serialise Date → string for client component)
  const unpaidRows: UnpaidRow[] = enrollments
    .map((e) => {
      const paidAmount = paidMap.get(e.id) ?? 0;
      const unpaidAmount = e.finalFee - paidAmount;
      const courseName =
        e.product?.name ?? e.specialLecture?.name ?? e.cohort?.name ?? "—";
      return {
        id: e.id,
        examNumber: e.examNumber,
        studentName: e.student.name,
        mobile: e.student.phone ?? null,
        courseName,
        status: e.status,
        finalFee: e.finalFee,
        paidAmount,
        unpaidAmount,
        createdAt: formatDate(e.createdAt),
      };
    })
    .filter((row) => row.unpaidAmount > 0);

  // 4. Apply status filter from searchParams
  const filterStatus = searchParams.status as EnrollmentStatus | undefined;
  const filteredRows =
    filterStatus && UNPAID_STATUSES.includes(filterStatus)
      ? unpaidRows.filter((r) => r.status === filterStatus)
      : unpaidRows;

  // 5. Summary stats (always over ALL unpaid, before status filter)
  const totalCount = unpaidRows.length;
  const totalUnpaidAmount = unpaidRows.reduce((s, r) => s + r.unpaidAmount, 0);
  const fullyUnpaidCount = unpaidRows.filter((r) => r.paidAmount === 0).length;
  const partiallyUnpaidCount = totalCount - fullyUnpaidCount;

  // ─── render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-8 sm:p-10">
      {/* Header */}
      <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        수납 관리
      </div>
      <h1 className="mt-5 text-3xl font-semibold">미납 관리</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        수강 등록 후 수납이 완료되지 않은 내역을 조회합니다. 전액 미납(빨강)과 부분 미납(노랑)으로
        구분됩니다. <strong className="text-ink">독촉 발송</strong> 버튼으로 학생에게 알림을 보낼 수
        있습니다.
      </p>

      {/* Summary cards */}
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">미납 건수</p>
          <p className="mt-2 text-3xl font-semibold text-ink">{totalCount.toLocaleString()}</p>
          <p className="mt-1 text-xs text-slate">건</p>
        </div>

        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">총 미납 금액</p>
          <p className="mt-2 text-2xl font-semibold text-ember">
            {totalUnpaidAmount.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-slate">원</p>
        </div>

        <div className="rounded-[28px] border border-red-200 bg-red-50 p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-widest text-red-600">전액 미납</p>
          <p className="mt-2 text-3xl font-semibold text-red-700">
            {fullyUnpaidCount.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-red-500">건</p>
        </div>

        <div className="rounded-[28px] border border-amber-200 bg-amber-50 p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-widest text-amber-600">부분 미납</p>
          <p className="mt-2 text-3xl font-semibold text-amber-700">
            {partiallyUnpaidCount.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-amber-500">건</p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="mt-8 flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-slate">수강 상태:</span>
        {(
          [
            { value: "", label: "전체" },
            { value: "PENDING", label: ENROLLMENT_STATUS_LABEL.PENDING },
            { value: "ACTIVE", label: ENROLLMENT_STATUS_LABEL.ACTIVE },
            { value: "SUSPENDED", label: ENROLLMENT_STATUS_LABEL.SUSPENDED },
          ] as { value: string; label: string }[]
        ).map((opt) => {
          const isActive =
            opt.value === "" ? !filterStatus : filterStatus === opt.value;
          return (
            <Link
              key={opt.value}
              href={
                opt.value
                  ? `/admin/payments/unpaid?status=${opt.value}`
                  : "/admin/payments/unpaid"
              }
              className={[
                "rounded-full border px-3 py-1 text-sm font-medium transition-colors",
                isActive
                  ? "border-ember bg-ember text-white"
                  : "border-ink/20 bg-white text-ink hover:border-ember/40 hover:text-ember",
              ].join(" ")}
            >
              {opt.label}
            </Link>
          );
        })}

        <span className="ml-auto text-sm text-slate">
          {filteredRows.length.toLocaleString()}건 표시 중
        </span>
      </div>

      {/* Table — Client Component (독촉 발송 버튼 포함) */}
      <div className="mt-4 overflow-hidden rounded-[20px] border border-ink/10 bg-white shadow-sm">
        <UnpaidListClient rows={filteredRows} />
      </div>

      {/* Footnote */}
      <p className="mt-4 text-xs text-slate/70">
        * 최대 500건의 수강 등록 내역을 조회합니다. 상태가 신청·수강 중·휴원인 수강 건 중 승인된
        수납 합계가 최종 수강료에 미달하는 경우에만 표시됩니다. 독촉 발송은 알림 수신에 동의한
        학생에게만 전송됩니다.
      </p>
    </div>
  );
}
