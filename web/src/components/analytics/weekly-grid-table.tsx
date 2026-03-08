"use client";

import { useState } from "react";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { StatusBadge } from "@/components/analytics/status-badge";
import { WeeklyGridRow } from "@/lib/analytics/service";
import { STATUS_ROW_CLASS, formatScore } from "@/lib/analytics/presentation";
import { STUDENT_TYPE_LABEL } from "@/lib/constants";

type WeeklyGridTableProps = {
  rows: WeeklyGridRow[];
  sessions: Array<{
    id: number;
    subjectLabel: string;
    examDateLabel: string;
  }>;
};

export function WeeklyGridTable({ rows, sessions }: WeeklyGridTableProps) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(30);
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedRows = rows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="overflow-hidden rounded-[28px] border border-ink/10 bg-white">
      <PaginationControls
        totalCount={rows.length}
        page={currentPage}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(nextPageSize) => {
          setPageSize(nextPageSize);
          setPage(1);
        }}
        itemLabel="명"
      />
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-ink/10 text-sm">
          <thead className="bg-mist/80 text-left">
            <tr>
              <th className="px-4 py-3 font-semibold">수험번호</th>
              <th className="px-4 py-3 font-semibold">이름</th>
              <th className="px-4 py-3 font-semibold">구분</th>
              <th className="px-4 py-3 font-semibold">평균</th>
              <th className="px-4 py-3 font-semibold">결시 수</th>
              <th className="px-4 py-3 font-semibold">상태</th>
              {sessions.map((session) => (
                <th key={session.id} className="min-w-[160px] px-4 py-3 font-semibold">
                  <div>{session.subjectLabel}</div>
                  <div className="mt-1 text-xs font-normal text-slate">{session.examDateLabel}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/10">
            {pagedRows.length === 0 ? (
              <tr>
                <td colSpan={6 + sessions.length} className="px-4 py-8 text-center text-slate">
                  표시할 학생이 없습니다.
                </td>
              </tr>
            ) : null}
            {pagedRows.map((row) => (
              <tr key={row.examNumber} className={STATUS_ROW_CLASS[row.weekStatus]}>
                <td className="px-4 py-3 font-medium">{row.examNumber}</td>
                <td className="px-4 py-3">{row.name}</td>
                <td className="px-4 py-3">{STUDENT_TYPE_LABEL[row.studentType]}</td>
                <td className="px-4 py-3">{formatScore(row.weekAverage)}</td>
                <td className="px-4 py-3">{row.absentCount}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={row.weekStatus} />
                </td>
                {row.cells.map((cell) => (
                  <td key={cell.sessionId} className="px-4 py-3">
                    {cell.display}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
