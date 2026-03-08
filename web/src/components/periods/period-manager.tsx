"use client";

import { useMemo, useState, useTransition } from "react";
import { EXAM_TYPE_LABEL, SUBJECT_LABEL } from "@/lib/constants";
import { formatDate, toDateInputValue } from "@/lib/format";

type SessionRecord = {
  id: number;
  examType: "GONGCHAE" | "GYEONGCHAE";
  week: number;
  subject: keyof typeof SUBJECT_LABEL;
  examDate: string;
  isCancelled: boolean;
  cancelReason: string | null;
  _count: {
    scores: number;
  };
};

type PeriodRecord = {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
  totalWeeks: number;
  isActive: boolean;
  sessions: SessionRecord[];
  _count: {
    sessions: number;
    enrollments: number;
  };
};

type PeriodManagerProps = {
  periods: PeriodRecord[];
};

type PeriodFormState = {
  name: string;
  startDate: string;
  endDate: string;
  totalWeeks: string;
  autoGenerateSessions: boolean;
};

type ViewState = "list" | "create" | "detail";

const defaultFormState: PeriodFormState = {
  name: "",
  startDate: "",
  endDate: "",
  totalWeeks: "8",
  autoGenerateSessions: true,
};

export function PeriodManager({ periods }: PeriodManagerProps) {
  const [view, setView] = useState<ViewState>("list");
  const [selectedPeriodId, setSelectedPeriodId] = useState<number | null>(
    () => periods.find((p) => p.isActive)?.id ?? periods[0]?.id ?? null,
  );
  const [selectedYear, setSelectedYear] = useState<string>(() => {
    const activePeriod = periods.find((p) => p.isActive) ?? periods[0];
    return activePeriod ? activePeriod.startDate.slice(0, 4) : "";
  });
  const [createForm, setCreateForm] = useState<PeriodFormState>(defaultFormState);
  const [editingPeriodId, setEditingPeriodId] = useState<number | null>(null);
  const [editingSessionId, setEditingSessionId] = useState<number | null>(null);
  const [draftPeriods, setDraftPeriods] = useState<Record<number, PeriodFormState>>({});
  const [sessionDrafts, setSessionDrafts] = useState<
    Record<number, { examDate: string; isCancelled: boolean; cancelReason: string }>
  >({});
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [sessionFilter, setSessionFilterState] = useState<{
    examType: string | null;
    subject: string | null;
    search: string;
  }>({ examType: null, subject: null, search: "" });
  const [enrollmentPanelOpen, setEnrollmentPanelOpen] = useState(false);
  const [enrollmentPasteText, setEnrollmentPasteText] = useState("");
  const [enrollmentPreview, setEnrollmentPreview] = useState<{
    rows: Array<{
      examNumber: string;
      name: string | null;
      student: { examNumber: string; name: string; examType: string; isActive: boolean } | null;
      status: "ready" | "already_enrolled" | "not_found";
    }>;
    totalCount: number;
  } | null>(null);
  const [enrollmentCount, setEnrollmentCount] = useState<number | null>(null);
  const [collapsedWeeks, setCollapsedWeeks] = useState<Set<number>>(new Set());

  const selectedPeriod = periods.find((p) => p.id === selectedPeriodId) ?? null;

  const periodsById = useMemo(
    () =>
      Object.fromEntries(
        periods.map((period) => [
          period.id,
          {
            name: period.name,
            startDate: toDateInputValue(period.startDate),
            endDate: toDateInputValue(period.endDate),
            totalWeeks: String(period.totalWeeks),
            autoGenerateSessions: false,
          },
        ]),
      ) as Record<number, PeriodFormState>,
    [periods],
  );

  function withHandledRequest(action: () => Promise<void>) {
    setNotice(null);
    setErrorMessage(null);

    startTransition(async () => {
      try {
        await action();
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "요청 처리 중 오류가 발생했습니다.",
        );
      }
    });
  }

  async function requestJson(url: string, init?: RequestInit) {
    const response = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error ?? "요청에 실패했습니다.");
    }

    return payload;
  }

  function refreshPage() {
    window.location.reload();
  }

  function getDraftPeriod(periodId: number) {
    return draftPeriods[periodId] ?? periodsById[periodId];
  }

  function getSessionDraft(session: SessionRecord) {
    return (
      sessionDrafts[session.id] ?? {
        examDate: toDateInputValue(session.examDate),
        isCancelled: session.isCancelled,
        cancelReason: session.cancelReason ?? "",
      }
    );
  }

  function toggleWeek(week: number) {
    setCollapsedWeeks((current) => {
      const next = new Set(current);
      if (next.has(week)) {
        next.delete(week);
      } else {
        next.add(week);
      }
      return next;
    });
  }

  function selectPeriod(periodId: number) {
    setSelectedPeriodId(periodId);
    setView("detail");
    setCollapsedWeeks(new Set());
    setSessionFilterState({ examType: null, subject: null, search: "" });
    setEnrollmentPanelOpen(false);
    setEnrollmentCount(null);
    setEditingPeriodId(null);
    setEditingSessionId(null);
    setNotice(null);
    setErrorMessage(null);
  }

  // ─── LIST VIEW ───────────────────────────────────────────────
  if (view === "list") {
    const years = [...new Set(periods.map((p) => p.startDate.slice(0, 4)))].sort(
      (a, b) => b.localeCompare(a),
    );
    const visiblePeriods = selectedYear
      ? periods.filter((p) => p.startDate.slice(0, 4) === selectedYear)
      : periods;

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* 연도 필터 탭 */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedYear("")}
              className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition ${
                selectedYear === ""
                  ? "border-ink bg-ink text-white"
                  : "border-ink/10 bg-white text-slate hover:border-ink/30 hover:text-ink"
              }`}
            >
              전체
            </button>
            {years.map((year) => (
              <button
                key={year}
                type="button"
                onClick={() => setSelectedYear(year)}
                className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition ${
                  selectedYear === year
                    ? "border-ink bg-ink text-white"
                    : "border-ink/10 bg-white text-slate hover:border-ink/30 hover:text-ink"
                }`}
              >
                {year}년
              </button>
            ))}
            <span className="text-xs text-slate">
              {visiblePeriods.length}개 기간
            </span>
          </div>
          <button
            type="button"
            onClick={() => setView("create")}
            className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-forest"
          >
            <span>+</span>
            새 기간 생성
          </button>
        </div>

        {periods.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-ink/20 bg-white px-6 py-16 text-center">
            <p className="text-sm text-slate">아직 생성된 시험 기간이 없습니다.</p>
            <button
              type="button"
              onClick={() => setView("create")}
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-forest"
            >
              첫 기간 만들기
            </button>
          </div>
        ) : visiblePeriods.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-ink/20 bg-white px-6 py-12 text-center text-sm text-slate">
            {selectedYear}년에 해당하는 기간이 없습니다.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visiblePeriods.map((period) => (
              <button
                key={period.id}
                type="button"
                onClick={() => selectPeriod(period.id)}
                className={`group relative w-full rounded-[28px] border p-6 text-left transition hover:shadow-md ${
                  period.isActive
                    ? "border-forest/40 bg-forest/5 hover:border-forest/60"
                    : "border-ink/10 bg-white hover:border-ink/20"
                }`}
              >
                {period.isActive && (
                  <span className="absolute right-4 top-4 rounded-full border border-forest/20 bg-forest/10 px-2.5 py-0.5 text-xs font-semibold text-forest">
                    현재 활성
                  </span>
                )}
                <h3 className="pr-20 text-base font-semibold leading-snug">{period.name}</h3>
                <p className="mt-2 text-xs text-slate">
                  {formatDate(period.startDate)} ~ {formatDate(period.endDate)}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="rounded-full border border-ink/10 bg-mist px-2.5 py-0.5 text-xs text-slate">
                    {period.totalWeeks}주
                  </span>
                  <span className="rounded-full border border-ink/10 bg-mist px-2.5 py-0.5 text-xs text-slate">
                    회차 {period._count.sessions}개
                  </span>
                  <span className="rounded-full border border-ink/10 bg-mist px-2.5 py-0.5 text-xs text-slate">
                    수강생 {period._count.enrollments}명
                  </span>
                </div>
                <div className="mt-4 flex items-center justify-end text-xs font-semibold text-slate group-hover:text-ink">
                  관리하기 →
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ─── CREATE VIEW ─────────────────────────────────────────────
  if (view === "create") {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setView("list")}
            className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ink/30"
          >
            ← 목록으로
          </button>
          <h2 className="text-xl font-semibold">새 시험 기간 생성</h2>
        </div>

        {errorMessage ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
        ) : null}

        <div className="rounded-[28px] border border-ink/10 bg-mist p-8">
          <p className="mb-6 text-sm leading-7 text-slate">
            2개월 단위 기간을 만들고, 필요하면 월~금 고정 과목 규칙으로 회차를 자동 생성합니다.
          </p>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="xl:col-span-2">
              <label className="mb-2 block text-sm font-medium">기간명</label>
              <input
                value={createForm.name}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, name: event.target.value }))
                }
                className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
                placeholder="예: 2026년 3-4월 아침모의고사"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium">시작일</label>
              <input
                type="date"
                value={createForm.startDate}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, startDate: event.target.value }))
                }
                className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium">종료일</label>
              <input
                type="date"
                value={createForm.endDate}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, endDate: event.target.value }))
                }
                className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
              />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <div className="w-full max-w-[180px]">
              <label className="mb-2 block text-sm font-medium">총 주차</label>
              <input
                type="number"
                min={1}
                max={12}
                value={createForm.totalWeeks}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, totalWeeks: event.target.value }))
                }
                className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
              />
            </div>
            <label className="mt-7 inline-flex items-center gap-2 text-sm text-slate">
              <input
                type="checkbox"
                checked={createForm.autoGenerateSessions}
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    autoGenerateSessions: event.target.checked,
                  }))
                }
              />
              생성 직후 회차도 자동 생성
            </label>
          </div>
          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={() =>
                withHandledRequest(async () => {
                  await requestJson("/api/periods", {
                    method: "POST",
                    body: JSON.stringify({
                      ...createForm,
                      totalWeeks: Number(createForm.totalWeeks),
                    }),
                  });
                  setNotice("시험 기간을 생성했습니다.");
                  setCreateForm(defaultFormState);
                  refreshPage();
                })
              }
              disabled={isPending || !createForm.name.trim() || !createForm.startDate || !createForm.endDate}
              className="inline-flex items-center rounded-full bg-ink px-6 py-3 text-sm font-semibold text-white transition hover:bg-forest disabled:cursor-not-allowed disabled:bg-ink/40"
            >
              기간 생성
            </button>
            <button
              type="button"
              onClick={() => setView("list")}
              className="inline-flex items-center rounded-full border border-ink/10 px-6 py-3 text-sm font-semibold transition hover:border-ink/30"
            >
              취소
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── DETAIL VIEW ─────────────────────────────────────────────
  if (!selectedPeriod) {
    setView("list");
    return null;
  }

  const draft = getDraftPeriod(selectedPeriod.id);
  const currentEnrollmentCount = enrollmentCount ?? selectedPeriod._count.enrollments;

  // Session filtering
  const sf = sessionFilter;
  const searchLower = sf.search.trim().toLowerCase();
  const examTypes = [...new Set(selectedPeriod.sessions.map((s) => s.examType))];
  const subjects = [...new Set(selectedPeriod.sessions.map((s) => s.subject))];

  const filteredSessions = selectedPeriod.sessions.filter((s) => {
    if (sf.examType != null && s.examType !== sf.examType) return false;
    if (sf.subject != null && s.subject !== sf.subject) return false;
    if (searchLower) {
      const dateStr = formatDate(s.examDate).toLowerCase();
      const subjectLabel = SUBJECT_LABEL[s.subject].toLowerCase();
      const examTypeLabel = EXAM_TYPE_LABEL[s.examType].toLowerCase();
      if (
        !dateStr.includes(searchLower) &&
        !subjectLabel.includes(searchLower) &&
        !examTypeLabel.includes(searchLower)
      ) {
        return false;
      }
    }
    return true;
  });

  const weekGroupMap = new Map<number, SessionRecord[]>();
  for (const session of filteredSessions) {
    const arr = weekGroupMap.get(session.week) ?? [];
    arr.push(session);
    weekGroupMap.set(session.week, arr);
  }
  const weekGroups = Array.from(weekGroupMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([week, sessions]) => ({
      week,
      sessions: [...sessions].sort((a, b) => a.examDate.localeCompare(b.examDate)),
    }));

  const isWeekVisible = (week: number) => {
    if (searchLower) return true;
    return !collapsedWeeks.has(week);
  };

  return (
    <div className="space-y-6">
      {/* Back nav + period selector */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setView("list")}
          className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ink/30"
        >
          ← 목록
        </button>
        <select
          value={selectedPeriodId ?? ""}
          onChange={(e) => {
            const id = Number(e.target.value);
            if (id) selectPeriod(id);
          }}
          className="rounded-2xl border border-ink/10 bg-white px-4 py-2 text-sm font-semibold"
        >
          {periods.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}{p.isActive ? " (현재 활성)" : ""}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setView("create")}
          className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-forest/30 hover:text-forest"
        >
          + 새 기간
        </button>
      </div>

      {notice ? (
        <div className="rounded-2xl border border-forest/20 bg-forest/10 px-4 py-3 text-sm text-forest">
          {notice}
        </div>
      ) : null}
      {errorMessage ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      {/* Period header card */}
      <div
        className={`rounded-[28px] border p-6 ${
          selectedPeriod.isActive
            ? "border-forest/30 bg-forest/5"
            : "border-ink/10 bg-white"
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-2xl font-semibold">{selectedPeriod.name}</h2>
              {selectedPeriod.isActive ? (
                <span className="rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold text-forest">
                  현재 활성
                </span>
              ) : null}
            </div>
            <p className="mt-2 text-sm text-slate">
              {formatDate(selectedPeriod.startDate)} ~ {formatDate(selectedPeriod.endDate)} ·{" "}
              {selectedPeriod.totalWeeks}주 · 회차 {selectedPeriod._count.sessions}개 · 수강생{" "}
              {currentEnrollmentCount}명
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                withHandledRequest(async () => {
                  await requestJson(`/api/periods/${selectedPeriod.id}/activate`, {
                    method: "PUT",
                  });
                  setNotice("활성 기간을 변경했습니다.");
                  refreshPage();
                })
              }
              disabled={isPending || selectedPeriod.isActive}
              className="rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-forest/30 hover:text-forest disabled:cursor-not-allowed disabled:opacity-50"
            >
              활성화
            </button>
            <button
              type="button"
              onClick={() =>
                withHandledRequest(async () => {
                  await requestJson(`/api/periods/${selectedPeriod.id}`, {
                    method: "PUT",
                    body: JSON.stringify({ action: "generateSessions" }),
                  });
                  setNotice("누락된 회차를 생성했습니다.");
                  refreshPage();
                })
              }
              disabled={isPending}
              className="rounded-full border border-ember/30 px-4 py-2 text-sm font-semibold text-ember transition hover:bg-ember/10"
            >
              회차 생성
            </button>
            <button
              type="button"
              onClick={() =>
                setEditingPeriodId((current) =>
                  current === selectedPeriod.id ? null : selectedPeriod.id,
                )
              }
              className="rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ink/30"
            >
              기간 수정
            </button>
          </div>
        </div>

        {editingPeriodId === selectedPeriod.id ? (
          <div className="mt-6 rounded-[24px] bg-mist p-5">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="xl:col-span-2">
                <label className="mb-2 block text-sm font-medium">기간명</label>
                <input
                  value={draft.name}
                  onChange={(event) =>
                    setDraftPeriods((current) => ({
                      ...current,
                      [selectedPeriod.id]: { ...draft, name: event.target.value },
                    }))
                  }
                  className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium">시작일</label>
                <input
                  type="date"
                  value={draft.startDate}
                  onChange={(event) =>
                    setDraftPeriods((current) => ({
                      ...current,
                      [selectedPeriod.id]: { ...draft, startDate: event.target.value },
                    }))
                  }
                  className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium">종료일</label>
                <input
                  type="date"
                  value={draft.endDate}
                  onChange={(event) =>
                    setDraftPeriods((current) => ({
                      ...current,
                      [selectedPeriod.id]: { ...draft, endDate: event.target.value },
                    }))
                  }
                  className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
                />
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-4">
              <div className="w-full max-w-[180px]">
                <label className="mb-2 block text-sm font-medium">총 주차</label>
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={draft.totalWeeks}
                  onChange={(event) =>
                    setDraftPeriods((current) => ({
                      ...current,
                      [selectedPeriod.id]: { ...draft, totalWeeks: event.target.value },
                    }))
                  }
                  className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
                />
              </div>
              <button
                type="button"
                onClick={() =>
                  withHandledRequest(async () => {
                    await requestJson(`/api/periods/${selectedPeriod.id}`, {
                      method: "PUT",
                      body: JSON.stringify({
                        ...draft,
                        totalWeeks: Number(draft.totalWeeks),
                      }),
                    });
                    setNotice("기간 정보를 수정했습니다.");
                    setEditingPeriodId(null);
                    refreshPage();
                  })
                }
                disabled={isPending}
                className="mt-7 inline-flex items-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest disabled:cursor-not-allowed disabled:bg-ink/40"
              >
                저장
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {/* 등록 수강생 명단 */}
      <div className="overflow-hidden rounded-[24px] border border-ink/10 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/10 bg-mist px-5 py-4">
          <h3 className="text-base font-semibold">
            등록 수강생 명단{" "}
            <span className="text-sm font-normal text-slate">({currentEnrollmentCount}명)</span>
          </h3>
          <button
            type="button"
            onClick={() => setEnrollmentPanelOpen((v) => !v)}
            className="rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-forest/30 hover:text-forest"
          >
            {enrollmentPanelOpen ? "닫기" : "명단 붙여넣기 등록"}
          </button>
        </div>

        {enrollmentPanelOpen ? (
          <div className="p-5">
            <p className="mb-3 text-sm text-slate">
              엑셀에서 수험번호와 이름을 복사하여 붙여넣으세요. (탭 구분, 첫 열: 수험번호, 두 번째 열: 이름)
            </p>
            <textarea
              value={enrollmentPasteText}
              onChange={(e) => {
                setEnrollmentPasteText(e.target.value);
                setEnrollmentPreview(null);
              }}
              rows={6}
              className="w-full rounded-[20px] border border-ink/10 px-4 py-3 text-sm font-mono"
              placeholder={"G20250001\t홍길동\nG20250002\t김철수"}
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={isPending || !enrollmentPasteText.trim()}
                onClick={() =>
                  withHandledRequest(async () => {
                    const result = await requestJson(
                      `/api/periods/${selectedPeriod.id}/enrollments`,
                      {
                        method: "POST",
                        body: JSON.stringify({ action: "preview", text: enrollmentPasteText }),
                      },
                    );
                    setEnrollmentPreview(result);
                  })
                }
                className="rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-forest/30 hover:text-forest disabled:opacity-40"
              >
                미리보기
              </button>
              {enrollmentPreview?.rows.some((r) => r.status === "ready") && (
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() =>
                    withHandledRequest(async () => {
                      const readyExamNumbers = enrollmentPreview.rows
                        .filter((r) => r.status === "ready")
                        .map((r) => r.examNumber);
                      await requestJson(`/api/periods/${selectedPeriod.id}/enrollments`, {
                        method: "POST",
                        body: JSON.stringify({ action: "execute", examNumbers: readyExamNumbers }),
                      });
                      setNotice(`${readyExamNumbers.length}명이 등록되었습니다.`);
                      setEnrollmentCount(currentEnrollmentCount + readyExamNumbers.length);
                      setEnrollmentPasteText("");
                      setEnrollmentPreview(null);
                      setEnrollmentPanelOpen(false);
                    })
                  }
                  className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white transition hover:bg-forest disabled:opacity-40"
                >
                  {enrollmentPreview.rows.filter((r) => r.status === "ready").length}명 등록
                </button>
              )}
            </div>
            {enrollmentPreview && (
              <div className="mt-4 overflow-hidden rounded-[20px] border border-ink/10">
                <table className="min-w-full divide-y divide-ink/10 text-sm">
                  <thead className="bg-mist/80 text-left text-xs">
                    <tr>
                      <th className="px-4 py-2 font-semibold">수험번호</th>
                      <th className="px-4 py-2 font-semibold">이름</th>
                      <th className="px-4 py-2 font-semibold">직렬</th>
                      <th className="px-4 py-2 font-semibold">상태</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink/10">
                    {enrollmentPreview.rows.map((row) => (
                      <tr
                        key={row.examNumber}
                        className={
                          row.status === "not_found"
                            ? "bg-red-50/50 text-slate"
                            : row.status === "already_enrolled"
                              ? "text-slate"
                              : ""
                        }
                      >
                        <td className="px-4 py-2">{row.examNumber}</td>
                        <td className="px-4 py-2">{row.student?.name ?? row.name ?? "-"}</td>
                        <td className="px-4 py-2">
                          {row.student?.examType === "GONGCHAE"
                            ? "공채"
                            : row.student?.examType === "GYEONGCHAE"
                              ? "경채"
                              : "-"}
                        </td>
                        <td className="px-4 py-2">
                          {row.status === "ready" ? (
                            <span className="rounded-full border border-forest/20 bg-forest/10 px-2 py-0.5 text-xs font-semibold text-forest">
                              등록 예정
                            </span>
                          ) : row.status === "already_enrolled" ? (
                            <span className="rounded-full border border-ink/10 bg-mist px-2 py-0.5 text-xs font-semibold text-slate">
                              이미 등록됨
                            </span>
                          ) : (
                            <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">
                              수강생 없음
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : null}
      </div>

      {/* 회차 목록 — 주차별 그룹 */}
      <div className="overflow-hidden rounded-[24px] border border-ink/10 bg-white">
        {/* Session list header */}
        <div className="border-b border-ink/10 bg-mist px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <h3 className="text-base font-semibold">
                회차 목록{" "}
                <span className="text-sm font-normal text-slate">
                  ({filteredSessions.length}/{selectedPeriod.sessions.length})
                </span>
              </h3>
              {selectedPeriod.sessions.length > 0 && !searchLower && (
                <button
                  type="button"
                  onClick={() => {
                    const allWeeks = [...new Set(selectedPeriod.sessions.map((s) => s.week))];
                    const allCollapsed = allWeeks.every((w) => collapsedWeeks.has(w));
                    if (allCollapsed) {
                      setCollapsedWeeks(new Set());
                    } else {
                      setCollapsedWeeks(new Set(allWeeks));
                    }
                  }}
                  className="text-xs text-slate underline hover:text-ink"
                >
                  {[...new Set(selectedPeriod.sessions.map((s) => s.week))].every((w) =>
                    collapsedWeeks.has(w),
                  )
                    ? "모두 펼치기"
                    : "모두 접기"}
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {/* 검색 */}
              <div className="relative">
                <input
                  type="text"
                  value={sf.search}
                  onChange={(e) =>
                    setSessionFilterState((current) => ({ ...current, search: e.target.value }))
                  }
                  placeholder="날짜·과목·직렬 검색"
                  className="w-48 rounded-xl border border-ink/10 bg-white py-1.5 pl-8 pr-3 text-sm placeholder:text-slate/50"
                />
                <svg
                  className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"
                  />
                </svg>
              </div>
              <select
                value={sf.examType ?? ""}
                onChange={(e) =>
                  setSessionFilterState((current) => ({
                    ...current,
                    examType: e.target.value || null,
                  }))
                }
                className="rounded-xl border border-ink/10 bg-white px-3 py-1.5 text-sm"
              >
                <option value="">전체 직렬</option>
                {examTypes.map((t) => (
                  <option key={t} value={t}>
                    {EXAM_TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
              <select
                value={sf.subject ?? ""}
                onChange={(e) =>
                  setSessionFilterState((current) => ({
                    ...current,
                    subject: e.target.value || null,
                  }))
                }
                className="rounded-xl border border-ink/10 bg-white px-3 py-1.5 text-sm"
              >
                <option value="">전체 과목</option>
                {subjects.map((s) => (
                  <option key={s} value={s}>
                    {SUBJECT_LABEL[s]}
                  </option>
                ))}
              </select>
              {(sf.examType != null || sf.subject != null || sf.search) && (
                <button
                  type="button"
                  onClick={() =>
                    setSessionFilterState({ examType: null, subject: null, search: "" })
                  }
                  className="rounded-xl border border-ink/10 px-3 py-1.5 text-sm text-slate hover:text-ember"
                >
                  초기화
                </button>
              )}
            </div>
          </div>

          {/* Week quick-jump pills */}
          {selectedPeriod.sessions.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {[...new Set(selectedPeriod.sessions.map((s) => s.week))]
                .sort((a, b) => a - b)
                .map((week) => {
                  const weekSessions = selectedPeriod.sessions.filter((s) => s.week === week);
                  const hasCancelled = weekSessions.some((s) => s.isCancelled);
                  const hasScores = weekSessions.some((s) => s._count.scores > 0);
                  const isVisible = isWeekVisible(week);
                  return (
                    <button
                      key={week}
                      type="button"
                      onClick={() => {
                        if (searchLower) return;
                        toggleWeek(week);
                      }}
                      className={`rounded-full border px-3 py-0.5 text-xs font-semibold transition ${
                        isVisible
                          ? hasCancelled
                            ? "border-red-200 bg-red-50 text-red-700"
                            : hasScores
                              ? "border-forest/20 bg-forest/10 text-forest"
                              : "border-ink/10 bg-white text-ink"
                          : "border-ink/10 bg-mist text-slate"
                      }`}
                    >
                      {week}주
                    </button>
                  );
                })}
            </div>
          )}
        </div>

        {/* Session groups */}
        {selectedPeriod.sessions.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate">
            아직 생성된 회차가 없습니다.
          </div>
        ) : weekGroups.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate">
            필터 조건에 맞는 회차가 없습니다.
          </div>
        ) : (
          <div className="divide-y divide-ink/10">
            {weekGroups.map(({ week, sessions: weekSessions }) => {
              const isCollapsed = !isWeekVisible(week);
              const dates = weekSessions.map((s) => s.examDate).sort();
              const weekStart = dates[0] ?? "";
              const weekEnd = dates[dates.length - 1] ?? "";
              const cancelledCount = weekSessions.filter((s) => s.isCancelled).length;
              const scoredCount = weekSessions.filter((s) => s._count.scores > 0).length;

              return (
                <div key={week}>
                  <button
                    type="button"
                    onClick={() => !searchLower && toggleWeek(week)}
                    className={`flex w-full items-center justify-between px-5 py-3 text-left transition ${
                      searchLower ? "cursor-default" : "hover:bg-mist/60"
                    } bg-mist/30`}
                  >
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-sm font-semibold">{week}주차</span>
                      <span className="text-xs text-slate">
                        {weekStart ? `${formatDate(weekStart)} ~ ${formatDate(weekEnd)}` : ""}
                      </span>
                      <span className="rounded-full border border-ink/10 bg-white px-2 py-0.5 text-xs text-slate">
                        {weekSessions.length}회
                      </span>
                      {scoredCount > 0 && (
                        <span className="rounded-full border border-forest/20 bg-forest/10 px-2 py-0.5 text-xs text-forest">
                          점수 {scoredCount}회 입력됨
                        </span>
                      )}
                      {cancelledCount > 0 && (
                        <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs text-red-700">
                          취소 {cancelledCount}회
                        </span>
                      )}
                    </div>
                    {!searchLower && (
                      <span className="text-xs text-slate">{isCollapsed ? "▶" : "▼"}</span>
                    )}
                  </button>

                  {!isCollapsed && (
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-ink/10 text-sm">
                        <thead className="bg-white text-left">
                          <tr>
                            <th className="px-4 py-2.5 text-xs font-semibold text-slate">날짜</th>
                            <th className="px-4 py-2.5 text-xs font-semibold text-slate">직렬</th>
                            <th className="px-4 py-2.5 text-xs font-semibold text-slate">과목</th>
                            <th className="px-4 py-2.5 text-xs font-semibold text-slate">상태</th>
                            <th className="px-4 py-2.5 text-xs font-semibold text-slate">점수 수</th>
                            <th className="px-4 py-2.5 text-xs font-semibold text-slate">동작</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-ink/10">
                          {weekSessions.map((session) => {
                            const sessionDraft = getSessionDraft(session);
                            return (
                              <tr
                                key={session.id}
                                className={session.isCancelled ? "bg-red-50/30 text-slate" : ""}
                              >
                                <td className="px-4 py-2.5">
                                  {editingSessionId === session.id ? (
                                    <input
                                      type="date"
                                      value={sessionDraft.examDate}
                                      onChange={(event) =>
                                        setSessionDrafts((current) => ({
                                          ...current,
                                          [session.id]: {
                                            ...sessionDraft,
                                            examDate: event.target.value,
                                          },
                                        }))
                                      }
                                      className="rounded-xl border border-ink/10 px-3 py-1.5 text-sm"
                                    />
                                  ) : (
                                    formatDate(session.examDate)
                                  )}
                                </td>
                                <td className="px-4 py-2.5">
                                  <span
                                    className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${
                                      session.examType === "GONGCHAE"
                                        ? "border-forest/20 bg-forest/10 text-forest"
                                        : "border-amber-200 bg-amber-50 text-amber-700"
                                    }`}
                                  >
                                    {EXAM_TYPE_LABEL[session.examType]}
                                  </span>
                                </td>
                                <td className="px-4 py-2.5">{SUBJECT_LABEL[session.subject]}</td>
                                <td className="px-4 py-2.5">
                                  {editingSessionId === session.id ? (
                                    <div className="space-y-2">
                                      <label className="flex items-center gap-2 text-sm">
                                        <input
                                          type="checkbox"
                                          checked={sessionDraft.isCancelled}
                                          onChange={(event) =>
                                            setSessionDrafts((current) => ({
                                              ...current,
                                              [session.id]: {
                                                ...sessionDraft,
                                                isCancelled: event.target.checked,
                                              },
                                            }))
                                          }
                                        />
                                        취소 처리
                                      </label>
                                      {sessionDraft.isCancelled ? (
                                        <input
                                          value={sessionDraft.cancelReason}
                                          onChange={(event) =>
                                            setSessionDrafts((current) => ({
                                              ...current,
                                              [session.id]: {
                                                ...sessionDraft,
                                                cancelReason: event.target.value,
                                              },
                                            }))
                                          }
                                          className="w-full rounded-xl border border-ink/10 px-3 py-1.5 text-sm"
                                          placeholder="취소 사유"
                                        />
                                      ) : null}
                                    </div>
                                  ) : session.isCancelled ? (
                                    <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">
                                      취소{session.cancelReason ? ` · ${session.cancelReason}` : ""}
                                    </span>
                                  ) : (
                                    <span className="rounded-full border border-forest/20 bg-forest/10 px-2 py-0.5 text-xs font-semibold text-forest">
                                      예정
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-2.5 tabular-nums">
                                  {session._count.scores}
                                  <span className="text-slate">
                                    {" "}/ {currentEnrollmentCount}명
                                  </span>
                                </td>
                                <td className="px-4 py-2.5">
                                  {editingSessionId === session.id ? (
                                    <div className="flex flex-wrap gap-2">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          withHandledRequest(async () => {
                                            await requestJson(`/api/sessions/${session.id}`, {
                                              method: "PUT",
                                              body: JSON.stringify({
                                                examDate: sessionDraft.examDate,
                                                isCancelled: sessionDraft.isCancelled,
                                                cancelReason: sessionDraft.cancelReason,
                                              }),
                                            });
                                            setNotice("회차 정보를 수정했습니다.");
                                            setEditingSessionId(null);
                                            refreshPage();
                                          })
                                        }
                                        disabled={isPending}
                                        className="rounded-full border border-ink/10 px-4 py-1.5 text-xs font-semibold transition hover:border-forest/30 hover:text-forest"
                                      >
                                        저장
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setEditingSessionId(null)}
                                        className="rounded-full border border-ink/10 px-4 py-1.5 text-xs font-semibold transition hover:border-ink/30"
                                      >
                                        취소
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => setEditingSessionId(session.id)}
                                      className="rounded-full border border-ink/10 px-4 py-1.5 text-xs font-semibold transition hover:border-ember/30 hover:text-ember"
                                    >
                                      취소/연기
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
