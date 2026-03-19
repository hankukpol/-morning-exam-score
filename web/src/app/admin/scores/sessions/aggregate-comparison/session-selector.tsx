"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface SessionOption {
  id: number;
  label: string;
  examType: string;
  hasScores: boolean;
}

interface Props {
  allSessions: SessionOption[];
  selectedIds: number[];
  examTypeFilter: string;
}

export function SessionSelector({ allSessions, selectedIds, examTypeFilter }: Props) {
  const router = useRouter();
  const [picked, setPicked] = useState<number[]>(selectedIds);
  const [typeFilter, setTypeFilter] = useState(examTypeFilter);

  const filteredSessions = typeFilter
    ? allSessions.filter((s) => s.examType === typeFilter)
    : allSessions;

  function toggle(id: number) {
    setPicked((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 6) return prev; // max 6
      return [...prev, id];
    });
  }

  function applySelection() {
    const params = new URLSearchParams();
    if (typeFilter) params.set("examType", typeFilter);
    if (picked.length > 0) params.set("sessions", picked.join(","));
    router.push(`/admin/scores/sessions/aggregate-comparison?${params.toString()}`);
  }

  function reset() {
    setPicked([]);
    setTypeFilter("");
    router.push("/admin/scores/sessions/aggregate-comparison");
  }

  // Sync when selectedIds change from server
  useEffect(() => {
    setPicked(selectedIds);
  }, [selectedIds.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="rounded-[28px] border border-ink/10 bg-white shadow-panel p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate">
          세션 선택 (최대 6개)
        </h2>
        <div className="flex items-center gap-2">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="rounded-xl border border-ink/10 bg-mist px-3 py-1.5 text-xs text-ink focus:border-ember/40 focus:outline-none"
          >
            <option value="">전체 직렬</option>
            <option value="GONGCHAE">공채</option>
            <option value="GYEONGCHAE">경채</option>
          </select>
          <button
            onClick={applySelection}
            className="inline-flex items-center rounded-full border border-ember/30 bg-ember/10 px-4 py-1.5 text-xs font-semibold text-ember transition hover:bg-ember/20"
          >
            비교 적용
          </button>
          <button
            onClick={reset}
            className="inline-flex items-center rounded-full border border-ink/20 px-4 py-1.5 text-xs font-semibold text-slate transition hover:border-ink/40 hover:text-ink"
          >
            초기화
          </button>
        </div>
      </div>

      <p className="text-xs text-slate mb-3">
        선택된 세션: {picked.length}/6 &nbsp;·&nbsp;
        성적 미입력 세션은 흐리게 표시됩니다.
      </p>

      <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
        {filteredSessions.map((s) => {
          const isSelected = picked.includes(s.id);
          const isDisabled = !isSelected && picked.length >= 6;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => !isDisabled && toggle(s.id)}
              disabled={isDisabled}
              className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                isSelected
                  ? "border-ember bg-ember text-white"
                  : isDisabled
                    ? "cursor-not-allowed border-ink/10 bg-ink/5 text-slate/40"
                    : !s.hasScores
                      ? "border-ink/10 bg-white text-slate/50 hover:border-ink/20"
                      : "border-ink/20 bg-white text-ink hover:border-ember/40 hover:text-ember"
              }`}
            >
              {isSelected && <span className="mr-1 text-[10px]">✓</span>}
              {s.label}
            </button>
          );
        })}
      </div>

      {filteredSessions.length === 0 && (
        <p className="py-4 text-center text-xs text-slate">
          표시할 세션이 없습니다.
        </p>
      )}
    </div>
  );
}
