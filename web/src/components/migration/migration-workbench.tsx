"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { EXAM_TYPE_LABEL, STUDENT_TYPE_LABEL, STUDENT_MIGRATION_FIELDS } from "@/lib/constants";

type StudentPreviewResponse = {
  sheetNames: string[];
  sheetName: string;
  headerRowIndex: number;
  columns: Array<{
    index: number;
    letter: string;
    header: string;
    label: string;
    sample: string;
  }>;
  mapping: Partial<Record<(typeof STUDENT_MIGRATION_FIELDS)[number]["key"], number>>;
  previewRows: Array<{
    rowNumber: number;
    status: "valid" | "invalid" | "update";
    issues: string[];
    record: {
      examNumber: string;
      name: string;
      phone: string | null;
      generation: number | null;
      className: string | null;
      onlineId: string | null;
    };
  }>;
  summary: {
    totalRows: number;
    validRows: number;
    invalidRows: number;
    updateRows: number;
  };
};

type ScorePreviewResponse = {
  files: Array<{
    fileName: string;
    detectedType: string;
    rowCount: number;
    sheetNames: string[];
    headers: string[];
  }>;
};

type RecentRun = {
  id: number;
  createdAt: string;
  adminName: string;
  fileName: string;
  importedCount: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
};

type MigrationWorkbenchProps = {
  recentRuns: RecentRun[];
};

type StudentDefaults = {
  examType: "GONGCHAE" | "GYEONGCHAE";
  studentType: "NEW" | "EXISTING";
  classNameFallback: string;
};

const statusStyle = {
  valid: "border-forest/20 bg-forest/10 text-forest",
  update: "border-ember/20 bg-ember/10 text-ember",
  invalid: "border-red-200 bg-red-50 text-red-700",
} as const;

