"use client";

import { useState } from "react";
import Link from "next/link";
import { EnrollmentStatus } from "@prisma/client";
import {
  ENROLLMENT_STATUS_LABEL,
  ENROLLMENT_STATUS_COLOR,
} from "@/lib/constants";

// ─── types ───────────────────────────────────────────────────────────────────

export type UnpaidRow = {
  id: string;
  examNumber: string;
  studentName: string;
  mobile: string | null;
  courseName: string;
  status: EnrollmentStatus;
  finalFee: number;
  paidAmount: number;
  unpaidAmount: number;
  createdAt: string; // serialised from server (Date → string)
};

// ─── helpers ─────────────────────────────────────────────────────────────────

function formatKRW(amount: number): string {
  return amount.toLocaleString("ko-KR") + "원";
}

function unpaidBadgeClass(unpaid: number, finalFee: number): string {
  if (finalFee === 0) return "border-ink/20 bg-ink/5 text-ink/60";
  if (unpaid >= finalFee) return "border-red-300 bg-red-50 text-red-700";
  return "border-amber-300 bg-amber-50 text-amber-700";
}

function rowAccentClass(unpaid: number, finalFee: number): string {
  if (finalFee === 0) return "border-l-4 border-l-slate-200";
  if (unpaid >= finalFee) return "border-l-4 border-l-red-400";
  return "border-l-4 border-l-amber-400";
}

// ─── row action: remind button ────────────────────────────────────────────────

type RemindStatus = "idle" | "loading" | "sent" | "error";

function RemindButton({
  row,
}: {
  row: UnpaidRow;
}) {
  const [status, setStatus] = useState<RemindStatus>("idle");
  const [tooltip, setTooltip] = useState("");

  async function handleRemind() {
    if (status === "loading" || status === "sent") return;
    setStatus("loading");
    setTooltip("");

    try {
      const res = await fetch("/api/payments/remind", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          examNumber: row.examNumber,
          enrollmentId: row.id,
          unpaidAmount: row.unpaidAmount,
          courseName: row.courseName,
        }),
      });

      const json = (await res.json()) as {
        data?: { sent: boolean; message: string };
        error?: string;
      };

      if (!res.ok || json.error) {
        setStatus("error");
        setTooltip(json.error ?? "발송 실패");
        setTimeout(() => setStatus("idle"), 4000);
        return;
      }

      setStatus("sent");
      setTooltip(json.data?.message ?? "발송 완료");
    } catch {
      setStatus("error");
      setTooltip("네트워크 오류");
      setTimeout(() => setStatus("idle"), 4000);
    }
  }

  if (status === "sent") {
    return (
      <span className="inline-flex items-center gap-1 rounded-lg border border-forest/30 bg-forest/10 px-3 py-1.5 text-xs font-medium text-forest">
        ✓ 발송 완료
      </span>
    );
  }

  return (
    <div className="relative inline-flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={handleRemind}
        disabled={status === "loading"}
        className={[
          "inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
          status === "loading"
            ? "cursor-not-allowed border-ink/20 bg-ink/5 text-ink/40"
            : status === "error"
              ? "border-red-300 bg-red-50 text-red-700 hover:bg-red-100"
              : "border-amber-300 bg-amber-50 text-amber-700 hover:border-amber-400 hover:bg-amber-100",
        ].join(" ")}
      >
        {status === "loading" ? (
          <>
            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
            발송 중…
          </>
        ) : status === "error" ? (
          "재시도"
        ) : (
          "독촉 발송"
        )}
      </button>
      {tooltip && (
        <span className="absolute top-full mt-1 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-[10px] text-white shadow-lg z-10">
          {tooltip}
        </span>
      )}
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export function UnpaidListClient({ rows }: { rows: UnpaidRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="text-4xl">✓</div>
        <p className="mt-4 text-lg font-medium text-ink">미납 내역이 없습니다</p>
        <p className="mt-2 text-sm text-slate">
          선택한 조건에 해당하는 미납 수강생이 없습니다.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[960px] text-sm">
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
              수납하기
            </th>
            <th className="px-5 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate">
              독촉 발송
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink/5">
          {rows.map((row) => (
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
                {row.createdAt}
              </td>

              {/* 수납하기 */}
              <td className="px-5 py-4 text-center">
                <Link
                  href={`/admin/enrollments/${row.id}`}
                  className="inline-flex items-center gap-1 rounded-lg border border-ember/30 bg-ember/5 px-3 py-1.5 text-xs font-medium text-ember transition-colors hover:border-ember hover:bg-ember hover:text-white"
                >
                  수납하기
                </Link>
              </td>

              {/* 독촉 발송 */}
              <td className="px-5 py-4 text-center">
                <RemindButton row={row} />
              </td>
            </tr>
          ))}
        </tbody>

        {/* Footer total row */}
        <tfoot>
          <tr className="border-t-2 border-ink/10 bg-mist/80">
            <td colSpan={5} className="px-5 py-3 text-xs font-semibold text-slate">
              합계 ({rows.length.toLocaleString()}건)
            </td>
            <td className="px-5 py-3 text-right font-mono text-sm font-semibold text-ink">
              {formatKRW(rows.reduce((s, r) => s + r.finalFee, 0))}
            </td>
            <td className="px-5 py-3 text-right font-mono text-sm font-semibold text-forest">
              {formatKRW(rows.reduce((s, r) => s + r.paidAmount, 0))}
            </td>
            <td className="px-5 py-3 text-right font-mono text-sm font-semibold text-ember">
              {formatKRW(rows.reduce((s, r) => s + r.unpaidAmount, 0))}
            </td>
            <td colSpan={3} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
