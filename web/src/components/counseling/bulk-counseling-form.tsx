"use client";

import { ExamType, StudentStatus } from "@prisma/client";
import { createPortal } from "react-dom";
import { useEffect, useState, useTransition } from "react";
import { STATUS_BADGE_CLASS, STATUS_LABEL } from "@/lib/analytics/presentation";
import { EXAM_TYPE_LABEL } from "@/lib/constants";
import { toDateInputValue } from "@/lib/format";

type WarningStudent = {
  examNumber: string;
  name: string;
  currentStatus: StudentStatus;
  examType: ExamType;
};

type Props = {
  defaultCounselorName: string;
  warningStudents: WarningStudent[];
};

type StatusFilter = "ALL" | "WARNING" | "DROPOUT";
type ExamTypeFilter = "ALL" | ExamType;

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

function isWarningStatus(status: StudentStatus) {
  return status === StudentStatus.WARNING_1 || status === StudentStatus.WARNING_2;
}

export function BulkCounselingForm({ defaultCounselorName, warningStudents }: Props) {
  const [selectedExamNumbers, setSelectedExamNumbers] = useState<Set<string>>(new Set());
  const [manualInput, setManualInput] = useState("");
  const [counselorName, setCounselorName] = useState(defaultCounselorName);
  const [counseledAt, setCounseledAt] = useState(toDateInputValue(new Date()));
  const [nextSchedule, setNextSchedule] = useState("");
  const [content, setContent] = useState("");
  const [recommendation, setRecommendation] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [examTypeFilter, setExamTypeFilter] = useState<ExamTypeFilter>("ALL");

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isPickerOpen) {
      document.body.style.overflow = "";
      return;
    }

    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsPickerOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isPickerOpen]);

  const studentMap = new Map(warningStudents.map((student) => [student.examNumber, student]));
  const trimmedKeyword = searchKeyword.trim().toLowerCase();

  let warningCount = 0;
  let dropoutCount = 0;
  let gongchaeCount = 0;
  let gyeongchaeCount = 0;

  for (const student of warningStudents) {
    if (isWarningStatus(student.currentStatus)) {
      warningCount += 1;
    }
    if (student.currentStatus === StudentStatus.DROPOUT) {
      dropoutCount += 1;
    }
    if (student.examType === ExamType.GONGCHAE) {
      gongchaeCount += 1;
    }
    if (student.examType === ExamType.GYEONGCHAE) {
      gyeongchaeCount += 1;
    }
  }

  const filteredStudents = warningStudents.filter((student) => {
    const matchesKeyword =
      trimmedKeyword.length === 0 ||
      student.name.toLowerCase().includes(trimmedKeyword) ||
      student.examNumber.toLowerCase().includes(trimmedKeyword);

    const matchesStatus =
      statusFilter === "ALL" ||
      (statusFilter === "WARNING" && isWarningStatus(student.currentStatus)) ||
      (statusFilter === "DROPOUT" && student.currentStatus === StudentStatus.DROPOUT);

    const matchesExamType = examTypeFilter === "ALL" || student.examType === examTypeFilter;

    return matchesKeyword && matchesStatus && matchesExamType;
  });

  let filteredSelectedCount = 0;
  for (const student of filteredStudents) {
    if (selectedExamNumbers.has(student.examNumber)) {
      filteredSelectedCount += 1;
    }
  }

  const allFilteredSelected =
    filteredStudents.length > 0 && filteredSelectedCount === filteredStudents.length;
  const someFilteredSelected = filteredSelectedCount > 0;

  const selectedStudents = Array.from(selectedExamNumbers).map((examNumber) => ({
    examNumber,
    student: studentMap.get(examNumber),
  }));

  const selectedSummary =
    selectedStudents.length === 0
      ? "학생 선택 버튼을 눌러 대상 학생을 고르세요."
      : `${selectedStudents
          .slice(0, 3)
          .map(({ examNumber, student }) => (student ? `${student.name}(${examNumber})` : examNumber))
          .join(", ")}${selectedStudents.length > 3 ? ` 외 ${selectedStudents.length - 3}명` : ""}`;

  function toggleStudent(examNumber: string) {
    setSelectedExamNumbers((prev) => {
      const next = new Set(prev);
      if (next.has(examNumber)) {
        next.delete(examNumber);
      } else {
        next.add(examNumber);
      }
      return next;
    });
  }

  function selectFilteredStudents() {
    setSelectedExamNumbers((prev) => {
      const next = new Set(prev);
      filteredStudents.forEach((student) => next.add(student.examNumber));
      return next;
    });
  }

  function deselectFilteredStudents() {
    setSelectedExamNumbers((prev) => {
      const next = new Set(prev);
      filteredStudents.forEach((student) => next.delete(student.examNumber));
      return next;
    });
  }

  function clearSelection() {
    setSelectedExamNumbers(new Set());
    setManualInput("");
  }

  function addManualStudents() {
    const numbers = manualInput
      .split(/[\s,;]+/)
      .map((value) => value.trim())
      .filter(Boolean);

    if (numbers.length === 0) {
      return;
    }

    setSelectedExamNumbers((prev) => {
      const next = new Set(prev);
      numbers.forEach((number) => next.add(number));
      return next;
    });
    setManualInput("");
  }

  function removeSelected(examNumber: string) {
    setSelectedExamNumbers((prev) => {
      const next = new Set(prev);
      next.delete(examNumber);
      return next;
    });
  }

  function submitBulk() {
    if (selectedExamNumbers.size === 0) {
      setErrorMessage("학생을 1명 이상 선택해 주세요.");
      return;
    }

    if (!content.trim()) {
      setErrorMessage("면담 내용을 입력해 주세요.");
      return;
    }

    setNotice(null);
    setErrorMessage(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/counseling/bulk-create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            examNumbers: Array.from(selectedExamNumbers),
            counselorName,
            content,
            recommendation: recommendation || null,
            counseledAt,
            nextSchedule: nextSchedule || null,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error ?? "요청에 실패했습니다.");
        }

        const { succeeded, errors } = data as {
          succeeded: number;
          errors: { examNumber: string; message: string }[];
        };

        if (errors.length > 0) {
          const failList = errors.map((error) => `${error.examNumber}(${error.message})`).join(", ");
          setErrorMessage(`${errors.length}건 실패: ${failList}`);
        }

        if (succeeded > 0 && errors.length === 0) {
          setNotice(`${succeeded}명의 면담 기록을 등록했습니다.`);
          setSelectedExamNumbers(new Set());
          setContent("");
          setRecommendation("");
          setNextSchedule("");
          setManualInput("");
          return;
        }

        if (succeeded > 0) {
          setNotice(`${succeeded}명의 면담 기록을 등록했습니다. 실패한 학생은 선택 상태로 유지했습니다.`);
          setSelectedExamNumbers(new Set(errors.map((error) => error.examNumber)));
        }
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "일괄 등록에 실패했습니다.");
      }
    });
  }

  return (
    <div className="space-y-5">
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

      <div className="rounded-[24px] border border-ink/10 bg-mist/60 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">대상 학생</p>
            <p className="mt-2 text-lg font-semibold text-ink">{selectedExamNumbers.size}명 선택됨</p>
            <p className="mt-1 text-sm text-slate">{selectedSummary}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setIsPickerOpen(true)}
              className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white transition hover:bg-forest"
            >
              학생 선택
            </button>
            <button
              type="button"
              onClick={clearSelection}
              disabled={selectedExamNumbers.size === 0}
              className="rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold text-slate transition hover:border-red-200 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              선택 초기화
            </button>
          </div>
        </div>

        {selectedStudents.length > 0 ? (
          <div className="mt-4 max-h-32 overflow-y-auto">
            <div className="flex flex-wrap gap-2">
              {selectedStudents.map(({ examNumber, student }) => (
                <span
                  key={examNumber}
                  className="inline-flex items-center gap-2 rounded-full border border-forest/20 bg-white px-3 py-1.5 text-xs font-semibold text-forest"
                >
                  <span>{student ? `${student.name} · ${examNumber}` : `${examNumber} · 직접 추가`}</span>
                  <button
                    type="button"
                    onClick={() => removeSelected(examNumber)}
                    className="rounded-full text-forest/60 transition hover:text-red-600"
                    aria-label={`${examNumber} 선택 해제`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate">
            학생 선택 패널에서 이름이나 학번으로 검색한 뒤 체크박스로 대상을 고를 수 있습니다.
          </p>
        )}
      </div>

      {mounted
        ? createPortal(
            <>
              <div
                aria-hidden="true"
                onClick={() => setIsPickerOpen(false)}
                className={`fixed inset-0 z-[9998] bg-black/50 transition-opacity ${
                  isPickerOpen ? "opacity-100" : "pointer-events-none opacity-0"
                }`}
              />

              <aside
                role="dialog"
                aria-modal="true"
                aria-label="일괄 면담 대상 학생 선택"
                className={`fixed right-0 top-0 z-[9999] flex h-full w-full max-w-[560px] flex-col bg-white shadow-2xl transition-transform duration-300 ${
                  isPickerOpen ? "translate-x-0" : "translate-x-full"
                }`}
              >
                <div className="border-b border-ink/10 px-6 py-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">학생 선택</p>
                      <h3 className="mt-2 text-xl font-semibold text-ink">검색과 필터로 대상 고르기</h3>
                      <p className="mt-1 text-sm text-slate">
                        이름이나 학번으로 찾고, 상태와 과정으로 좁힌 뒤 체크박스로 선택하세요.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsPickerOpen(false)}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-ink/10 text-lg text-slate transition hover:border-ink/20 hover:text-ink"
                      aria-label="학생 선택 패널 닫기"
                    >
                      ×
                    </button>
                  </div>

                  <div className="mt-4 grid gap-4">
                    <div>
                      <label className="mb-2 block text-xs font-semibold text-slate">이름 또는 학번 검색</label>
                      <input
                        type="text"
                        value={searchKeyword}
                        onChange={(event) => setSearchKeyword(event.target.value)}
                        placeholder="예: 김민규, 22569"
                        className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm"
                      />
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <p className="text-xs font-semibold text-slate">상태 필터</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {[
                            { key: "ALL", label: `전체 ${warningStudents.length}명` },
                            { key: "WARNING", label: `경고 ${warningCount}명` },
                            { key: "DROPOUT", label: `탈락 ${dropoutCount}명` },
                          ].map((option) => (
                            <button
                              key={option.key}
                              type="button"
                              onClick={() => setStatusFilter(option.key as StatusFilter)}
                              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                                statusFilter === option.key
                                  ? "bg-ink text-white"
                                  : "border border-ink/10 bg-white text-slate hover:border-ink/20 hover:text-ink"
                              }`}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <p className="text-xs font-semibold text-slate">과정 필터</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {[
                            { key: "ALL", label: `전체 과정 ${warningStudents.length}명` },
                            { key: ExamType.GONGCHAE, label: `공채 ${gongchaeCount}명` },
                            { key: ExamType.GYEONGCHAE, label: `경채 ${gyeongchaeCount}명` },
                          ].map((option) => (
                            <button
                              key={option.key}
                              type="button"
                              onClick={() => setExamTypeFilter(option.key as ExamTypeFilter)}
                              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                                examTypeFilter === option.key
                                  ? "bg-ink text-white"
                                  : "border border-ink/10 bg-white text-slate hover:border-ink/20 hover:text-ink"
                              }`}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/10 px-6 py-4">
                  <div>
                    <p className="text-sm font-semibold text-ink">현재 조건에 맞는 학생 {filteredStudents.length}명</p>
                    <p className="mt-1 text-xs text-slate">
                      선택된 학생 {filteredSelectedCount}명 · 원하는 학생만 골라 일괄 기록 대상으로 추가하세요.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={selectFilteredStudents}
                      disabled={filteredStudents.length === 0 || allFilteredSelected}
                      className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      현재 결과 전체 선택
                    </button>
                    <button
                      type="button"
                      onClick={deselectFilteredStudents}
                      disabled={!someFilteredSelected}
                      className="rounded-full border border-ink/10 px-3 py-1.5 text-xs font-semibold text-slate transition hover:border-red-200 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      현재 결과 선택 해제
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-4">
                  {filteredStudents.length === 0 ? (
                    <div className="rounded-[20px] border border-dashed border-ink/10 bg-mist/50 px-4 py-10 text-center text-sm text-slate">
                      현재 검색 조건에 맞는 학생이 없습니다. 검색어 또는 필터를 조정해 주세요.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {filteredStudents.map((student) => {
                        const isSelected = selectedExamNumbers.has(student.examNumber);

                        return (
                          <label
                            key={student.examNumber}
                            className={`block cursor-pointer rounded-[20px] border px-4 py-3 transition ${
                              isSelected
                                ? "border-forest bg-forest/5"
                                : "border-ink/10 bg-white hover:border-forest/30 hover:bg-mist/60"
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleStudent(student.examNumber)}
                                className="mt-1 h-4 w-4 rounded border-ink/20 text-forest focus:ring-forest"
                              />
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-sm font-semibold text-ink">{student.name}</span>
                                  <span className="text-xs text-slate">{student.examNumber}</span>
                                  <span className="rounded-full border border-ink/10 bg-mist px-2 py-0.5 text-xs font-semibold text-slate">
                                    {EXAM_TYPE_LABEL[student.examType]}
                                  </span>
                                  <span
                                    className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${STATUS_BADGE_CLASS[student.currentStatus]}`}
                                  >
                                    {STATUS_LABEL[student.currentStatus]}
                                  </span>
                                </div>
                                <p className="mt-2 text-xs text-slate">
                                  {isSelected
                                    ? "선택된 학생입니다. 체크를 해제하면 대상에서 제외됩니다."
                                    : "체크하면 일괄 면담 기록 대상에 추가됩니다."}
                                </p>
                              </div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  )}

                  <div className="mt-4 rounded-[20px] border border-dashed border-ink/10 bg-mist/60 p-4">
                    <p className="text-sm font-semibold text-ink">학번 직접 추가</p>
                    <p className="mt-1 text-xs text-slate">
                      목록에 없는 학생은 학번으로 바로 추가할 수 있습니다. 공백, 쉼표, 세미콜론으로 여러 개를 입력할 수 있습니다.
                    </p>
                    <div className="mt-3 flex gap-2">
                      <input
                        type="text"
                        value={manualInput}
                        onChange={(event) => setManualInput(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            addManualStudents();
                          }
                        }}
                        placeholder="예: 22569 22583, 25316"
                        className="flex-1 rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
                      />
                      <button
                        type="button"
                        onClick={addManualStudents}
                        className="rounded-full border border-ink/10 bg-white px-4 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
                      >
                        추가
                      </button>
                    </div>
                  </div>
                </div>

                <div className="border-t border-ink/10 px-6 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm text-slate">
                      <span className="font-semibold text-ink">{selectedExamNumbers.size}명</span> 선택됨
                    </p>
                    <button
                      type="button"
                      onClick={() => setIsPickerOpen(false)}
                      className="rounded-full bg-forest px-4 py-2 text-sm font-semibold text-white transition hover:bg-forest/80"
                    >
                      선택 완료
                    </button>
                  </div>
                </div>
              </aside>
            </>,
            document.body,
          )
        : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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

      <div>
        <label className="mb-2 block text-sm font-medium">면담 내용 (공통 적용)</label>
        <textarea
          rows={4}
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder="선택된 모든 학생에게 같은 면담 기록이 등록됩니다."
          className="w-full rounded-3xl border border-ink/10 px-4 py-3 text-sm"
        />
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium">추천 학습 방향</label>
        <textarea
          rows={3}
          value={recommendation}
          onChange={(event) => setRecommendation(event.target.value)}
          className="w-full rounded-3xl border border-ink/10 px-4 py-3 text-sm"
        />
      </div>

      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={submitBulk}
          disabled={isPending || selectedExamNumbers.size === 0}
          className="inline-flex items-center rounded-full bg-forest px-6 py-3 text-sm font-semibold text-white transition hover:bg-forest/80 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending && <Spinner />}
          {selectedExamNumbers.size > 0
            ? `${selectedExamNumbers.size}명 면담 기록 일괄 등록`
            : "학생을 먼저 선택해 주세요"}
        </button>
      </div>
    </div>
  );
}
