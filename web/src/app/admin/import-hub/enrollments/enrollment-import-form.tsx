"use client";

import { useRef, useState } from "react";

type ParsedRow = {
  examNumber: string;
  courseType: string;
  courseName: string;
  startDate: string;
  endDate: string;
  regularFee: string;
  discountAmount: string;
  staffExamNumber: string;
  _rowIndex: number;
  _error?: string;
};

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]/g, "")
    .trim();
}

function mapHeaders(headers: string[]): Record<string, number> {
  const normalized = headers.map(normalizeHeader);
  const mapping: Record<string, number> = {};

  const aliases: Record<string, string[]> = {
    examNumber: ["학번", "수험번호", "examnumber", "studentid"],
    courseType: ["강좌유형", "유형", "coursetype", "type"],
    courseName: ["강좌명", "강좌", "coursename", "name"],
    startDate: ["시작일", "수강시작일", "startdate", "start"],
    endDate: ["종료일", "수강종료일", "enddate", "end"],
    regularFee: ["수강료", "정가", "regularfee", "fee"],
    discountAmount: ["할인금액", "할인", "discountamount", "discount"],
    staffExamNumber: ["담당자학번", "담당자", "staffexamnumber", "staff"],
  };

  for (const [field, keys] of Object.entries(aliases)) {
    for (const key of keys) {
      const idx = normalized.indexOf(normalizeHeader(key));
      if (idx !== -1) {
        mapping[field] = idx;
        break;
      }
    }
  }

  return mapping;
}

const VALID_COURSE_TYPES = ["종합", "이론", "단과", "특강"];

function validateCourseType(v: string): boolean {
  return !v || VALID_COURSE_TYPES.includes(v.trim());
}

