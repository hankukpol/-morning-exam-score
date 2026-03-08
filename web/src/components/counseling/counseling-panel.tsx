"use client";

import { Subject } from "@/generated/prisma";
import { SUBJECT_LABEL } from "@/lib/constants";
import { toDateInputValue } from "@/lib/format";
import { useState, useTransition } from "react";

type CounselingRecord = {
  id: number;
  counselorName: string;
  content: string;
  recommendation: string | null;
  counseledAt: string;
  nextSchedule: string | null;
};

type CounselingPanelProps = {
  examNumber: string;
  defaultCounselorName: string;
  targetScores: Partial<Record<Subject, number>>;
  subjects: Subject[];
  records: CounselingRecord[];
};

function Spinner() {
  return (
    <svg
      className="mr-1.5 inline-block h-3 w-3 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  );
}

export function CounselingPanel({
  examNumber,
  defaultCounselorName,
  targetScores: initialTargetScores,
  subjects,
  records: initialRecords,
}: CounselingPanelProps) {
  const [records, setRecords] = useState<CounselingRecord[]>(initialRecords);
  const [targetScores, setTargetScores] = useState<Record<string, string>>(
    Object.fromEntries(
      subjects.map((subject) => [subject, initialTargetScores[subject]?.toString() ?? ""]),
    ),
  );
  const [counselorName, setCounselorName] = useState(defaultCounselorName);
  const [content, setContent] = useState("");
  const [recommendation, setRecommendation] = useState("");
  const [counseledAt, setCounseledAt] = useState(toDateInputValue(new Date()));
  const [nextSchedule, setNextSchedule] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

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

  function setMessage(nextNotice: string | null, nextError: string | null) {
    setNotice(nextNotice);
    setErrorMessage(nextError);
  }

  function saveTargets() {
    setMessage(null, null);

    startTransition(async () => {
      try {
        await requestJson(`/api/students/${examNumber}/targets`, {
          method: "PUT",
          body: JSON.stringify({ targetScores }),
        });

        setNotice("목표 점수를 저장했습니다.");
      } catch (error) {
        setMessage(
          null,
          error instanceof Error ? error.message : "목표 점수 저장에 실패했습니다.",
        );
      }
    });
  }

  function createRecord() {
    setMessage(null, null);

    startTransition(async () => {
      try {
        const { record } = await requestJson("/api/counseling", {
          method: "POST",
          body: JSON.stringify({
            examNumber,
            counselorName,
            content,
            recommendation,
            counseledAt,
            nextSchedule: nextSchedule || null,
          }),
        });

        // 폼 초기화
        setContent("");
        setRecommendation("");
        setNextSchedule("");

        // 목록 앞에 추가
        setRecords((prev) => [record, ...prev]);
        setNotice("면담 기록을 저장했습니다.");
      } catch (error) {
        setMessage(
          null,
          error instanceof Error ? error.message : "면담 기록 저장에 실패했습니다.",
        );
      }
    });
  }

  function deleteRecord(recordId: number) {
    if (!confirm("이 면담 기록을 삭제하시겠습니까?")) return;

    setMessage(null, null);

    startTransition(async () => {
      try {
        await requestJson(`/api/counseling/${recordId}`, { method: "DELETE" });
        setRecords((prev) => prev.filter((r) => r.id !== recordId));
        setNotice("면담 기록을 삭제했습니다.");
      } catch (error) {
        setMessage(
          null,
          error instanceof Error ? error.message : "면담 기록 삭제에 실패했습니다.",
        );
      }
    });
  }

  function updateRecord(recordId: number, formData: FormData) {
    setMessage(null, null);

    startTransition(async () => {
      try {
        const { record } = await requestJson(`/api/counseling/${recordId}`, {
          method: "PUT",
          body: JSON.stringify({
            counselorName: String(formData.get("counselorName") ?? ""),
            content: String(formData.get("content") ?? ""),
            recommendation: String(formData.get("recommendation") ?? ""),
            counseledAt: String(formData.get("counseledAt") ?? ""),
            nextSchedule: String(formData.get("nextSchedule") ?? "") || null,
          }),
        });

        setRecords((prev) => prev.map((r) => (r.id === recordId ? record : r)));
        setNotice("면담 기록을 수정했습니다.");
      } catch (error) {
        setMessage(
          null,
          error instanceof Error ? error.message : "면담 기록 수정에 실패했습니다.",
        );
      }
    });
  }

  return (
    <div className="space-y-8">
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

      <section className="rounded-[28px] border border-ink/10 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">과목별 목표 점수</h2>
            <p className="mt-3 text-sm leading-7 text-slate">
              목표 점수는 개인 분석 레이더와 면담 달성률 계산에 바로 반영됩니다.
            </p>
          </div>
          <button
            type="button"
            onClick={saveTargets}
            disabled={isPending}
            className="inline-flex items-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest disabled:cursor-not-allowed disabled:bg-ink/40"
          >
            {isPending && <Spinner />}
            목표 저장
          </button>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {subjects.map((subject) => (
            <div key={subject}>
              <label className="mb-2 block text-sm font-medium">{SUBJECT_LABEL[subject]}</label>
              <input
                type="number"
                min={0}
                max={100}
                value={targetScores[subject] ?? ""}
                onChange={(event) =>
                  setTargetScores((current) => ({
                    ...current,
                    [subject]: event.target.value,
                  }))
                }
                className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm"
              />
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-[28px] border border-ink/10 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">면담 기록 입력</h2>
            <p className="mt-3 text-sm leading-7 text-slate">
              저장 즉시 아래 이력 목록에 반영됩니다.
            </p>
          </div>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
          >
            인쇄 / PDF
          </button>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <label className="mb-2 block text-sm font-medium">담당 강사</label>
            <input
              value={counselorName}
              onChange={(event) => setCounselorName(event.target.value)}
              className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">면담 일자</label>
            <input
              type="date"
              value={counseledAt}
              onChange={(event) => setCounseledAt(event.target.value)}
              className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm"
            />
          </div>
          <div className="xl:col-span-2">
            <label className="mb-2 block text-sm font-medium">다음 면담 일정</label>
            <input
              type="date"
              value={nextSchedule}
              onChange={(event) => setNextSchedule(event.target.value)}
              className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm"
            />
          </div>
        </div>

        <div className="mt-4">
          <label className="mb-2 block text-sm font-medium">면담 내용</label>
          <textarea
            rows={4}
            value={content}
            onChange={(event) => setContent(event.target.value)}
            className="w-full rounded-3xl border border-ink/10 px-4 py-3 text-sm"
          />
        </div>
        <div className="mt-4">
          <label className="mb-2 block text-sm font-medium">추천 학습 방향</label>
          <textarea
            rows={3}
            value={recommendation}
            onChange={(event) => setRecommendation(event.target.value)}
            className="w-full rounded-3xl border border-ink/10 px-4 py-3 text-sm"
          />
        </div>

        <button
          type="button"
          onClick={createRecord}
          disabled={isPending}
          className="mt-4 inline-flex items-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest disabled:cursor-not-allowed disabled:bg-ink/40"
        >
          {isPending && <Spinner />}
          면담 기록 저장
        </button>
      </section>

      <section className="rounded-[28px] border border-ink/10 bg-white p-6">
        <h2 className="text-xl font-semibold">과거 면담 이력</h2>
        <div className="mt-6 space-y-4">
          {records.length === 0 ? (
            <div className="rounded-[28px] border border-dashed border-ink/10 p-8 text-center text-sm text-slate">
              저장된 면담 기록이 없습니다.
            </div>
          ) : null}
          {records.map((record) => (
            <form key={record.id} className="rounded-[24px] border border-ink/10 bg-mist p-4">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div>
                  <label className="mb-2 block text-sm font-medium">담당 강사</label>
                  <input
                    name="counselorName"
                    defaultValue={record.counselorName}
                    className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium">면담 일자</label>
                  <input
                    type="date"
                    name="counseledAt"
                    defaultValue={toDateInputValue(record.counseledAt)}
                    className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm"
                  />
                </div>
                <div className="xl:col-span-2">
                  <label className="mb-2 block text-sm font-medium">다음 면담 일정</label>
                  <input
                    type="date"
                    name="nextSchedule"
                    defaultValue={toDateInputValue(record.nextSchedule)}
                    className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm"
                  />
                </div>
              </div>
              <div className="mt-4">
                <label className="mb-2 block text-sm font-medium">면담 내용</label>
                <textarea
                  name="content"
                  rows={3}
                  defaultValue={record.content}
                  className="w-full rounded-3xl border border-ink/10 px-4 py-3 text-sm"
                />
              </div>
              <div className="mt-4">
                <label className="mb-2 block text-sm font-medium">추천 학습 방향</label>
                <textarea
                  name="recommendation"
                  rows={2}
                  defaultValue={record.recommendation ?? ""}
                  className="w-full rounded-3xl border border-ink/10 px-4 py-3 text-sm"
                />
              </div>
              <div className="mt-4 flex justify-between">
                <button
                  type="button"
                  onClick={() => deleteRecord(record.id)}
                  disabled={isPending}
                  className="inline-flex items-center rounded-full border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isPending && <Spinner />}
                  삭제
                </button>
                <button
                  type="button"
                  onClick={(event) => updateRecord(record.id, new FormData(event.currentTarget.form!))}
                  disabled={isPending}
                  className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ember/30 hover:text-ember disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isPending && <Spinner />}
                  수정 저장
                </button>
              </div>
            </form>
          ))}
        </div>
      </section>
    </div>
  );
}
