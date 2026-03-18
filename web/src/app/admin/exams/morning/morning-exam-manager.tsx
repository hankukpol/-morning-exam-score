"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ExamType, StudentStatus } from "@prisma/client";
import { EXAM_TYPE_LABEL } from "@/lib/constants";

// ─── Types ───────────────────────────────────────────────────────────────────

type PeriodOption = {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  isGongchaeEnabled: boolean;
  isGyeongchaeEnabled: boolean;
  enrollmentCount: number;
};

type StudentData = {
  examNumber: string;
  name: string;
  mobile: string | null;
  examType: ExamType;
  onlineId: string | null;
  isActive: boolean;
  currentStatus: StudentStatus;
  registeredAt: string | null;
  generation: number | null;
  className: string | null;
  isOnline: boolean;
};

type Subscription = {
  enrolledAt: string;
  student: StudentData;
};

type Stats = {
  total: number;
  gongchae: number;
  gyeongchae: number;
  online: number;
};

type SortKey = "examNumber" | "name" | "examType" | "enrolledAt";

const STATUS_LABEL: Record<StudentStatus, string> = {
  NORMAL: "재원",
  WARNING_1: "1차 경고",
  WARNING_2: "2차 경고",
  DROPOUT: "탈락",
};

const STATUS_COLOR: Record<StudentStatus, string> = {
  NORMAL: "border-forest/30 bg-forest/10 text-forest",
  WARNING_1: "border-amber-200 bg-amber-50 text-amber-800",
  WARNING_2: "border-orange-200 bg-orange-50 text-orange-700",
  DROPOUT: "border-red-200 bg-red-50 text-red-700",
};

function formatDate(iso: string) {
  const d = new Date(iso);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${m}/${day}`;
}

function formatPeriodRange(start: string, end: string) {
  const s = new Date(start);
  const e = new Date(end);
  const fmt = (d: Date) =>
    `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
  return `${fmt(s)} ~ ${fmt(e)}`;
}