function Spinner() {
  return (
    <svg
      className="mr-1.5 inline-block h-3.5 w-3.5 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
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

export function EnrollmentImportForm() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [headerMap, setHeaderMap] = useState<Record<string, number>>({});
  const [fileName, setFileName] = useState<string>("");
  const [parseError, setParseError] = useState<string>("");
  const [importResult, setImportResult] = useState<{
    created: number;
    errors: string[];
  } | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string>("");

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setParseError("");
    setImportResult(null);
    setImportError("");

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      if (!text) {
        setParseError("파일을 읽을 수 없습니다.");
        return;
      }

      const lines = text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0);

      if (lines.length < 2) {
        setParseError("데이터 행이 없습니다. 헤더 행 + 최소 1개 데이터 행이 필요합니다.");
        return;
      }

      const headers = parseCSVLine(lines[0]);
      const mapping = mapHeaders(headers);
      setRawHeaders(headers);
      setHeaderMap(mapping);

      if (mapping.examNumber === undefined) {
        setParseError("'학번' 열을 찾을 수 없습니다. 헤더를 확인하세요.");
        return;
      }

      const parsed: ParsedRow[] = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = parseCSVLine(lines[i]);
        const get = (field: string) =>
          mapping[field] !== undefined ? (cols[mapping[field]] ?? "") : "";

        const examNumber = get("examNumber");
        const courseType = get("courseType");
        const courseName = get("courseName");
        const startDate = get("startDate");
        const endDate = get("endDate");
        const regularFee = get("regularFee");
        const discountAmount = get("discountAmount");
        const staffExamNumber = get("staffExamNumber");

        let error: string | undefined;
        if (!examNumber) error = "학번이 비어있습니다.";
        else if (courseType && !validateCourseType(courseType))
          error = `강좌유형 '${courseType}'이 올바르지 않습니다. (종합/이론/단과/특강)`;
        else if (!startDate) error = "시작일이 비어있습니다.";
        else if (startDate && isNaN(new Date(startDate).getTime()))
          error = `시작일 '${startDate}'이 올바른 날짜 형식이 아닙니다.`;

        parsed.push({
          examNumber,
          courseType,
          courseName,
          startDate,
          endDate,
          regularFee,
          discountAmount,
          staffExamNumber,
          _rowIndex: i,
          _error: error,
        });
      }

      setRows(parsed);
    };
    reader.readAsText(file, "utf-8");
  }

  const validRows = rows.filter((r) => !r._error);
  const errorRows = rows.filter((r) => !!r._error);
  const previewRows = rows.slice(0, 10);

  async function handleImport() {
    if (validRows.length === 0) return;
    setIsImporting(true);
    setImportError("");
    setImportResult(null);

    try {
      const payload = validRows.map((r) => ({
        examNumber: r.examNumber,
        courseType: r.courseType || "종합",
        courseName: r.courseName || null,
        startDate: r.startDate,
        endDate: r.endDate || null,
        regularFee: parseInt(r.regularFee.replace(/[^0-9]/g, ""), 10) || 0,
        discountAmount: parseInt(r.discountAmount.replace(/[^0-9]/g, ""), 10) || 0,
        staffExamNumber: r.staffExamNumber || null,
      }));

      const res = await fetch("/api/import/enrollments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enrollments: payload }),
      });

      const json = (await res.json()) as {
        data?: { created: number; errors: string[] };
        error?: string;
      };

      if (!res.ok) {
        setImportError(json.error ?? "가져오기에 실패했습니다.");
        return;
      }

      if (json.data) {
        setImportResult(json.data);
      }
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "오류가 발생했습니다.");
    } finally {
      setIsImporting(false);
    }
  }

  function handleReset() {
    setRows([]);
    setRawHeaders([]);
    setHeaderMap({});
    setFileName("");
    setParseError("");
    setImportResult(null);
    setImportError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div className="space-y-6">
      {/* File upload */}
      <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
        <h2 className="text-base font-semibold">CSV 파일 선택</h2>
        <p className="mt-1 text-sm text-slate">
          UTF-8 인코딩의 CSV 파일을 업로드하세요. 엑셀에서 저장 시 "CSV UTF-8(쉼표로 구분)"을 선택하세요.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-dashed border-ink/20 bg-mist px-5 py-3 text-sm font-semibold text-slate transition hover:border-forest/30 hover:text-forest">
            <span>파일 선택</span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileChange}
              className="sr-only"
            />
          </label>
          {fileName && (
            <span className="text-sm font-medium text-ink">{fileName}</span>
          )}
          {rows.length > 0 && (
            <button
              type="button"
              onClick={handleReset}
              className="text-xs text-slate underline hover:text-red-600"
            >
              초기화
            </button>
          )}
        </div>

        {parseError && (
          <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {parseError}
          </div>
        )}
      </div>

      {/* Preview */}
      {rows.length > 0 && (
        <div className="rounded-[28px] border border-ink/10 bg-white shadow-panel">
          <div className="flex items-center justify-between border-b border-ink/10 px-6 py-4">
            <h2 className="text-base font-semibold">
              미리보기
              <span className="ml-2 text-sm font-normal text-slate">
                전체 {rows.length}행 · 유효 {validRows.length}행 · 오류 {errorRows.length}행
              </span>
            </h2>
            {rows.length > 10 && (
              <p className="text-xs text-slate">최대 10행까지 표시</p>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink/10 bg-mist/60 text-left">
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate">
                    행
                  </th>
                  {rawHeaders.map((h, i) => (
                    <th
                      key={i}
                      className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate"
                    >
                      {h}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate">
                    상태
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {previewRows.map((row) => (
                  <tr
                    key={row._rowIndex}
                    className={row._error ? "bg-red-50" : "transition-colors hover:bg-mist/40"}
                  >
                    <td className="px-4 py-3 text-xs text-slate">{row._rowIndex}</td>
                    <td className="px-4 py-3 font-medium text-ink">
                      {row.examNumber || <span className="text-red-500">—</span>}
                    </td>
                    <td className="px-4 py-3 text-slate">{row.courseType || "—"}</td>
                    <td className="px-4 py-3 text-slate">{row.courseName || "—"}</td>
                    <td className="px-4 py-3 text-slate">{row.startDate || "—"}</td>
                    <td className="px-4 py-3 text-slate">{row.endDate || "—"}</td>
                    <td className="px-4 py-3 text-slate">{row.regularFee || "—"}</td>
                    <td className="px-4 py-3 text-slate">{row.discountAmount || "—"}</td>
                    <td className="px-4 py-3 text-slate">{row.staffExamNumber || "—"}</td>
                    <td className="px-4 py-3">
                      {row._error ? (
                        <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">
                          {row._error}
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full bg-forest/10 px-2 py-0.5 text-xs text-forest">
                          정상
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Column mapping info */}
      {Object.keys(headerMap).length > 0 && (
        <div className="rounded-[28px] border border-ink/10 bg-mist p-5">
          <h3 className="text-sm font-semibold">컬럼 매핑 결과</h3>
          <div className="mt-3 flex flex-wrap gap-3">
            {(
              [
                { field: "examNumber", label: "학번" },
                { field: "courseType", label: "강좌유형" },
                { field: "courseName", label: "강좌명" },
                { field: "startDate", label: "시작일" },
                { field: "endDate", label: "종료일" },
                { field: "regularFee", label: "수강료" },
                { field: "discountAmount", label: "할인금액" },
                { field: "staffExamNumber", label: "담당자" },
              ] as const
            ).map(({ field, label }) => (
              <div
                key={field}
                className={`rounded-xl border px-3 py-2 text-xs ${
                  headerMap[field] !== undefined
                    ? "border-forest/20 bg-forest/10 text-forest"
                    : field === "examNumber" || field === "startDate"
                      ? "border-red-200 bg-red-50 text-red-600"
                      : "border-ink/10 bg-mist/80 text-slate"
                }`}
              >
                {label}: {headerMap[field] !== undefined ? rawHeaders[headerMap[field]] : "매핑 안됨"}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Import button */}
      {validRows.length > 0 && !importResult && (
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={handleImport}
            disabled={isImporting}
            className="inline-flex items-center rounded-full bg-ember px-6 py-3 text-sm font-semibold text-white transition hover:bg-ember/90 disabled:cursor-not-allowed disabled:bg-ember/40"
          >
            {isImporting && <Spinner />}
            {isImporting ? "가져오는 중..." : `${validRows.length}건 가져오기`}
          </button>
          {errorRows.length > 0 && (
            <p className="text-xs text-slate">오류 행 {errorRows.length}개는 건너뜁니다.</p>
          )}
        </div>
      )}

      {importError && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
          <strong>오류:</strong> {importError}
        </div>
      )}

      {/* Result */}
      {importResult && (
        <div className="rounded-[28px] border border-forest/20 bg-forest/5 p-6">
          <h2 className="text-base font-semibold text-forest">가져오기 완료</h2>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs font-medium text-slate">신규 등록</p>
              <p className="mt-1 text-2xl font-semibold text-forest">{importResult.created}</p>
            </div>
            {importResult.errors.length > 0 && (
              <div>
                <p className="text-xs font-medium text-slate">처리 실패</p>
                <p className="mt-1 text-2xl font-semibold text-red-600">
                  {importResult.errors.length}
                </p>
              </div>
            )}
          </div>
          {importResult.errors.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-semibold text-red-700">오류 내역</p>
              <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-red-600">
                {importResult.errors.slice(0, 10).map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
                {importResult.errors.length > 10 && (
                  <li>...외 {importResult.errors.length - 10}건</li>
                )}
              </ul>
            </div>
          )}
          <button
            type="button"
            onClick={handleReset}
            className="mt-4 inline-flex items-center rounded-full border border-forest/20 px-5 py-2.5 text-sm font-semibold text-forest transition hover:bg-forest/10"
          >
            새 파일 가져오기
          </button>
        </div>
      )}
    </div>
  );
}
