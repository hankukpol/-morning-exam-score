"use client";

import { useRef, useState, useTransition } from "react";
import type { PeriodOption, SessionOption } from "./page";

type SubjectOption = { key: string; label: string };

type CsvRow = {
  row: number;
  examNumber: string;
  scores: Record<string, number>;
  rawValues: Record<string, string>;
  errors: string[];
};

type ImportResult = {
  success: number;
  failed: Array<{ examNumber: string; subject: string; reason: string }>;
  sessionsFound: number;
  totalEntries: number;
};

type Props = {
  periodOptions: PeriodOption[];
  subjectOptions: SubjectOption[];
};

// Derive unique exam dates from sessions
function getUniqueDates(sessions: SessionOption[]): string[] {
  const dateSet = new Set<string>();
  for (const s of sessions) {
    const d = s.examDate.slice(0, 10);
    dateSet.add(d);
  }
  return [...dateSet].sort();
}

// Get subjects available on a given date
function getSubjectsForDate(sessions: SessionOption[], date: string): string[] {
  return sessions
    .filter((s) => s.examDate.slice(0, 10) === date)
    .map((s) => s.subject);
}

// Format date for display
function formatDateDisplay(iso: string): string {
  const d = new Date(iso);
  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}(${weekdays[d.getDay()]})`;
}

// Parse CSV text into rows, using the first-row headers to determine subject columns
function parseCsvText(
  text: string,
  availableSubjectKeys: Set<string>,
  subjectLabelToKey: Record<string, string>,
): { rows: CsvRow[]; headers: string[]; subjectColumns: Array<{ header: string; subjectKey: string }> } {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return { rows: [], headers: [], subjectColumns: [] };
  }

  const headerLine = lines[0];
  const headers = headerLine.split(",").map((h) => h.trim());

  // First column must be 학번
  const examNumberCol = headers[0]?.toLowerCase();
  const isHeaderRow =
    examNumberCol === "학번" ||
    examNumberCol === "examnumber" ||
    examNumberCol === "수험번호" ||
    examNumberCol === "번호";

  // Map remaining headers to subject keys
  const subjectColumns: Array<{ header: string; subjectKey: string }> = [];
  const dataStartLine = isHeaderRow ? 1 : 0;

  if (isHeaderRow) {
    for (let i = 1; i < headers.length; i++) {
      const h = headers[i];
      // Try direct enum key match
      if (availableSubjectKeys.has(h)) {
        subjectColumns.push({ header: h, subjectKey: h });
        continue;
      }
      // Try label match
      const keyByLabel = subjectLabelToKey[h];
      if (keyByLabel) {
        subjectColumns.push({ header: h, subjectKey: keyByLabel });
        continue;
      }
      // Unknown column — include as-is, will result in "no session" error
      subjectColumns.push({ header: h, subjectKey: h });
    }
  }

  const rows: CsvRow[] = [];
  for (let i = dataStartLine; i < lines.length; i++) {
    const vals = lines[i].split(",").map((v) => v.trim());
    const examNumber = vals[0] ?? "";
    const scores: Record<string, number> = {};
    const rawValues: Record<string, string> = {};
    const errors: string[] = [];

    if (!examNumber) {
      rows.push({ row: i + 1, examNumber: "", scores, rawValues, errors: ["학번이 비어 있음"] });
      continue;
    }

    if (isHeaderRow) {
      for (let j = 0; j < subjectColumns.length; j++) {
        const { header, subjectKey } = subjectColumns[j];
        const rawVal = vals[j + 1] ?? "";
        rawValues[header] = rawVal;
        if (rawVal === "" || rawVal === "-") continue;
        const n = Number(rawVal);
        if (!Number.isFinite(n)) {
          errors.push(`${header} 점수 "${rawVal}" 파싱 실패`);
        } else if (n < 0 || n > 100) {
          errors.push(`${header} 점수 ${n}이 범위(0~100)를 벗어남`);
        } else {
          scores[subjectKey] = n;
        }
      }
    } else {
      // No header: columns 1..N are assumed to be in order of availableSubjectKeys
      const subjectKeyList = [...availableSubjectKeys];
      for (let j = 0; j < subjectKeyList.length && j + 1 < vals.length; j++) {
        const rawVal = vals[j + 1] ?? "";
        rawValues[subjectKeyList[j]] = rawVal;
        if (rawVal === "" || rawVal === "-") continue;
        const n = Number(rawVal);
        if (!Number.isFinite(n)) {
          errors.push(`열 ${j + 2} 점수 "${rawVal}" 파싱 실패`);
        } else if (n < 0 || n > 100) {
          errors.push(`열 ${j + 2} 점수 ${n}이 범위(0~100)를 벗어남`);
        } else {
          scores[subjectKeyList[j]] = n;
        }
      }
    }

    rows.push({ row: i + 1, examNumber, scores, rawValues, errors });
  }

  return { rows, headers: isHeaderRow ? headers : [], subjectColumns };
}

export function ScoreCsvImporter({ periodOptions, subjectOptions }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();

  const [selectedPeriodIdx, setSelectedPeriodIdx] = useState<number>(() => {
    const activeIdx = periodOptions.findIndex((p) => p.isActive);
    return activeIdx >= 0 ? activeIdx : 0;
  });
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [csvRows, setCsvRows] = useState<CsvRow[]>([]);
  const [csvSubjectColumns, setCsvSubjectColumns] = useState<
    Array<{ header: string; subjectKey: string }>
  >([]);
  const [fileName, setFileName] = useState<string>("");
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const selectedPeriod = periodOptions[selectedPeriodIdx] ?? null;
  const availableDates = selectedPeriod ? getUniqueDates(selectedPeriod.sessions) : [];
  const subjectsOnDate = selectedPeriod && selectedDate
    ? getSubjectsForDate(selectedPeriod.sessions, selectedDate)
    : [];

  const subjectLabelToKey: Record<string, string> = {};
  for (const s of subjectOptions) {
    subjectLabelToKey[s.label] = s.key;
  }

  const allSubjectKeys = new Set(subjectOptions.map((s) => s.key));

  const validRows = csvRows.filter((r) => r.errors.length === 0 && Object.keys(r.scores).length > 0);
  const errorRows = csvRows.filter((r) => r.errors.length > 0 || r.examNumber === "");
  const emptyScoreRows = csvRows.filter(
    (r) => r.errors.length === 0 && r.examNumber !== "" && Object.keys(r.scores).length === 0,
  );

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setImportResult(null);
    setErrorMsg(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const availableKeys =
        subjectsOnDate.length > 0 ? new Set(subjectsOnDate) : allSubjectKeys;
      const { rows, subjectColumns } = parseCsvText(text, availableKeys, subjectLabelToKey);
      setCsvRows(rows);
      setCsvSubjectColumns(subjectColumns);
    };
    reader.readAsText(file, "utf-8");
  }

  function handlePeriodChange(idx: number) {
    setSelectedPeriodIdx(idx);
    setSelectedDate("");
    setCsvRows([]);
    setCsvSubjectColumns([]);
    setFileName("");
    setImportResult(null);
    setErrorMsg(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleDateChange(date: string) {
    setSelectedDate(date);
    // Re-parse CSV with new subject constraints if file already loaded
    if (fileInputRef.current?.files?.[0]) {
      const file = fileInputRef.current.files[0];
      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target?.result as string;
        const sessions = selectedPeriod?.sessions ?? [];
        const newSubjects = getSubjectsForDate(sessions, date);
        const availableKeys = newSubjects.length > 0 ? new Set(newSubjects) : allSubjectKeys;
        const { rows, subjectColumns } = parseCsvText(text, availableKeys, subjectLabelToKey);
        setCsvRows(rows);
        setCsvSubjectColumns(subjectColumns);
      };
      reader.readAsText(file, "utf-8");
    }
    setImportResult(null);
    setErrorMsg(null);
  }

  function downloadTemplate() {
    const subjectHeaders = subjectsOnDate.length > 0
      ? subjectsOnDate
          .map((k) => subjectOptions.find((s) => s.key === k)?.label ?? k)
          .join(",")
      : subjectOptions.map((s) => s.label).join(",");
    const header = `학번,${subjectHeaders}`;
    const example1 = `2024001,85,72,90,78,83`;
    const example2 = `2024002,88,,92,,87`;
    const csv = [header, example1, example2].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "score_import_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImport() {
    if (!selectedPeriod || !selectedDate || validRows.length === 0) return;
    setImportResult(null);
    setErrorMsg(null);

    const entries = validRows.map((row) => ({
      examNumber: row.examNumber,
      scores: row.scores,
    }));

    startTransition(async () => {
      try {
        const res = await fetch("/api/scores/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            periodId: selectedPeriod.id,
            examDate: selectedDate,
            examType: selectedPeriod.examType,
            entries,
          }),
          cache: "no-store",
        });
        const json = await res.json() as { data?: ImportResult; error?: string };
        if (!res.ok) {
          setErrorMsg(json.error ?? "가져오기에 실패했습니다.");
          return;
        }
        if (json.data) {
          setImportResult(json.data);
          setCsvRows([]);
          setCsvSubjectColumns([]);
          setFileName("");
          if (fileInputRef.current) fileInputRef.current.value = "";
        }
      } catch {
        setErrorMsg("네트워크 오류가 발생했습니다.");
      }
    });
  }

  return (
    <div className="space-y-8">
      {/* Format guide */}
      <section className="rounded-[24px] border border-forest/20 bg-forest/5 p-6">
        <h2 className="text-base font-semibold text-forest">CSV 파일 형식 안내</h2>
        <p className="mt-2 text-sm leading-7 text-slate">
          첫 행은 헤더(학번, 과목명...)이며, 이후 행은 학번과 각 과목 점수를 쉼표로 구분합니다.
          과목명은 한글 과목명 또는 영문 키(예: CRIMINAL_LAW)를 사용하세요.
          점수가 없는 칸은 비워 두거나 하이픈(-)을 입력하세요.
        </p>
        <pre className="mt-3 overflow-x-auto rounded-xl bg-white p-4 text-xs leading-6 text-ink">
          {`학번,형법,헌법,형사소송법,경찰학
