"use client";

import { useState, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type PeriodOption = {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  isGongchaeEnabled: boolean;
  isGyeongchaeEnabled: boolean;
  totalWeeks: number;
};

type ExamTypeOption = "GONGCHAE" | "GYEONGCHAE";
type SubjectOption =
  | "CONSTITUTIONAL_LAW"
  | "CRIMINOLOGY"
  | "CRIMINAL_PROCEDURE"
  | "CRIMINAL_LAW"
  | "POLICE_SCIENCE"
  | "CUMULATIVE";

type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

const DAY_LABELS: Record<DayOfWeek, string> = {
  0: "일",
  1: "월",
  2: "화",
  3: "수",
  4: "목",
  5: "금",
  6: "토",
};

const WEEKDAYS: DayOfWeek[] = [1, 2, 3, 4, 5];

const EXAM_TYPE_LABEL: Record<ExamTypeOption, string> = {
  GONGCHAE: "공채",
  GYEONGCHAE: "경채",
};

const SUBJECT_LABEL: Record<SubjectOption, string> = {
  CONSTITUTIONAL_LAW: "헌법",
  CRIMINAL_LAW: "형법",
  CRIMINAL_PROCEDURE: "형사소송법",
  POLICE_SCIENCE: "경찰학",
  CRIMINOLOGY: "범죄학",
  CUMULATIVE: "누적 모의고사",
};

const EXAM_TYPE_SUBJECTS: Record<ExamTypeOption, SubjectOption[]> = {
  GONGCHAE: [
    "CONSTITUTIONAL_LAW",
    "CRIMINAL_LAW",
    "CRIMINAL_PROCEDURE",
    "POLICE_SCIENCE",
    "CUMULATIVE",
  ],
  GYEONGCHAE: [
    "CRIMINOLOGY",
    "CRIMINAL_LAW",
    "CRIMINAL_PROCEDURE",
    "POLICE_SCIENCE",
    "CUMULATIVE",
  ],
};

// ─── Preview Row ──────────────────────────────────────────────────────────────

type PreviewSession = {
  date: string; // YYYY-MM-DD
  dayLabel: string;
  examType: ExamTypeOption;
  subject: SubjectOption;
  startTime: string;
  week: number;
  duplicate?: boolean;
};

type DayConfig = {
  enabled: boolean;
  examType: ExamTypeOption;
  subject: SubjectOption;
  startTime: string;
};

// ─── Component ───────────────────────────────────────────────────────────────

export function BulkCreateForm({ periods }: { periods: PeriodOption[] }) {
  const [periodId, setPeriodId] = useState<string>(
    periods.find((p) => p.isActive)?.id.toString() ?? periods[0]?.id.toString() ?? "",
  );
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  const [dayConfigs, setDayConfigs] = useState<Record<DayOfWeek, DayConfig>>({
    0: { enabled: false, examType: "GONGCHAE", subject: "CONSTITUTIONAL_LAW", startTime: "07:00" },
    1: { enabled: true, examType: "GONGCHAE", subject: "CONSTITUTIONAL_LAW", startTime: "07:00" },
    2: { enabled: true, examType: "GONGCHAE", subject: "CRIMINAL_LAW", startTime: "07:00" },
    3: { enabled: true, examType: "GONGCHAE", subject: "CRIMINAL_PROCEDURE", startTime: "07:00" },
    4: { enabled: true, examType: "GONGCHAE", subject: "POLICE_SCIENCE", startTime: "07:00" },
    5: { enabled: true, examType: "GONGCHAE", subject: "CUMULATIVE", startTime: "07:00" },
    6: { enabled: false, examType: "GONGCHAE", subject: "CONSTITUTIONAL_LAW", startTime: "07:00" },
  });

  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState<{
    created: number;
    skipped: number;
    errors: string[];
  } | null>(null);

  const selectedPeriod = periods.find((p) => p.id.toString() === periodId);

  // Build preview list
  const preview = useCallback((): PreviewSession[] => {
    if (!rangeFrom || !rangeTo || !selectedPeriod) return [];

    const sessions: PreviewSession[] = [];
    const fromDate = new Date(rangeFrom + "T00:00:00");
    const toDate = new Date(rangeTo + "T23:59:59");

    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime()) || fromDate > toDate) return [];

    const periodStart = new Date(selectedPeriod.startDate);
    const current = new Date(fromDate);

    while (current <= toDate) {
      const dow = current.getDay() as DayOfWeek;
      const cfg = dayConfigs[dow];

      if (cfg.enabled) {
        // Check exam type enabled in period
        const examTypeEnabled =
          cfg.examType === "GONGCHAE"
            ? selectedPeriod.isGongchaeEnabled
            : selectedPeriod.isGyeongchaeEnabled;

        if (examTypeEnabled) {
          // Calculate week number from period start
          const msFromStart = current.getTime() - periodStart.getTime();
          const week = Math.max(1, Math.ceil(msFromStart / (7 * 24 * 60 * 60 * 1000)));

          const dateStr = current.toISOString().split("T")[0];

          sessions.push({
            date: dateStr,
            dayLabel: DAY_LABELS[dow],
            examType: cfg.examType,
            subject: cfg.subject,
            startTime: cfg.startTime,
            week,
          });
        }
      }

      current.setDate(current.getDate() + 1);
    }

    return sessions;
  }, [rangeFrom, rangeTo, dayConfigs, selectedPeriod]);

  const previewSessions = preview();

  function updateDayConfig(day: DayOfWeek, field: keyof DayConfig, value: string | boolean) {
    setDayConfigs((prev) => ({
      ...prev,
      [day]: { ...prev[day], [field]: value },
    }));
  }

  async function handleSubmit() {
    if (!periodId || previewSessions.length === 0) return;

    setSubmitting(true);
    setResults(null);

    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const session of previewSessions) {
      try {
        const res = await fetch(`/api/periods/${periodId}/sessions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            examType: session.examType,
            subject: session.subject,
            examDate: session.date,
            week: session.week,
          }),
        });

        if (res.ok) {
          created++;
        } else {
          const data = (await res.json()) as { error?: string };
          const msg = data.error ?? "알 수 없는 오류";
          if (msg.includes("이미 존재")) {
            skipped++;
          } else {
            errors.push(`${session.date} ${EXAM_TYPE_LABEL[session.examType]} ${SUBJECT_LABEL[session.subject]}: ${msg}`);
          }
        }
      } catch {
        errors.push(`${session.date}: 네트워크 오류`);
      }
    }

    setResults({ created, skipped, errors });
    setSubmitting(false);
  }

  // Default date range from period
  function fillFromPeriod() {
    if (!selectedPeriod) return;
    setRangeFrom(selectedPeriod.startDate.split("T")[0]);
    setRangeTo(selectedPeriod.endDate.split("T")[0]);
  }

  return (
    <div className="space-y-8">
      {/* ── Step 1: 기간 선택 ──────────────────────────────────────────────── */}
      <div className="rounded-[28px] border border-ink/10 bg-white p-6">
        <h2 className="mb-4 text-base font-semibold text-ink">1단계: 시험 기간 선택</h2>

        {periods.length === 0 ? (
          <p className="text-sm text-slate">등록된 시험 기간이 없습니다.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {periods.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPeriodId(p.id.toString())}
                className={`rounded-xl border px-4 py-2 text-sm font-semibold transition ${
                  periodId === p.id.toString()
                    ? "border-forest bg-forest text-white"
                    : "border-ink/15 bg-white text-slate hover:border-forest/40 hover:text-forest"
                }`}
              >
                {p.name}
                {p.isActive && (
                  <span className="ml-2 rounded-full bg-ember/20 px-1.5 py-0.5 text-xs text-ember">
                    활성
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {selectedPeriod && (
          <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate">
            <span>
              기간:{" "}
              <strong className="text-ink">
                {new Date(selectedPeriod.startDate).toLocaleDateString("ko-KR")} ~{" "}
                {new Date(selectedPeriod.endDate).toLocaleDateString("ko-KR")}
              </strong>
            </span>
            <span>
              직렬:{" "}
              {selectedPeriod.isGongchaeEnabled && (
                <span className="mr-1 rounded-full border border-forest/20 bg-forest/10 px-2 py-0.5 text-forest">
                  공채
                </span>
              )}
              {selectedPeriod.isGyeongchaeEnabled && (
                <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-sky-700">
                  경채
                </span>
              )}
            </span>
            <button
              type="button"
              onClick={fillFromPeriod}
              className="rounded-lg border border-ink/15 px-3 py-1 text-xs font-medium text-slate transition hover:border-forest/30 hover:text-forest"
            >
              기간 전체 자동 입력
            </button>
          </div>
        )}
      </div>

      {/* ── Step 2: 날짜 범위 ──────────────────────────────────────────────── */}
      <div className="rounded-[28px] border border-ink/10 bg-white p-6">
        <h2 className="mb-4 text-base font-semibold text-ink">2단계: 날짜 범위 설정</h2>
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate">시작일</label>
            <input
              type="date"
              value={rangeFrom}
              onChange={(e) => setRangeFrom(e.target.value)}
              className="rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm text-ink focus:border-forest focus:outline-none"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate">종료일</label>
            <input
              type="date"
              value={rangeTo}
              onChange={(e) => setRangeTo(e.target.value)}
              className="rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm text-ink focus:border-forest focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* ── Step 3: 요일별 설정 ────────────────────────────────────────────── */}
      <div className="rounded-[28px] border border-ink/10 bg-white p-6">
        <h2 className="mb-4 text-base font-semibold text-ink">3단계: 요일별 과목 설정</h2>
        <div className="space-y-3">
          {WEEKDAYS.map((day) => {
            const cfg = dayConfigs[day];
            const availableSubjects = EXAM_TYPE_SUBJECTS[cfg.examType];

            return (
              <div
                key={day}
                className={`flex flex-wrap items-center gap-4 rounded-2xl border px-5 py-4 transition ${
                  cfg.enabled
                    ? "border-forest/20 bg-forest/5"
                    : "border-ink/10 bg-white opacity-60"
                }`}
              >
                {/* Checkbox + Day label */}
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={cfg.enabled}
                    onChange={(e) => updateDayConfig(day, "enabled", e.target.checked)}
                    className="h-4 w-4 rounded accent-forest"
                  />
                  <span className="w-4 text-sm font-bold text-ink">{DAY_LABELS[day]}</span>
                </label>

                {/* Exam type */}
                <select
                  disabled={!cfg.enabled}
                  value={cfg.examType}
                  onChange={(e) => {
                    const newType = e.target.value as ExamTypeOption;
                    const newSubjects = EXAM_TYPE_SUBJECTS[newType];
                    const currentSubjectValid = newSubjects.includes(cfg.subject);
                    updateDayConfig(day, "examType", newType);
                    if (!currentSubjectValid) {
                      updateDayConfig(day, "subject", newSubjects[0]);
                    }
                  }}
                  className="rounded-lg border border-ink/15 bg-white px-3 py-1.5 text-sm text-ink focus:border-forest focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {selectedPeriod?.isGongchaeEnabled && (
                    <option value="GONGCHAE">공채</option>
                  )}
                  {selectedPeriod?.isGyeongchaeEnabled && (
                    <option value="GYEONGCHAE">경채</option>
                  )}
                  {!selectedPeriod && (
                    <>
                      <option value="GONGCHAE">공채</option>
                      <option value="GYEONGCHAE">경채</option>
                    </>
                  )}
                </select>

                {/* Subject */}
                <select
                  disabled={!cfg.enabled}
                  value={cfg.subject}
                  onChange={(e) => updateDayConfig(day, "subject", e.target.value)}
                  className="rounded-lg border border-ink/15 bg-white px-3 py-1.5 text-sm text-ink focus:border-forest focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {availableSubjects.map((s) => (
                    <option key={s} value={s}>
                      {SUBJECT_LABEL[s]}
                    </option>
                  ))}
                </select>

                {/* Start time */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate">시작 시간</span>
                  <input
                    type="time"
                    disabled={!cfg.enabled}
                    value={cfg.startTime}
                    onChange={(e) => updateDayConfig(day, "startTime", e.target.value)}
                    className="rounded-lg border border-ink/15 bg-white px-3 py-1.5 text-sm text-ink focus:border-forest focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Preview ────────────────────────────────────────────────────────── */}
      <div className="rounded-[28px] border border-ink/10 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-base font-semibold text-ink">
            미리보기{" "}
            {previewSessions.length > 0 && (
              <span className="ml-2 rounded-full bg-ember/10 px-2.5 py-0.5 text-xs font-bold text-ember">
                {previewSessions.length}개
              </span>
            )}
          </h2>

          {previewSessions.length > 0 && (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || !selectedPeriod}
              className="inline-flex items-center gap-2 rounded-full bg-forest px-6 py-2.5 text-sm font-bold text-white transition hover:bg-forest/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  생성 중...
                </>
              ) : (
                "일괄 생성"
              )}
            </button>
          )}
        </div>

        {previewSessions.length === 0 ? (
          <div className="mt-4 rounded-[20px] border border-dashed border-ink/15 py-10 text-center text-sm text-slate">
            날짜 범위와 요일을 설정하면 생성될 회차 목록이 표시됩니다.
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink/10 text-left text-xs font-semibold uppercase tracking-wide text-slate">
                  <th className="pb-3 pr-4">날짜</th>
                  <th className="pb-3 pr-4">요일</th>
                  <th className="pb-3 pr-4">직렬</th>
                  <th className="pb-3 pr-4">과목</th>
                  <th className="pb-3 pr-4">시작 시간</th>
                  <th className="pb-3">주차</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {previewSessions.map((s, i) => (
                  <tr key={i} className="hover:bg-mist/50">
                    <td className="py-2.5 pr-4 font-mono text-xs text-ink">{s.date}</td>
                    <td className="py-2.5 pr-4 text-slate">{s.dayLabel}요일</td>
                    <td className="py-2.5 pr-4">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                          s.examType === "GONGCHAE"
                            ? "bg-forest/10 text-forest"
                            : "bg-sky-50 text-sky-700"
                        }`}
                      >
                        {EXAM_TYPE_LABEL[s.examType]}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 text-ink">{SUBJECT_LABEL[s.subject]}</td>
                    <td className="py-2.5 pr-4 text-slate">{s.startTime}</td>
                    <td className="py-2.5 text-slate">{s.week}주차</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Results ────────────────────────────────────────────────────────── */}
      {results && (
        <div
          className={`rounded-[24px] border p-6 ${
            results.errors.length > 0
              ? "border-amber-200 bg-amber-50"
              : "border-forest/20 bg-forest/5"
          }`}
        >
          <h3 className="mb-3 text-base font-semibold text-ink">일괄 생성 결과</h3>
          <div className="flex flex-wrap gap-4 text-sm">
            <span className="font-semibold text-forest">생성 완료: {results.created}개</span>
            <span className="text-slate">중복 건너뜀: {results.skipped}개</span>
            {results.errors.length > 0 && (
              <span className="text-red-600">오류: {results.errors.length}개</span>
            )}
          </div>
          {results.errors.length > 0 && (
            <div className="mt-3 space-y-1">
              {results.errors.map((e, i) => (
                <p key={i} className="text-xs text-red-700">
                  • {e}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
