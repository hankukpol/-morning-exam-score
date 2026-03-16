"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { InstructorSettlementRow } from "@/app/admin/settlements/instructors/page";

type Props = {
  month: string;
  rows: InstructorSettlementRow[];
};

function formatMonthLabel(month: string): string {
  const [y, m] = month.split("-");
  return `${y}년 ${parseInt(m, 10)}월`;
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function InstructorSettlementView({ month, rows }: Props) {
  const router = useRouter();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const totalRevenue = rows.reduce((s, r) => s + r.totalRevenue, 0);
  const totalInstructor = rows.reduce((s, r) => s + r.totalInstructorAmount, 0);
  const totalAcademy = rows.reduce((s, r) => s + r.totalAcademyAmount, 0);

  function navigateMonth(delta: number) {
    const next = shiftMonth(month, delta);
    router.push(`/admin/settlements/instructors?month=${next}`);
  }

  async function handleExport() {
    if (exporting) return;
    setExporting(true);
    try {
      const res = await fetch(
        `/api/settlements/instructors/export?month=${encodeURIComponent(month)}`,
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        alert(body?.error ?? "내보내기 실패");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `강사정산_${month}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      alert("내보내기 중 오류가 발생했습니다.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Month navigation + action buttons */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigateMonth(-1)}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-ink/10 text-slate transition hover:border-ink/30 hover:text-ink"
            aria-label="이전 달"
          >
            ←
          </button>
          <h2 className="min-w-[120px] text-center text-base font-semibold text-ink">
            {formatMonthLabel(month)} 정산
          </h2>
          <button
            type="button"
            onClick={() => navigateMonth(1)}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-ink/10 text-slate transition hover:border-ink/30 hover:text-ink"
            aria-label="다음 달"
          >
            →
          </button>
          <span className="ml-2 text-xs text-slate">특강 수강중+수료 기준</span>
        </div>

        {/* Excel export button */}
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting}
          className="inline-flex items-center gap-1.5 rounded-full bg-forest px-4 py-2 text-xs font-semibold text-white transition hover:bg-forest/90 disabled:opacity-60"
        >
          {exporting ? (
            <>
              <svg
                className="h-3.5 w-3.5 animate-spin"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v8z"
                />
              </svg>
              내보내는 중…
            </>
          ) : (
            <>
              <svg
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 16v-8m0 8l-3-3m3 3l3-3M4 20h16"
                />
              </svg>
              Excel 내보내기
            </>
          )}
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "총 수강료 수입", value: totalRevenue, color: "text-ink" },
          { label: "강사 지급 합계", value: totalInstructor, color: "text-ember" },
          { label: "학원 수입 합계", value: totalAcademy, color: "text-forest" },
        ].map((card) => (
          <div key={card.label} className="rounded-[28px] border border-ink/10 bg-white p-5">
            <p className="text-xs text-slate">{card.label}</p>
            <p className={`mt-1.5 text-xl font-bold tabular-nums ${card.color}`}>
              {card.value.toLocaleString()}원
            </p>
          </div>
        ))}
      </div>

      {/* Instructor list */}
      {rows.length === 0 ? (
        <div className="rounded-[28px] border border-dashed border-ink/10 bg-white p-10 text-center text-sm text-slate">
          {formatMonthLabel(month)}에 정산 대상 강사가 없습니다.
        </div>
      ) : (
        <div className="space-y-4">
          {rows.map((row) => {
            const isExpanded = expandedId === row.instructorId;
            return (
              <div
                key={row.instructorId}
                className="overflow-hidden rounded-[28px] border border-ink/10 bg-white"
              >
                {/* Instructor header row */}
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : row.instructorId)}
                  className="flex w-full items-center justify-between px-6 py-4 text-left transition hover:bg-mist/30"
                >
                  <div className="flex items-center gap-4">
                    <div>
                      <p className="font-semibold text-ink">{row.instructorName}</p>
                      <p className="mt-0.5 text-xs text-slate">
                        {row.subject} · {row.lectures.length}개 과목
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-8">
                    <div className="text-right">
                      <p className="text-xs text-slate">강사 수령</p>
                      <p className="text-base font-bold tabular-nums text-ember">
                        {row.totalInstructorAmount.toLocaleString()}원
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-slate">학원 수입</p>
                      <p className="text-base font-bold tabular-nums text-forest">
                        {row.totalAcademyAmount.toLocaleString()}원
                      </p>
                    </div>
                    <span className="text-xs text-slate">{isExpanded ? "▲" : "▼"}</span>
                  </div>
                </button>

                {/* Expanded detail table */}
                {isExpanded && (
                  <div className="border-t border-ink/5">
                    <table className="min-w-full divide-y divide-ink/5 text-sm">
                      <thead>
                        <tr className="bg-mist/50">
                          {[
                            "특강명",
                            "과목",
                            "수강인원",
                            "단가",
                            "총 수강료",
                            "배분율",
                            "강사 수령",
                            "학원 수입",
                          ].map((h) => (
                            <th
                              key={h}
                              className="whitespace-nowrap px-4 py-2.5 text-left text-xs font-medium text-slate"
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-ink/5">
                        {row.lectures.map((lec, i) => (
                          <tr key={i} className="hover:bg-mist/20">
                            <td className="px-4 py-3 text-ink">{lec.lectureName}</td>
                            <td className="px-4 py-3 text-slate">{lec.subjectName}</td>
                            <td className="px-4 py-3 tabular-nums text-ink">
                              {lec.enrolledCount}명
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 tabular-nums text-slate">
                              {lec.price.toLocaleString()}원
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 tabular-nums font-medium text-ink">
                              {lec.totalRevenue.toLocaleString()}원
                            </td>
                            <td className="px-4 py-3 tabular-nums text-slate">
                              {lec.instructorRate}%
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 tabular-nums font-semibold text-ember">
                              {lec.instructorAmount.toLocaleString()}원
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 tabular-nums font-semibold text-forest">
                              {lec.academyAmount.toLocaleString()}원
                            </td>
                          </tr>
                        ))}
                        {/* Subtotal row */}
                        <tr className="bg-mist/30 font-semibold">
                          <td colSpan={4} className="px-4 py-3 text-ink">
                            소계
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 tabular-nums text-ink">
                            {row.totalRevenue.toLocaleString()}원
                          </td>
                          <td className="px-4 py-3 text-slate">-</td>
                          <td className="whitespace-nowrap px-4 py-3 tabular-nums text-ember">
                            {row.totalInstructorAmount.toLocaleString()}원
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 tabular-nums text-forest">
                            {row.totalAcademyAmount.toLocaleString()}원
                          </td>
                        </tr>
                      </tbody>
                    </table>

                    {/* Action buttons */}
                    <div className="flex justify-end gap-2 border-t border-ink/5 px-6 py-3">
                      <button
                        type="button"
                        onClick={handleExport}
                        disabled={exporting}
                        className="rounded-full border border-forest/30 px-4 py-2 text-xs font-medium text-forest transition hover:border-forest/60 disabled:opacity-60"
                      >
                        {exporting ? "내보내는 중…" : "Excel 내보내기"}
                      </button>
                      <button
                        type="button"
                        onClick={() => window.print()}
                        className="rounded-full border border-ink/10 px-4 py-2 text-xs font-medium text-ink transition hover:border-ink/30"
                      >
                        정산서 출력
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Note */}
      <p className="text-xs text-slate">
        * 수강료는 해당 월 기준 수강중+수료 등록 기준으로 계산됩니다. 환불/취소/대기 수강생은
        제외됩니다.
      </p>
    </div>
  );
}