2024001,85,72,90,78
2024002,88,,92,
2024003,75,80,,83`}
        </pre>
        <div className="mt-3 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={downloadTemplate}
            className="inline-flex items-center gap-1.5 rounded-full border border-forest/30 px-4 py-2 text-xs font-semibold text-forest transition hover:bg-forest/10"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-3.5 w-3.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            CSV 양식 다운로드
          </button>
        </div>
      </section>

      {/* Step 1: Period selection */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-ink">1단계 — 시험 기간 선택</h2>
        {periodOptions.length === 0 ? (
          <p className="text-sm text-slate">등록된 시험 기간이 없습니다.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {periodOptions.map((p, idx) => (
              <button
                key={`${p.id}-${p.examType}`}
                type="button"
                onClick={() => handlePeriodChange(idx)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  selectedPeriodIdx === idx
                    ? "bg-ink text-white"
                    : "border border-ink/10 text-ink hover:border-ember/30 hover:text-ember"
                }`}
              >
                {p.name}
                {p.isActive && <span className="ml-1.5 text-xs opacity-70">활성</span>}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Step 2: Date selection */}
      {selectedPeriod && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-ink">2단계 — 시험 날짜 선택</h2>
          {availableDates.length === 0 ? (
            <p className="text-sm text-slate">이 기간에 등록된 시험 회차가 없습니다.</p>
          ) : (
            <div className="overflow-hidden rounded-[24px] border border-ink/10 bg-white">
              <div className="max-h-52 overflow-y-auto divide-y divide-ink/5">
                {availableDates.map((date) => {
                  const subjects = getSubjectsForDate(selectedPeriod.sessions, date);
                  return (
                    <button
                      key={date}
                      type="button"
                      onClick={() => handleDateChange(date)}
                      className={`flex w-full items-center justify-between px-5 py-3 text-left text-sm transition ${
                        selectedDate === date
                          ? "bg-ink text-white"
                          : "hover:bg-mist"
                      }`}
                    >
                      <span className="font-semibold">{formatDateDisplay(date + "T00:00:00")}</span>
                      <span className={`text-xs ${selectedDate === date ? "opacity-70" : "text-slate"}`}>
                        {subjects.length}개 과목
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {selectedDate && subjectsOnDate.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {subjectsOnDate.map((k) => (
                <span
                  key={k}
                  className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-0.5 text-xs font-medium text-forest"
                >
                  {subjectOptions.find((s) => s.key === k)?.label ?? k}
                </span>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Step 3: File upload */}
      {selectedPeriod && selectedDate && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-ink">3단계 — CSV 파일 업로드</h2>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.txt"
            onChange={handleFileChange}
            className="block w-full rounded-xl border border-ink/10 px-4 py-2 text-sm file:mr-4 file:rounded-full file:border-0 file:bg-ember/10 file:px-4 file:py-1 file:text-sm file:font-semibold file:text-ember hover:file:bg-ember/20"
          />
          {fileName && (
            <p className="text-xs text-slate">
              파일: <span className="font-medium text-ink">{fileName}</span>
            </p>
          )}
        </section>
      )}

      {/* Preview */}
      {csvRows.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink">4단계 — 미리보기 및 가져오기</h2>
            <div className="flex gap-3 text-xs">
              <span className="font-medium text-green-700">
                유효: {validRows.length}건
              </span>
              {emptyScoreRows.length > 0 && (
                <span className="font-medium text-amber-700">
                  점수 없음: {emptyScoreRows.length}건
                </span>
              )}
              {errorRows.length > 0 && (
                <span className="font-medium text-red-700">
                  오류: {errorRows.length}건
                </span>
              )}
            </div>
          </div>

          {/* Preview table */}
          <div className="overflow-x-auto rounded-[24px] border border-ink/10 bg-white">
            <table className="min-w-full divide-y divide-ink/5 text-sm">
              <thead>
                <tr>
                  <th className="bg-mist/50 px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate whitespace-nowrap">
                    행
                  </th>
                  <th className="bg-mist/50 px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate whitespace-nowrap">
                    학번
                  </th>
                  {csvSubjectColumns.map((col) => (
                    <th
                      key={col.header}
                      className="bg-mist/50 px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-slate whitespace-nowrap"
                    >
                      {col.header}
                    </th>
                  ))}
                  <th className="bg-mist/50 px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate whitespace-nowrap">
                    상태
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {csvRows.slice(0, 20).map((row) => (
                  <tr
                    key={row.row}
                    className={`${
                      row.errors.length > 0
                        ? "bg-red-50"
                        : Object.keys(row.scores).length === 0
                          ? "bg-amber-50/50"
                          : ""
                    }`}
                  >
                    <td className="px-4 py-2 tabular-nums text-xs text-slate">{row.row}</td>
                    <td className="px-4 py-2 font-mono text-xs font-medium text-ink">
                      {row.examNumber || <span className="text-red-600">(없음)</span>}
                    </td>
                    {csvSubjectColumns.map((col) => {
                      const score = row.scores[col.subjectKey];
                      const rawVal = row.rawValues[col.header] ?? "";
                      return (
                        <td key={col.header} className="px-4 py-2 text-right tabular-nums text-xs">
                          {score !== undefined ? (
                            <span className="font-semibold text-ink">{score}</span>
                          ) : rawVal && rawVal !== "-" ? (
                            <span className="text-red-600">{rawVal}</span>
                          ) : (
                            <span className="text-slate">—</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-4 py-2 text-xs">
                      {row.errors.length > 0 ? (
                        <span className="text-red-600">{row.errors.join("; ")}</span>
                      ) : Object.keys(row.scores).length === 0 ? (
                        <span className="text-amber-600">점수 없음</span>
                      ) : (
                        <span className="text-green-600">OK</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {csvRows.length > 20 && (
              <p className="px-4 py-3 text-center text-xs text-slate">
                상위 20행만 표시 중 (전체 {csvRows.length}행)
              </p>
            )}
          </div>

          {/* Error message */}
          {errorMsg && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {errorMsg}
            </div>
          )}

          {/* Import button */}
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={handleImport}
              disabled={isPending || validRows.length === 0}
              className={`inline-flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-semibold text-white transition ${
                isPending || validRows.length === 0
                  ? "cursor-not-allowed bg-ink/30"
                  : "bg-ember hover:bg-ember/90"
              }`}
            >
              {isPending ? "가져오는 중..." : `가져오기 실행 (${validRows.length}건)`}
            </button>
            {errorRows.length > 0 && (
              <p className="text-xs text-amber-700">
                오류 {errorRows.length}건은 제외되고 유효한 {validRows.length}건만 가져옵니다.
              </p>
            )}
          </div>
        </section>
      )}

      {/* Import result */}
      {importResult && (
        <section className="rounded-[24px] border border-forest/20 bg-forest/5 p-6">
          <h2 className="text-base font-semibold text-forest">가져오기 완료</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div className="rounded-[20px] bg-white p-4">
              <p className="text-xs text-slate">성공</p>
              <p className="mt-1 text-2xl font-bold text-forest">{importResult.success}건</p>
            </div>
            <div className="rounded-[20px] bg-white p-4">
              <p className="text-xs text-slate">세션 매칭</p>
              <p className="mt-1 text-2xl font-bold text-ink">{importResult.sessionsFound}개 과목</p>
            </div>
            <div
              className={`rounded-[20px] p-4 ${importResult.failed.length > 0 ? "bg-red-50" : "bg-white"}`}
            >
              <p className="text-xs text-slate">실패</p>
              <p
                className={`mt-1 text-2xl font-bold ${importResult.failed.length > 0 ? "text-red-600" : "text-slate"}`}
              >
                {importResult.failed.length}건
              </p>
            </div>
          </div>

          {importResult.failed.length > 0 && (
            <div className="mt-4">
              <h3 className="text-xs font-semibold text-slate uppercase tracking-wide mb-2">실패 목록</h3>
              <div className="overflow-x-auto rounded-xl border border-red-200 bg-white">
                <table className="min-w-full divide-y divide-red-100 text-xs">
                  <thead>
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-slate">학번</th>
                      <th className="px-3 py-2 text-left font-medium text-slate">과목</th>
                      <th className="px-3 py-2 text-left font-medium text-slate">사유</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-red-50">
                    {importResult.failed.map((f, i) => (
                      <tr key={i}>
                        <td className="px-3 py-2 font-mono text-ink">{f.examNumber}</td>
                        <td className="px-3 py-2 text-slate">{f.subject}</td>
                        <td className="px-3 py-2 text-red-600">{f.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
