"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { PointType } from "@prisma/client";
import type { HistoryLogRow } from "./page";

const POINT_TYPE_COLOR: Record<PointType, string> = {
  PERFECT_ATTENDANCE: "border-forest/30 bg-forest/10 text-forest",
  SCORE_EXCELLENCE: "border-sky-200 bg-sky-50 text-sky-700",
  ESSAY_EXCELLENCE: "border-amber-200 bg-amber-50 text-amber-700",
  MANUAL: "border-ember/30 bg-ember/10 text-ember",
};

type Filters = {
  studentId: string;
  type: string;
  from: string;
  to: string;
};

export function PointsHistory({
  initialLogs,
  total,
  page,
  pageCount,
  pageSize,
  filters: initialFilters,
  pointTypeLabelMap,
}: {
  initialLogs: HistoryLogRow[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
  filters: Filters;
  pointTypeLabelMap: Record<PointType, string>;
}) {
  const router = useRouter();
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [, startTransition] = useTransition();

  function buildUrl(overrides: Partial<Filters & { page: number }>) {
    const params = new URLSearchParams();
    const merged = { ...filters, page, ...overrides };
    if (merged.studentId) params.set("studentId", merged.studentId);
    if (merged.type) params.set("type", merged.type);
    if (merged.from) params.set("from", merged.from);
    if (merged.to) params.set("to", merged.to);
    if (merged.page > 1) params.set("page", String(merged.page));
    const q = params.toString();
    return `/admin/points/history${q ? `?${q}` : ""}`;
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    startTransition(() => {
      router.push(buildUrl({ page: 1 }));
    });
  }

  return (
    <>
      {/* 필터 폼 */}
      <form
        onSubmit={handleSearch}
        className="mt-8 grid gap-4 rounded-[28px] border border-ink/10 bg-mist p-6 md:grid-cols-5"
      >
        <div>
          <label className="mb-2 block text-xs font-medium text-slate">학번</label>
          <input
            type="text"
            value={filters.studentId}
            onChange={(e) => setFilters((f) => ({ ...f, studentId: e.target.value }))}
            placeholder="학번 입력"
            className="w-full rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ember/40"
          />
        </div>
        <div>
          <label className="mb-2 block text-xs font-medium text-slate">유형</label>
          <select
            value={filters.type}
            onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value }))}
            className="w-full rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ember/40"
          >
            <option value="">전체</option>
            {Object.entries(pointTypeLabelMap).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-2 block text-xs font-medium text-slate">시작일</label>
          <input
            type="date"
            value={filters.from}
            onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))}
            className="w-full rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ember/40"
          />
        </div>
        <div>
          <label className="mb-2 block text-xs font-medium text-slate">종료일</label>
          <input
            type="date"
            value={filters.to}
            onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))}
            className="w-full rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ember/40"
          />
        </div>
        <div className="flex items-end">
          <button
            type="submit"
            className="w-full rounded-full bg-ink py-2.5 text-sm font-semibold text-white transition hover:bg-forest"
          >
            조회
          </button>
        </div>
      </form>

      {/* 결과 테이블 */}
      <div className="mt-6 rounded-[28px] border border-ink/10 bg-white">
        <div className="flex items-center justify-between border-b border-ink/10 px-6 py-4">
          <p className="text-sm font-semibold text-ink">
            전체 <span className="text-forest">{total.toLocaleString()}</span>건
          </p>
        </div>

        {initialLogs.length === 0 ? (
          <div className="px-6 py-8 text-center text-sm text-slate">
            조건에 맞는 이력이 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-sm">
              <thead>
                <tr className="border-b border-ink/5 text-left text-xs font-medium text-slate">
                  <th className="px-6 py-3">이름</th>
                  <th className="px-3 py-3">학번</th>
                  <th className="px-3 py-3">유형</th>
                  <th className="px-3 py-3 text-right">포인트</th>
                  <th className="px-3 py-3">사유</th>
                  <th className="px-3 py-3">날짜</th>
                  <th className="px-3 py-3">지급자</th>
                </tr>
              </thead>
              <tbody>
                {initialLogs.map((log) => (
                  <tr
                    key={log.id}
                    className="border-b border-ink/5 last:border-0 hover:bg-mist/60 transition-colors"
                  >
                    <td className="px-6 py-3 font-medium text-ink">
                      <Link
                        href={`/admin/students/${log.examNumber}`}
                        className="hover:text-forest transition-colors"
                      >
                        {log.studentName}
                      </Link>
                    </td>
                    <td className="px-3 py-3 font-mono text-xs text-slate">
                      <Link
                        href={`/admin/points/${log.examNumber}`}
                        className="hover:text-forest transition-colors"
                      >
                        {log.examNumber}
                      </Link>
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${
                          POINT_TYPE_COLOR[log.type] ?? "border-ink/10 bg-ink/5 text-slate"
                        }`}
                      >
                        {pointTypeLabelMap[log.type] ?? log.type}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <span
                        className={`font-semibold tabular-nums ${
                          log.amount >= 0 ? "text-forest" : "text-red-600"
                        }`}
                      >
                        {log.amount >= 0 ? "+" : ""}
                        {log.amount.toLocaleString()}P
                      </span>
                    </td>
                    <td className="px-3 py-3 text-slate max-w-[180px] truncate">{log.reason}</td>
                    <td className="px-3 py-3 text-xs text-slate whitespace-nowrap">
                      {new Date(log.grantedAt).toLocaleDateString("ko-KR", {
                        year: "2-digit",
                        month: "2-digit",
                        day: "2-digit",
                      })}
                    </td>
                    <td className="px-3 py-3 text-xs text-slate">{log.grantedBy ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 페이지네이션 */}
        {pageCount > 1 && (
          <div className="flex items-center justify-between border-t border-ink/5 px-6 py-3">
            <p className="text-xs text-slate">
              {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} / {total}건
            </p>
            <div className="flex items-center gap-1">
              {page > 1 && (
                <Link
                  href={buildUrl({ page: page - 1 })}
                  className="rounded-lg border border-ink/10 px-3 py-1.5 text-xs font-medium text-ink hover:bg-mist transition"
                >
                  이전
                </Link>
              )}
              {Array.from({ length: Math.min(5, pageCount) }, (_, i) => {
                const p = Math.max(1, Math.min(page - 2, pageCount - 4)) + i;
                return (
                  <Link
                    key={p}
                    href={buildUrl({ page: p })}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                      p === page
                        ? "border-forest bg-forest text-white"
                        : "border-ink/10 text-ink hover:bg-mist"
                    }`}
                  >
                    {p}
                  </Link>
                );
              })}
              {page < pageCount && (
                <Link
                  href={buildUrl({ page: page + 1 })}
                  className="rounded-lg border border-ink/10 px-3 py-1.5 text-xs font-medium text-ink hover:bg-mist transition"
                >
                  다음
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
