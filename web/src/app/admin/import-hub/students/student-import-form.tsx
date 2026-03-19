"use client";

import { useRef, useState } from "react";

type ParsedRow = {
  name: string;
  phone: string;
  birthDate: string;
  examType: string;
  examNumber: string;
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
    name: ["이름", "성명", "name"],
    phone: ["전화번호", "연락처", "휴대폰", "핸드폰", "phone", "mobile"],
    birthDate: ["생년월일yymmdd", "생년월일", "birthdate", "birth"],
    examType: ["직렬공채경채", "직렬", "examtype", "type"],
    examNumber: ["학번선택", "학번", "examnumber", "id"],
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

function parseExamType(raw: string): "GONGCHAE" | "GYEONGCHAE" | null {
  const v = raw.trim().toLowerCase();
  if (v === "공채" || v === "gongchae") return "GONGCHAE";
  if (v === "경채" || v === "gyeongchae") return "GYEONGCHAE";
  return null;
}

function Spinner() {
  return (
    <svg
      className="mr-1.5 inline-block h-3.5 w-3.5 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  );
}

export function StudentImportForm() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [headerMap, setHeaderMap] = useState<Record<string, number>>({});
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [fileName, setFileName] = useState<string>("");
  const [parseError, setParseError] = useState<string>("");
  const [importResult, setImportResult] = useState<{
    created: number;
    updated: number;
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

      if (mapping.name === undefined) {
        setParseError("'이름' 열을 찾을 수 없습니다. 헤더를 확인하세요.");
        return;
      }

      const parsed: ParsedRow[] = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = parseCSVLine(lines[i]);
        const name = mapping.name !== undefined ? (cols[mapping.name] ?? "") : "";
        const phone = mapping.phone !== undefined ? (cols[mapping.phone] ?? "") : "";
        const birthDate =
          mapping.birthDate !== undefined ? (cols[mapping.birthDate] ?? "") : "";
        const examTypeRaw =
          mapping.examType !== undefined ? (cols[mapping.examType] ?? "") : "";
        const examNumber =
          mapping.examNumber !== undefined ? (cols[mapping.examNumber] ?? "") : "";

        let error: string | undefined;
        if (!name) error = "이름이 비어있습니다.";
        else if (examTypeRaw && !parseExamType(examTypeRaw))
          error = `직렬 값 '${examTypeRaw}'이 올바르지 않습니다. (공채/경채)`;

        parsed.push({
          name,
          phone,
          birthDate,
          examType: examTypeRaw,
          examNumber,
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
        name: r.name,
        phone: r.phone || null,
        birthDate: r.birthDate || null,
        examType: parseExamType(r.examType) ?? "GONGCHAE",
        examNumber: r.examNumber || null,
      }));

      const res = await fetch("/api/import/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ students: payload }),
      });

      const json = (await res.json()) as {
        data?: { created: number; updated: number; errors: string[] };
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
          UTF-8 인코딩의 CSV 파일을 업로드하세요. 엑셀에서 저장 시 "CSV
          UTF-8(쉼표로 구분)"을 선택하세요.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="cursor-pointer inline-flex items-center gap-2 rounded-full border border-dashed border-ink/20 bg-mist px-5 py-3 text-sm font-semibold text-slate transition hover:border-forest/30 hover:text-forest">
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
            <span className="text-sm text-ink font-medium">{fileName}</span>
          )}
          {rows.length > 0 && (
            <button
              type="button"
              onClick={handleReset}
              className="text-xs text-slate hover:text-red-600 underline"
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
                전체 {rows.length}행 · 유효 {validRows.length}행 · 오류{" "}
                {errorRows.length}행
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
                    className={
                      row._error
                        ? "bg-red-50"
                        : "transition-colors hover:bg-mist/40"
                    }
                  >
                    <td className="px-4 py-3 text-xs text-slate">
                      {row._rowIndex}
                    </td>
                    <td className="px-4 py-3 font-medium text-ink">
                      {row.name || <span className="text-red-500">—</span>}
                    </td>
                    <td className="px-4 py-3 text-slate">{row.phone || "—"}</td>
                    <td className="px-4 py-3 text-slate">
                      {row.birthDate || "—"}
                    </td>
                    <td className="px-4 py-3 text-slate">
                      {row.examType || "—"}
                    </td>
                    <td className="px-4 py-3 text-slate">
                      {row.examNumber || "—"}
                    </td>
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
                { field: "name", label: "이름" },
                { field: "phone", label: "전화번호" },
                { field: "birthDate", label: "생년월일" },
                { field: "examType", label: "직렬" },
                { field: "examNumber", label: "학번" },
              ] as const
            ).map(({ field, label }) => (
              <div
                key={field}
                className={`rounded-xl border px-3 py-2 text-xs ${
                  headerMap[field] !== undefined
                    ? "border-forest/20 bg-forest/10 text-forest"
                    : "border-red-200 bg-red-50 text-red-600"
                }`}
              >
                {label}:{" "}
                {headerMap[field] !== undefined
                  ? rawHeaders[headerMap[field]]
                  : "매핑 안됨"}
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
            {isImporting
              ? "가져오는 중..."
              : `${validRows.length}명 가져오기`}
          </button>
          {errorRows.length > 0 && (
            <p className="text-xs text-slate">
              오류 행 {errorRows.length}개는 건너뜁니다.
            </p>
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
              <p className="mt-1 text-2xl font-semibold text-forest">
                {importResult.created}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-slate">정보 갱신</p>
              <p className="mt-1 text-2xl font-semibold text-ink">
                {importResult.updated}
              </p>
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
