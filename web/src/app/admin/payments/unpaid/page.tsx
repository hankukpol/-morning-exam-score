import { AdminRole, EnrollmentStatus } from "@prisma/client";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import {
  ENROLLMENT_STATUS_LABEL,
  ENROLLMENT_STATUS_COLOR,
} from "@/lib/constants";

export const dynamic = "force-dynamic";

// ─── helpers ─────────────────────────────────────────────────────────────────

function formatKRW(amount: number): string {
  return amount.toLocaleString("ko-KR") + "원";
}

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}.${m}.${d}`;
}

/** Returns Tailwind classes for the unpaid badge */
function unpaidBadgeClass(unpaid: number, finalFee: number): string {
  if (finalFee === 0) return "border-ink/20 bg-ink/5 text-ink/60"; // free / zero-fee
  if (unpaid >= finalFee) {
    // fully unpaid
    return "border-red-300 bg-red-50 text-red-700";
  }
  // partially unpaid
  return "border-amber-300 bg-amber-50 text-amber-700";
}

/** Returns Tailwind classes for the row left-border accent */
function rowAccentClass(unpaid: number, finalFee: number): string {
  if (finalFee === 0) return "border-l-4 border-l-slate-200";
  if (unpaid >= finalFee) return "border-l-4 border-l-red-400";
  return "border-l-4 border-l-amber-400";
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

  // 3. Compute unpaid rows
  type UnpaidRow = {
    id: string;
    examNumber: string;
    studentName: string;
    mobile: string | null;
    courseName: string;
    status: EnrollmentStatus;
    finalFee: number;
    paidAmount: number;
    unpaidAmount: number;
    createdAt: Date;
  };

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
        createdAt: e.createdAt,
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
        구분됩니다.
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

      {/* Table */}
      <div className="mt-4 overflow-hidden rounded-[20px] border border-ink/10 bg-white shadow-sm">
        {filteredRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="text-4xl">✓</div>
            <p className="mt-4 text-lg font-medium text-ink">미납 내역이 없습니다</p>
            <p className="mt-2 text-sm text-slate">
              선택한 조건에 해당하는 미납 수강생이 없습니다.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-ink/10 bg-mist">
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate">
                    학번
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate">
                    이름
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate">
                    연락처
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate">
                    강좌
                  </th>
                  <th className="px-5 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate">
                    수강 상태
                  </th>
                  <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate">
                    최종 수강료
                  </th>
                  <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate">
                    납부 금액
                  </th>
                  <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate">
                    미납 금액
                  </th>
                  <th className="px-5 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate">
                    등록일
                  </th>
                  <th className="px-5 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate">
                    바로가기
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {filteredRows.map((row) => (
                  <tr
                    key={row.id}
                    className={[
                      rowAccentClass(row.unpaidAmount, row.finalFee),
                      "hover:bg-mist/60 transition-colors",
                    ].join(" ")}
                  >
                    {/* 학번 */}
                    <td className="px-5 py-4">
                      <Link
                        href={`/admin/students/${row.examNumber}`}
                        className="font-mono text-xs font-medium text-forest hover:underline"
                      >
                        {row.examNumber}
                      </Link>
                    </td>

                    {/* 이름 */}
                    <td className="px-5 py-4">
                      <Link
                        href={`/admin/students/${row.examNumber}`}
                        className="font-medium text-ink hover:text-forest hover:underline"
                      >
                        {row.studentName}
                      </Link>
                    </td>

                    {/* 연락처 */}
                    <td className="px-5 py-4 font-mono text-xs text-slate">
                      {row.mobile ?? "—"}
                    </td>

                    {/* 강좌 */}
                    <td className="px-5 py-4 text-ink">{row.courseName}</td>

                    {/* 수강 상태 */}
                    <td className="px-5 py-4 text-center">
                      <span
                        className={[
                          "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium",
                          ENROLLMENT_STATUS_COLOR[row.status],
                        ].join(" ")}
                      >
                        {ENROLLMENT_STATUS_LABEL[row.status]}
                      </span>
                    </td>

                    {/* 최종 수강료 */}
                    <td className="px-5 py-4 text-right font-mono text-sm text-ink">
                      {formatKRW(row.finalFee)}
                    </td>

                    {/* 납부 금액 */}
                    <td className="px-5 py-4 text-right font-mono text-sm text-forest">
                      {formatKRW(row.paidAmount)}
                    </td>

                    {/* 미납 금액 */}
                    <td className="px-5 py-4 text-right">
                      <span
                        className={[
                          "inline-flex rounded-full border px-2.5 py-0.5 font-mono text-xs font-semibold",
                          unpaidBadgeClass(row.unpaidAmount, row.finalFee),
                        ].join(" ")}
                      >
                        {formatKRW(row.unpaidAmount)}
                      </span>
                    </td>

                    {/* 등록일 */}
                    <td className="px-5 py-4 text-center font-mono text-xs text-slate">
                      {formatDate(row.createdAt)}
                    </td>

                    {/* 바로가기 */}
                    <td className="px-5 py-4 text-center">
                      <Link
                        href={`/admin/enrollments/${row.id}`}
                        className="inline-flex items-center gap-1 rounded-lg border border-ember/30 bg-ember/5 px-3 py-1.5 text-xs font-medium text-ember transition-colors hover:border-ember hover:bg-ember hover:text-white"
                      >
                        수납하기
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>

              {/* Footer total row */}
              {filteredRows.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-ink/10 bg-mist/80">
                    <td colSpan={5} className="px-5 py-3 text-xs font-semibold text-slate">
                      합계 ({filteredRows.length.toLocaleString()}건)
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-sm font-semibold text-ink">
                      {formatKRW(filteredRows.reduce((s, r) => s + r.finalFee, 0))}
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-sm font-semibold text-forest">
                      {formatKRW(filteredRows.reduce((s, r) => s + r.paidAmount, 0))}
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-sm font-semibold text-ember">
                      {formatKRW(filteredRows.reduce((s, r) => s + r.unpaidAmount, 0))}
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>

      {/* Footnote */}
      <p className="mt-4 text-xs text-slate/70">
        * 최대 500건의 수강 등록 내역을 조회합니다. 상태가 신청·수강 중·휴원인 수강 건 중 승인된
        수납 합계가 최종 수강료에 미달하는 경우에만 표시됩니다.
      </p>
    </div>
  );
}