export function MigrationWorkbench({ recentRuns }: MigrationWorkbenchProps) {
  const router = useRouter();
  const [studentFile, setStudentFile] = useState<File | null>(null);
  const [scoreFiles, setScoreFiles] = useState<File[]>([]);
  const [studentDefaults, setStudentDefaults] = useState<StudentDefaults>({
    examType: "GONGCHAE",
    studentType: "NEW",
    classNameFallback: "",
  });
  const [sheetName, setSheetName] = useState("");
  const [headerRowIndex, setHeaderRowIndex] = useState(0);
  const [mapping, setMapping] = useState<
    Partial<Record<(typeof STUDENT_MIGRATION_FIELDS)[number]["key"], number>>
  >({});
  const [studentPreview, setStudentPreview] = useState<StudentPreviewResponse | null>(null);
  const [scorePreview, setScorePreview] = useState<ScorePreviewResponse | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function resetMessages() {
    setNotice(null);
    setErrorMessage(null);
  }

  function createStudentPayload() {
    if (!studentFile) {
      throw new Error("수강생 명단 파일을 먼저 선택하세요.");
    }

    const formData = new FormData();
    formData.append("file", studentFile);
    formData.append("sheetName", sheetName);
    formData.append("headerRowIndex", String(headerRowIndex));
    formData.append("mapping", JSON.stringify(mapping));
    formData.append("defaults", JSON.stringify(studentDefaults));
    return formData;
  }

  async function fetchStudentPreview() {
    resetMessages();

    startTransition(async () => {
      try {
        const response = await fetch("/api/migration/students/preview", {
          method: "POST",
          body: createStudentPayload(),
        });

        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.error ?? "미리보기 생성에 실패했습니다.");
        }

        setStudentPreview(payload);
        setSheetName(payload.sheetName);
        setHeaderRowIndex(payload.headerRowIndex);
        setMapping(payload.mapping ?? {});
        setNotice("수강생 명단 미리보기를 갱신했습니다.");
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "미리보기 생성 중 오류가 발생했습니다.",
        );
      }
    });
  }

  async function executeStudentImport() {
    resetMessages();

    startTransition(async () => {
      try {
        const response = await fetch("/api/migration/students/execute", {
          method: "POST",
          body: createStudentPayload(),
        });

        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.error ?? "명단 저장에 실패했습니다.");
        }

        setNotice(
          `수강생 ${payload.importedCount}건을 반영했습니다. 신규 ${payload.createdCount}건, 업데이트 ${payload.updatedCount}건입니다.`,
        );
        router.refresh();
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "명단 저장 중 오류가 발생했습니다.",
        );
      }
    });
  }

  async function rollbackRun(auditLogId: number) {
    resetMessages();

    startTransition(async () => {
      try {
        const response = await fetch("/api/migration/students/rollback", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ auditLogId }),
        });

        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.error ?? "롤백에 실패했습니다.");
        }

        setNotice(
          `롤백 완료: 신규 삭제 ${payload.deletedCount}건, 기존 복원 ${payload.restoredCount}건`,
        );
        router.refresh();
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "롤백 중 오류가 발생했습니다.",
        );
      }
    });
  }

  async function inspectScoreFiles() {
    if (scoreFiles.length === 0) {
      setErrorMessage("점수 파일을 먼저 선택하세요.");
      return;
    }

    resetMessages();

    startTransition(async () => {
      try {
        const formData = new FormData();

        for (const file of scoreFiles) {
          formData.append("files", file);
        }

        const response = await fetch("/api/migration/scores/preview", {
          method: "POST",
          body: formData,
        });

        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.error ?? "점수 파일 분석에 실패했습니다.");
        }

        setScorePreview(payload);
        setNotice("점수 파일 포맷 감지를 완료했습니다.");
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "점수 파일 분석 중 오류가 발생했습니다.",
        );
      }
    });
  }

  return (
    <div className="space-y-8">
      <section className="rounded-[28px] border border-ink/10 bg-mist p-6">
        <h2 className="text-xl font-semibold">F-18 수강생 명단 마이그레이션</h2>
        <p className="mt-3 text-sm leading-7 text-slate">
          기존 엑셀 파일을 업로드하면 헤더를 자동 추정해 미리보기를 만들고, 검증이 끝난 행만
          Prisma `students` 테이블에 upsert합니다.
        </p>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="xl:col-span-2">
            <label className="mb-2 block text-sm font-medium text-ink">엑셀 파일</label>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                setStudentFile(file);
                setStudentPreview(null);
                resetMessages();
              }}
              className="block w-full rounded-2xl border border-dashed border-ink/20 bg-white px-4 py-3 text-sm text-slate"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-ink">직렬</label>
            <select
              value={studentDefaults.examType}
              onChange={(event) =>
                setStudentDefaults((current) => ({
                  ...current,
                  examType: event.target.value as StudentDefaults["examType"],
                }))
              }
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
            >
              <option value="GONGCHAE">{EXAM_TYPE_LABEL.GONGCHAE}</option>
              <option value="GYEONGCHAE">{EXAM_TYPE_LABEL.GYEONGCHAE}</option>
            </select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-ink">학생 구분</label>
            <select
              value={studentDefaults.studentType}
              onChange={(event) =>
                setStudentDefaults((current) => ({
                  ...current,
                  studentType: event.target.value as StudentDefaults["studentType"],
                }))
              }
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
            >
              <option value="NEW">{STUDENT_TYPE_LABEL.NEW}</option>
              <option value="EXISTING">{STUDENT_TYPE_LABEL.EXISTING}</option>
            </select>
          </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-[1fr_180px_180px]">
          <div>
            <label className="mb-2 block text-sm font-medium text-ink">반 기본값</label>
            <input
              value={studentDefaults.classNameFallback}
              onChange={(event) =>
                setStudentDefaults((current) => ({
                  ...current,
                  classNameFallback: event.target.value,
                }))
              }
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
              placeholder="예: 기본이론반"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-ink">시트명</label>
            <select
              value={sheetName}
              onChange={(event) => setSheetName(event.target.value)}
              disabled={!studentPreview}
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm disabled:bg-zinc-100"
            >
              <option value="">자동 선택</option>
              {studentPreview?.sheetNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-ink">헤더 행</label>
            <input
              type="number"
              min={0}
              value={headerRowIndex}
              onChange={(event) => setHeaderRowIndex(Number(event.target.value))}
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
            />
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={fetchStudentPreview}
            disabled={!studentFile || isPending}
            className="inline-flex items-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest disabled:cursor-not-allowed disabled:bg-ink/40"
          >
            {studentPreview ? "미리보기 갱신" : "파일 분석"}
          </button>
          <button
            type="button"
            onClick={executeStudentImport}
            disabled={!studentPreview || isPending}
            className="inline-flex items-center rounded-full border border-ember/30 bg-white px-5 py-3 text-sm font-semibold text-ember transition hover:bg-ember/10 disabled:cursor-not-allowed disabled:border-ink/10 disabled:text-slate"
          >
            DB 저장 실행
          </button>
        </div>

        {notice ? (
          <div className="mt-6 rounded-2xl border border-forest/20 bg-forest/10 px-4 py-3 text-sm text-forest">
            {notice}
          </div>
        ) : null}
        {errorMessage ? (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
        ) : null}

        {studentPreview ? (
          <>
            <div className="mt-8 grid gap-4 md:grid-cols-4">
              <article className="rounded-3xl bg-white p-5">
                <p className="text-sm text-slate">전체 행</p>
                <p className="mt-3 text-3xl font-semibold">{studentPreview.summary.totalRows}</p>
              </article>
              <article className="rounded-3xl bg-white p-5">
                <p className="text-sm text-slate">신규 저장 대상</p>
                <p className="mt-3 text-3xl font-semibold text-forest">
                  {studentPreview.summary.validRows}
                </p>
              </article>
              <article className="rounded-3xl bg-white p-5">
                <p className="text-sm text-slate">업데이트 대상</p>
                <p className="mt-3 text-3xl font-semibold text-ember">
                  {studentPreview.summary.updateRows}
                </p>
              </article>
              <article className="rounded-3xl bg-white p-5">
                <p className="text-sm text-slate">제외 행</p>
                <p className="mt-3 text-3xl font-semibold text-red-700">
                  {studentPreview.summary.invalidRows}
                </p>
              </article>
            </div>

            <div className="mt-8 rounded-[28px] border border-ink/10 bg-white p-6">
              <h3 className="text-lg font-semibold">열 매핑</h3>
              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {STUDENT_MIGRATION_FIELDS.map((field) => (
                  <div key={field.key}>
                    <label className="mb-2 block text-sm font-medium text-ink">
                      {field.label}
                      {field.required ? " *" : ""}
                    </label>
                    <select
                      value={mapping[field.key] ?? ""}
                      onChange={(event) =>
                        setMapping((current) => ({
                          ...current,
                          [field.key]:
                            event.target.value === "" ? undefined : Number(event.target.value),
                        }))
                      }
                      className="w-full rounded-2xl border border-ink/10 bg-mist px-4 py-3 text-sm"
                    >
                      <option value="">매핑 안 함</option>
                      {studentPreview.columns.map((column) => (
                        <option key={column.index} value={column.index}>
                          {column.label}
                          {column.sample ? ` | 예: ${column.sample}` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-8 overflow-hidden rounded-[28px] border border-ink/10 bg-white">
              <div className="border-b border-ink/10 px-6 py-4">
                <h3 className="text-lg font-semibold">미리보기 상위 20행</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-ink/10 text-sm">
                  <thead className="bg-mist text-left">
                    <tr>
                      <th className="px-5 py-4 font-semibold">행</th>
                      <th className="px-5 py-4 font-semibold">상태</th>
                      <th className="px-5 py-4 font-semibold">수험번호</th>
                      <th className="px-5 py-4 font-semibold">이름</th>
                      <th className="px-5 py-4 font-semibold">기수</th>
                      <th className="px-5 py-4 font-semibold">연락처</th>
                      <th className="px-5 py-4 font-semibold">이슈</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink/10">
                    {studentPreview.previewRows.map((row) => (
                      <tr key={`${row.rowNumber}-${row.record.examNumber}-${row.record.name}`}>
                        <td className="px-5 py-4 text-slate">{row.rowNumber}</td>
                        <td className="px-5 py-4">
                          <span
                            className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusStyle[row.status]}`}
                          >
                            {row.status === "valid"
                              ? "신규"
                              : row.status === "update"
                                ? "업데이트"
                                : "제외"}
                          </span>
                        </td>
                        <td className="px-5 py-4 font-medium">{row.record.examNumber}</td>
                        <td className="px-5 py-4">{row.record.name}</td>
                        <td className="px-5 py-4">{row.record.generation ?? "-"}</td>
                        <td className="px-5 py-4">{row.record.phone ?? "-"}</td>
                        <td className="px-5 py-4 text-slate">
                          {row.issues.length > 0 ? row.issues.join(", ") : "정상"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : null}
      </section>

      <section className="rounded-[28px] border border-ink/10 bg-white p-6">
        <h2 className="text-xl font-semibold">점수 파일 포맷 감지</h2>
        <p className="mt-3 text-sm leading-7 text-slate">
          Phase 2 점수 업로드 파서와 공유할 수 있도록, 현재 참고자료의 오프라인/온라인 파일을
          우선 자동 분류합니다.
        </p>
        <div className="mt-6 flex flex-wrap items-end gap-4">
          <div className="min-w-[280px] flex-1">
            <label className="mb-2 block text-sm font-medium text-ink">점수 파일 묶음</label>
            <input
              type="file"
              accept=".xlsx,.xls"
              multiple
              onChange={(event) => {
                setScoreFiles(Array.from(event.target.files ?? []));
                setScorePreview(null);
                resetMessages();
              }}
              className="block w-full rounded-2xl border border-dashed border-ink/20 bg-mist px-4 py-3 text-sm"
            />
          </div>
          <button
            type="button"
            onClick={inspectScoreFiles}
            disabled={scoreFiles.length === 0 || isPending}
            className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember disabled:cursor-not-allowed disabled:text-slate"
          >
            점수 파일 분석
          </button>
        </div>

        {scorePreview ? (
          <div className="mt-6 overflow-hidden rounded-[24px] border border-ink/10">
            <table className="min-w-full divide-y divide-ink/10 text-sm">
              <thead className="bg-mist text-left">
                <tr>
                  <th className="px-5 py-4 font-semibold">파일명</th>
                  <th className="px-5 py-4 font-semibold">감지 유형</th>
                  <th className="px-5 py-4 font-semibold">행 수</th>
                  <th className="px-5 py-4 font-semibold">헤더</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/10 bg-white">
                {scorePreview.files.map((file) => (
                  <tr key={file.fileName}>
                    <td className="px-5 py-4 font-medium">{file.fileName}</td>
                    <td className="px-5 py-4">{file.detectedType}</td>
                    <td className="px-5 py-4">{file.rowCount}</td>
                    <td className="px-5 py-4 text-slate">{file.headers.join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <section className="rounded-[28px] border border-ink/10 bg-white p-6">
        <h2 className="text-xl font-semibold">최근 수강생 마이그레이션 실행</h2>
        <div className="mt-6 overflow-hidden rounded-[24px] border border-ink/10">
          <table className="min-w-full divide-y divide-ink/10 text-sm">
            <thead className="bg-mist text-left">
              <tr>
                <th className="px-5 py-4 font-semibold">실행 시각</th>
                <th className="px-5 py-4 font-semibold">작업자</th>
                <th className="px-5 py-4 font-semibold">파일명</th>
                <th className="px-5 py-4 font-semibold">반영</th>
                <th className="px-5 py-4 font-semibold">신규/업데이트</th>
                <th className="px-5 py-4 font-semibold">동작</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/10 bg-white">
              {recentRuns.map((run) => (
                <tr key={run.id}>
                  <td className="px-5 py-4">{new Date(run.createdAt).toLocaleString("ko-KR")}</td>
                  <td className="px-5 py-4">{run.adminName}</td>
                  <td className="px-5 py-4">{run.fileName}</td>
                  <td className="px-5 py-4">{run.importedCount}건</td>
                  <td className="px-5 py-4">
                    신규 {run.createdCount} / 업데이트 {run.updatedCount}
                  </td>
                  <td className="px-5 py-4">
                    <button
                      type="button"
                      onClick={() => rollbackRun(run.id)}
                      disabled={isPending}
                      className="inline-flex items-center rounded-full border border-red-200 px-4 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      롤백
                    </button>
                  </td>
                </tr>
              ))}
              {recentRuns.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-slate">
                    아직 실행된 수강생 마이그레이션이 없습니다.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
