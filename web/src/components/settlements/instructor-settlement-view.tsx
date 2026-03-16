"use client";

import { useState } from "react";
import type { InstructorSettlementRow } from "@/app/admin/settlements/instructors/page";

type Props = {
  month: string;
  rows: InstructorSettlementRow[];
};

export function InstructorSettlementView({ month: initialMonth, rows }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const totalRevenue = rows.reduce((s, r) => s + r.totalRevenue, 0);
  const totalInstructor = rows.reduce((s, r) => s + r.totalInstructorAmount, 0);
  const totalAcademy = rows.reduce((s, r) => s + r.totalAcademyAmount, 0);

  return (
    <div className="space-y-6">
      {/* Month header + summary */}
      <div className="flex flex-wrap items-center gap-4">
        <h2 className="text-base font-semibold text-ink">{initialMonth.replace("-", "년 ")}월 정산</h2>
        <span className="text-xs text-slate">특강 수강중+수료 기준</span>
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
          정산 대상 강사가 없습니다. 특강 과목에 강사를 등록해 주세요.
        </div>
      ) : (
        <div className="space-y-4">
          {rows.map((row) => {
            const isExpanded = expandedId === row.instructorId;
            return (
              <div
                key={row.instructorId}
                className="rounded-[28px] border border-ink/10 bg-white overflow-hidden"
              >
                {/* Instructor header row */}
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : row.instructorId)}
                  className="w-full px-6 py-4 flex items-center justify-between hover:bg-mist/30 transition text-left"
                >
                  <div className="flex items-center gap-4">
                    <div>
                      <p className="font-semibold text-ink">{row.instructorName}</p>
                      <p className="text-xs text-slate mt-0.5">{row.subject} · {row.lectures.length}개 과목</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-8">
                    <div className="text-right">
                      <p className="text-xs text-slate">강사 수령</p>
                      <p className="text-base font-bold text-ember tabular-nums">
                        {row.totalInstructorAmount.toLocaleString()}원
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-slate">학원 수입</p>
                      <p className="text-base font-bold text-forest tabular-nums">
                        {row.totalAcademyAmount.toLocaleString()}원
                      </p>
                    </div>
                    <span className="text-slate text-xs">{isExpanded ? "▲" : "▼"}</span>
                  </div>
                </button>

                {/* Expanded detail table */}
                {isExpanded && (
                  <div className="border-t border-ink/5">
                    <table className="min-w-full text-sm divide-y divide-ink/5">
                      <thead>
                        <tr className="bg-mist/50">
                          {["특강명", "과목", "수강인원", "단가", "총 수강료", "배분율", "강사 수령", "학원 수입"].map((h) => (
                            <th
                              key={h}
                              className="px-4 py-2.5 text-left text-xs font-medium text-slate whitespace-nowrap"
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
                            <td className="px-4 py-3 tabular-nums text-ink">{lec.enrolledCount}명</td>
                            <td className="px-4 py-3 tabular-nums text-slate whitespace-nowrap">
                              {lec.price.toLocaleString()}원
                            </td>
                            <td className="px-4 py-3 tabular-nums font-medium text-ink whitespace-nowrap">
                              {lec.totalRevenue.toLocaleString()}원
                            </td>
                            <td className="px-4 py-3 tabular-nums text-slate">{lec.instructorRate}%</td>
                            <td className="px-4 py-3 tabular-nums font-semibold text-ember whitespace-nowrap">
                              {lec.instructorAmount.toLocaleString()}원
                            </td>
                            <td className="px-4 py-3 tabular-nums font-semibold text-forest whitespace-nowrap">
                              {lec.academyAmount.toLocaleString()}원
                            </td>
                          </tr>
                        ))}
                        {/* Total row */}
                        <tr className="bg-mist/30 font-semibold">
                          <td colSpan={4} className="px-4 py-3 text-ink">소계</td>
                          <td className="px-4 py-3 tabular-nums text-ink whitespace-nowrap">
                            {row.totalRevenue.toLocaleString()}원
                          </td>
                          <td className="px-4 py-3 text-slate">-</td>
                          <td className="px-4 py-3 tabular-nums text-ember whitespace-nowrap">
                            {row.totalInstructorAmount.toLocaleString()}원
                          </td>
                          <td className="px-4 py-3 tabular-nums text-forest whitespace-nowrap">
                            {row.totalAcademyAmount.toLocaleString()}원
                          </td>
                        </tr>
                      </tbody>
                    </table>

                    {/* Print button */}
                    <div className="px-6 py-3 border-t border-ink/5 flex justify-end gap-2">
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
        * 수강료는 현재 등록 기준으로 계산됩니다. 환불/취소 수강생은 제외됩니다.
      </p>
    </div>
  );
}
