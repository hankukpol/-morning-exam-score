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

const defaultFormState: PeriodFormState = {
  name: "",
  startDate: "",
  endDate: "",
  totalWeeks: "8",
  autoGenerateSessions: true,
};

export function PeriodManager({ periods }: PeriodManagerProps) {
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

  return (
    <div className="space-y-8">
      <section className="rounded-[28px] border border-ink/10 bg-mist p-6">
        <h2 className="text-xl font-semibold">시험 기간 생성</h2>
        <p className="mt-3 text-sm leading-7 text-slate">
          2개월 단위 기간을 만들고, 필요하면 월~금 고정 과목 규칙으로 회차를 자동 생성합니다.
        </p>
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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
            disabled={isPending}
            className="mt-7 inline-flex items-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest disabled:cursor-not-allowed disabled:bg-ink/40"
          >
            기간 생성
          </button>
        </div>
      </section>

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

      <section className="space-y-6">
        {periods.map((period) => {
          const draft = getDraftPeriod(period.id);

          return (
            <article
              key={period.id}
              className={`rounded-[28px] border p-6 ${
                period.isActive
                  ? "border-forest/30 bg-forest/5"
                  : "border-ink/10 bg-white"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-2xl font-semibold">{period.name}</h2>
                    {period.isActive ? (
                      <span className="rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold text-forest">
                        현재 활성
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-3 text-sm leading-7 text-slate">
                    {formatDate(period.startDate)} ~ {formatDate(period.endDate)} / {period.totalWeeks}
                    주 / 회차 {period._count.sessions}개
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      withHandledRequest(async () => {
                        await requestJson(`/api/periods/${period.id}/activate`, {
                          method: "PUT",
                        });
                        setNotice("활성 기간을 변경했습니다.");
                        refreshPage();
                      })
                    }
                    disabled={isPending || period.isActive}
                    className="rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-forest/30 hover:text-forest disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    활성화
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      withHandledRequest(async () => {
                        await requestJson(`/api/periods/${period.id}`, {
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
                        current === period.id ? null : period.id,
                      )
                    }
                    className="rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ink/30"
                  >
                    기간 수정
                  </button>
                </div>
              </div>

              {editingPeriodId === period.id ? (
                <div className="mt-6 rounded-[24px] bg-mist p-5">
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <div className="xl:col-span-2">
                      <label className="mb-2 block text-sm font-medium">기간명</label>
                      <input
                        value={draft.name}
                        onChange={(event) =>
                          setDraftPeriods((current) => ({
                            ...current,
                            [period.id]: { ...draft, name: event.target.value },
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
                            [period.id]: { ...draft, startDate: event.target.value },
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
                            [period.id]: { ...draft, endDate: event.target.value },
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
                            [period.id]: { ...draft, totalWeeks: event.target.value },
                          }))
                        }
                        className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        withHandledRequest(async () => {
                          await requestJson(`/api/periods/${period.id}`, {
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

              <div className="mt-6 overflow-hidden rounded-[24px] border border-ink/10">
                <div className="border-b border-ink/10 bg-mist px-5 py-4">
                  <h3 className="text-lg font-semibold">회차 목록</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-ink/10 text-sm">
                    <thead className="bg-white text-left">
                      <tr>
                        <th className="px-4 py-3 font-semibold">주차</th>
                        <th className="px-4 py-3 font-semibold">직렬</th>
                        <th className="px-4 py-3 font-semibold">과목</th>
                        <th className="px-4 py-3 font-semibold">날짜</th>
                        <th className="px-4 py-3 font-semibold">상태</th>
                        <th className="px-4 py-3 font-semibold">점수 수</th>
                        <th className="px-4 py-3 font-semibold">동작</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink/10">
                      {period.sessions.map((session) => {
                        const sessionDraft = getSessionDraft(session);

                        return (
                          <tr key={session.id}>
                            <td className="px-4 py-3">{session.week}주차</td>
                            <td className="px-4 py-3">{EXAM_TYPE_LABEL[session.examType]}</td>
                            <td className="px-4 py-3">{SUBJECT_LABEL[session.subject]}</td>
                            <td className="px-4 py-3">
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
                                  className="rounded-xl border border-ink/10 px-3 py-2"
                                />
                              ) : (
                                formatDate(session.examDate)
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {editingSessionId === session.id ? (
                                <div className="space-y-2">
                                  <label className="flex items-center gap-2">
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
                                      className="w-full rounded-xl border border-ink/10 px-3 py-2"
                                      placeholder="취소 사유"
                                    />
                                  ) : null}
                                </div>
                              ) : session.isCancelled ? (
                                <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">
                                  취소{session.cancelReason ? ` · ${session.cancelReason}` : ""}
                                </span>
                              ) : (
                                <span className="rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold text-forest">
                                  예정
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3">{session._count.scores}</td>
                            <td className="px-4 py-3">
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
                                    className="rounded-full border border-ink/10 px-4 py-2 text-xs font-semibold transition hover:border-forest/30 hover:text-forest"
                                  >
                                    저장
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingSessionId(null)}
                                    className="rounded-full border border-ink/10 px-4 py-2 text-xs font-semibold transition hover:border-ink/30"
                                  >
                                    취소
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setEditingSessionId(session.id)}
                                  className="rounded-full border border-ink/10 px-4 py-2 text-xs font-semibold transition hover:border-ember/30 hover:text-ember"
                                >
                                  취소/연기
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      {period.sessions.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-4 py-8 text-center text-slate">
                            아직 생성된 회차가 없습니다.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>
            </article>
          );
        })}
        {periods.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-ink/20 bg-white px-6 py-10 text-center text-sm text-slate">
            아직 생성된 시험 기간이 없습니다.
          </div>
        ) : null}
      </section>
    </div>
  );
}