// ─── KPI Card ────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  active,
  onClick,
}: {
  label: string;
  value: number;
  sub?: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col gap-1 rounded-[24px] border px-5 py-4 text-left transition ${
        active
          ? "border-ember/40 bg-ember/10"
          : "border-ink/10 bg-white hover:border-ember/30 hover:bg-ember/5"
      }`}
    >
      <span className="text-xs font-medium text-slate">{label}</span>
      <span className={`text-2xl font-bold ${active ? "text-ember" : "text-ink"}`}>{value}</span>
      {sub && <span className="text-xs text-slate">{sub}</span>}
    </button>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function MorningExamManager({ periods }: { periods: PeriodOption[] }) {
  // 활성 기간 기본 선택 (없으면 첫 번째)
  const defaultPeriod = periods.find((p) => p.isActive) ?? periods[0];

  const [selectedPeriodId, setSelectedPeriodId] = useState<number>(defaultPeriod?.id ?? 0);
  const [examTypeFilter, setExamTypeFilter] = useState<ExamType | "ALL" | "ONLINE">("ALL");
  const [query, setQuery] = useState<string>("");
  const [sortKey, setSortKey] = useState<SortKey>("examNumber");
  const [sortAsc, setSortAsc] = useState<boolean>(true);

  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, gongchae: 0, gyeongchae: 0, online: 0 });
  const [total, setTotal] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const LIMIT = 100;

  const fetchData = useCallback(
    async (periodId: number, pg: number) => {
      if (!periodId) return;
      setIsLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({
          periodId: String(periodId),
          page: String(pg),
          limit: String(LIMIT),
        });

        // examType filter: "ONLINE"은 서버에서 지원하지 않으므로 전체 조회 후 클라이언트 필터
        const apiExamType =
          examTypeFilter === "GONGCHAE" || examTypeFilter === "GYEONGCHAE"
            ? examTypeFilter
            : undefined;
        if (apiExamType) params.set("examType", apiExamType);
        if (query) params.set("query", query);

        const res = await fetch(`/api/exams/morning/subscriptions?${params.toString()}`);
        if (!res.ok) {
          const json = await res.json();
          throw new Error(json.error ?? "조회에 실패했습니다.");
        }
        const json = await res.json();
        setSubscriptions(json.data.subscriptions ?? []);
        setTotal(json.data.total ?? 0);
        setStats(json.data.stats ?? { total: 0, gongchae: 0, gyeongchae: 0, online: 0 });
      } catch (err) {
        setError(err instanceof Error ? err.message : "오류가 발생했습니다.");
      } finally {
        setIsLoading(false);
      }
    },
    [examTypeFilter, query],
  );

  // 기간 또는 필터 변경 시 page 1로 리셋
  useEffect(() => {
    setPage(1);
  }, [selectedPeriodId, examTypeFilter, query]);

  // 데이터 로드
  useEffect(() => {
    void fetchData(selectedPeriodId, page);
  }, [selectedPeriodId, page, fetchData]);

  // 클라이언트 사이드 필터 (ONLINE은 클라이언트 처리)
  const filtered = subscriptions.filter((s) => {
    if (examTypeFilter === "ONLINE") return s.student.isOnline;
    return true;
  });

  // 정렬
  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    if (sortKey === "examNumber") cmp = a.student.examNumber.localeCompare(b.student.examNumber);
    else if (sortKey === "name") cmp = a.student.name.localeCompare(b.student.name, "ko");
    else if (sortKey === "examType") cmp = a.student.examType.localeCompare(b.student.examType);
    else if (sortKey === "enrolledAt") cmp = a.enrolledAt.localeCompare(b.enrolledAt);
    return sortAsc ? cmp : -cmp;
  });

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc((v) => !v);
    else {
      setSortKey(key);
      setSortAsc(true);
    }
  }

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return <span className="ml-1 text-ink/20">↕</span>;
    return <span className="ml-1 text-ember">{sortAsc ? "↑" : "↓"}</span>;
  }

  const selectedPeriod = periods.find((p) => p.id === selectedPeriodId);
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Link
          href="/admin/exams/morning/enroll"
          className="inline-flex items-center gap-1.5 rounded-full bg-ember px-4 py-2 text-sm font-semibold text-white transition hover:bg-ember/90"
        >
          + 수강생 등록
        </Link>
      </div>

      {/* Period Selector */}
      <div className="rounded-[28px] border border-ink/10 bg-white p-6">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-semibold text-ink">기간 선택</span>
          <select
            value={selectedPeriodId}
            onChange={(e) => setSelectedPeriodId(Number(e.target.value))}
            className="rounded-xl border border-ink/15 bg-mist px-4 py-2 text-sm font-medium text-ink focus:border-forest focus:outline-none"
          >
            {periods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.isActive ? " [현재]" : ""}
              </option>
            ))}
          </select>
          {selectedPeriod && (
            <span className="text-xs text-slate">
              {formatPeriodRange(selectedPeriod.startDate, selectedPeriod.endDate)}
            </span>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard
          label="총 수강생"
          value={stats.total}
          active={examTypeFilter === "ALL"}
          onClick={() => setExamTypeFilter("ALL")}
        />
        <KpiCard
          label="공채"
          value={stats.gongchae}
          sub="경찰 공개채용"
          active={examTypeFilter === "GONGCHAE"}
          onClick={() => setExamTypeFilter("GONGCHAE")}
        />
        <KpiCard
          label="경채"
          value={stats.gyeongchae}
          sub="경찰 경력채용"
          active={examTypeFilter === "GYEONGCHAE"}
          onClick={() => setExamTypeFilter("GYEONGCHAE")}
        />
        <KpiCard
          label="온라인"
          value={stats.online}
          sub="온라인 ID 보유"
          active={examTypeFilter === "ONLINE"}
          onClick={() => setExamTypeFilter("ONLINE")}
        />
      </div>

      {/* Filter / Search Bar */}
      <div className="rounded-[28px] border border-ink/10 bg-white p-5">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/30">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
            </span>
            <input
              type="text"
              placeholder="이름 또는 학번 검색"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full rounded-xl border border-ink/15 bg-mist py-2 pl-9 pr-4 text-sm focus:border-forest focus:outline-none"
            />
          </div>

          {/* ExamType Filter */}
          <select
            value={examTypeFilter}
            onChange={(e) => setExamTypeFilter(e.target.value as ExamType | "ALL" | "ONLINE")}
            className="rounded-xl border border-ink/15 bg-mist px-4 py-2 text-sm font-medium text-ink focus:border-forest focus:outline-none"
          >
            <option value="ALL">전체 수험유형</option>
            <option value="GONGCHAE">공채</option>
            <option value="GYEONGCHAE">경채</option>
            <option value="ONLINE">온라인</option>
          </select>

          {/* Sort */}
          <select
            value={`${sortKey}-${sortAsc ? "asc" : "desc"}`}
            onChange={(e) => {
              const [k, d] = e.target.value.split("-") as [SortKey, "asc" | "desc"];
              setSortKey(k);
              setSortAsc(d === "asc");
            }}
            className="rounded-xl border border-ink/15 bg-mist px-4 py-2 text-sm font-medium text-ink focus:border-forest focus:outline-none"
          >
            <option value="examNumber-asc">학번 오름차순</option>
            <option value="examNumber-desc">학번 내림차순</option>
            <option value="name-asc">이름 가나다순</option>
            <option value="enrolledAt-desc">등록일 최신순</option>
            <option value="enrolledAt-asc">등록일 오래된순</option>
          </select>

          {/* Reset */}
          {(query || examTypeFilter !== "ALL") && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setExamTypeFilter("ALL");
              }}
              className="rounded-xl border border-ink/15 bg-mist px-4 py-2 text-sm text-slate transition hover:border-ember/30 hover:text-ember"
            >
              초기화
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-[28px] border border-ink/10 bg-white overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-slate">
            <div className="mr-2 h-5 w-5 animate-spin rounded-full border-2 border-forest border-t-transparent" />
            불러오는 중…
          </div>
        ) : error ? (
          <div className="py-20 text-center text-red-600">{error}</div>
        ) : sorted.length === 0 ? (
          <div className="py-20 text-center text-slate">
            {query || examTypeFilter !== "ALL"
              ? "검색 결과가 없습니다."
              : "이 기간에 등록된 수강생이 없습니다."}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink/10 bg-mist">
                    <th
                      className="cursor-pointer select-none px-4 py-3 text-left font-semibold text-ink/60 transition hover:text-ink"
                      onClick={() => toggleSort("examNumber")}
                    >
                      학번
                      <SortIcon k="examNumber" />
                    </th>
                    <th
                      className="cursor-pointer select-none px-4 py-3 text-left font-semibold text-ink/60 transition hover:text-ink"
                      onClick={() => toggleSort("name")}
                    >
                      이름
                      <SortIcon k="name" />
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-ink/60">연락처</th>
                    <th
                      className="cursor-pointer select-none px-4 py-3 text-left font-semibold text-ink/60 transition hover:text-ink"
                      onClick={() => toggleSort("examType")}
                    >
                      수험유형
                      <SortIcon k="examType" />
                    </th>
                    <th
                      className="cursor-pointer select-none px-4 py-3 text-left font-semibold text-ink/60 transition hover:text-ink"
                      onClick={() => toggleSort("enrolledAt")}
                    >
                      등록일
                      <SortIcon k="enrolledAt" />
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-ink/60">상태</th>
                    <th className="px-4 py-3 text-right font-semibold text-ink/60">성적 보기</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5">
                  {sorted.map((sub) => {
                    const s = sub.student;
                    return (
                      <tr
                        key={s.examNumber}
                        className="transition hover:bg-mist/60"
                      >
                        {/* 학번 */}
                        <td className="px-4 py-3">
                          <Link
                            href={`/admin/students/${s.examNumber}`}
                            className="font-mono text-sm font-semibold text-forest hover:underline"
                          >
                            {s.examNumber}
                          </Link>
                        </td>

                        {/* 이름 */}
                        <td className="px-4 py-3">
                          <Link
                            href={`/admin/students/${s.examNumber}`}
                            className="font-semibold text-ink hover:text-forest hover:underline"
                          >
                            {s.name}
                          </Link>
                          {s.isOnline && (
                            <span className="ml-2 rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700 border border-sky-200">
                              온라인
                            </span>
                          )}
                          {s.className && (
                            <span className="ml-1 text-xs text-slate">({s.className})</span>
                          )}
                        </td>

                        {/* 연락처 */}
                        <td className="px-4 py-3 text-slate">
                          {s.mobile ?? <span className="text-ink/25">—</span>}
                        </td>

                        {/* 수험유형 */}
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                              s.examType === "GONGCHAE"
                                ? "border-forest/30 bg-forest/10 text-forest"
                                : "border-ember/30 bg-ember/10 text-ember"
                            }`}
                          >
                            {EXAM_TYPE_LABEL[s.examType]}
                          </span>
                        </td>

                        {/* 등록일 */}
                        <td className="px-4 py-3 text-slate">
                          {formatDate(sub.enrolledAt)}
                        </td>

                        {/* 상태 */}
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_COLOR[s.currentStatus]}`}
                          >
                            {STATUS_LABEL[s.currentStatus]}
                          </span>
                        </td>

                        {/* 성적 보기 */}
                        <td className="px-4 py-3 text-right">
                          <Link
                            href={`/admin/students/${s.examNumber}?tab=scores`}
                            className="inline-flex items-center rounded-full border border-forest/30 px-3 py-1 text-xs font-semibold text-forest transition hover:bg-forest/10"
                          >
                            성적 →
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-ink/10 px-5 py-4">
                <span className="text-xs text-slate">
                  {total}명 중 {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)}명 표시
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                    className="rounded-xl border border-ink/15 px-3 py-1.5 text-sm text-ink transition hover:border-forest disabled:opacity-40"
                  >
                    이전
                  </button>
                  <span className="flex items-center px-2 text-sm text-slate">
                    {page} / {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                    className="rounded-xl border border-ink/15 px-3 py-1.5 text-sm text-ink transition hover:border-forest disabled:opacity-40"
                  >
                    다음
                  </button>
                </div>
              </div>
            )}

            {/* Footer summary */}
            <div className="border-t border-ink/10 px-5 py-3 text-xs text-slate">
              총 {total}명 조회됨
              {examTypeFilter !== "ALL" && (
                <span className="ml-2">
                  (필터: {examTypeFilter === "ONLINE" ? "온라인" : EXAM_TYPE_LABEL[examTypeFilter as ExamType]})
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
