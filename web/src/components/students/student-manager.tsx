"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExamType, StudentType } from "@/generated/prisma";
import { PaginationControls } from "@/components/ui/pagination-controls";
import {
  EXAM_TYPE_LABEL,
  EXAM_TYPE_VALUES,
  STUDENT_TYPE_LABEL,
  STUDENT_TYPE_VALUES,
} from "@/lib/constants";
import { toDateInputValue } from "@/lib/format";

type StudentRow = {
  examNumber: string;
  name: string;
  phone: string | null;
  generation: number | null;
  className: string | null;
  examType: ExamType;
  studentType: StudentType;
  onlineId: string | null;
  registeredAt: string | null;
  note: string | null;
  isActive: boolean;
  currentStatus: "NORMAL" | "WARNING_1" | "WARNING_2" | "DROPOUT";
  _count: {
    scores: number;
  };
};

type Filters = {
  examType: ExamType;
  search: string;
  generation: string;
  activeOnly: boolean;
  page: number;
  pageSize: number;
  totalCount: number;
};

type StudentManagerProps = {
  students: StudentRow[];
  filters: Filters;
};

type StudentFormState = {
  examNumber: string;
  name: string;
  phone: string;
  generation: string;
  className: string;
  examType: ExamType;
  studentType: StudentType;
  onlineId: string;
  registeredAt: string;
  note: string;
};

const emptyForm: StudentFormState = {
  examNumber: "",
  name: "",
  phone: "",
  generation: "",
  className: "",
  examType: "GONGCHAE",
  studentType: "NEW",
  onlineId: "",
  registeredAt: "",
  note: "",
};

function parseExamType(value: string, fallback: ExamType): ExamType {
  return EXAM_TYPE_VALUES.includes(value as ExamType) ? (value as ExamType) : fallback;
}

function parseStudentType(value: string, fallback: StudentType): StudentType {
  return STUDENT_TYPE_VALUES.includes(value as StudentType)
    ? (value as StudentType)
    : fallback;
}

function buildDraft(student: StudentRow): StudentFormState {
  return {
    examNumber: student.examNumber,
    name: student.name,
    phone: student.phone ?? "",
    generation: student.generation ? String(student.generation) : "",
    className: student.className ?? "",
    examType: student.examType,
    studentType: student.studentType,
    onlineId: student.onlineId ?? "",
    registeredAt: toDateInputValue(student.registeredAt),
    note: student.note ?? "",
  };
}

export function StudentManager({ students, filters }: StudentManagerProps) {
  const router = useRouter();
  const [createForm, setCreateForm] = useState<StudentFormState>({
    ...emptyForm,
    examType: filters.examType,
  });
  const [editingExamNumber, setEditingExamNumber] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, StudentFormState>>({});
  const [search, setSearch] = useState(filters.search);
  const [generation, setGeneration] = useState(filters.generation);
  const [activeOnly, setActiveOnly] = useState(filters.activeOnly);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const rowDrafts = useMemo(
    () =>
      Object.fromEntries(
        students.map((student) => [student.examNumber, buildDraft(student)]),
      ) as Record<string, StudentFormState>,
    [students],
  );

  function getDraft(examNumber: string) {
    return drafts[examNumber] ?? rowDrafts[examNumber];
  }

  function refreshWithFilters(
    nextFilters?: Partial<Pick<Filters, "examType" | "search" | "generation" | "activeOnly" | "page" | "pageSize">>,
  ) {
    const params = new URLSearchParams();
    const merged = {
      examType: filters.examType,
      search,
      generation,
      activeOnly,
      page: filters.page,
      pageSize: filters.pageSize,
      ...nextFilters,
    };

    params.set("examType", merged.examType);
    params.set("page", String(merged.page));
    params.set("pageSize", String(merged.pageSize));

    if (merged.search.trim()) {
      params.set("search", merged.search.trim());
    }

    if (merged.generation.trim()) {
      params.set("generation", merged.generation.trim());
    }

    if (!merged.activeOnly) {
      params.set("activeOnly", "false");
    }

    router.push(`/admin/students?${params.toString()}`);
  }

  async function requestJson(url: string, init?: RequestInit) {
    const response = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
    const text = await response.text();
    let payload: { error?: string } = {};

    if (text.trim()) {
      try {
        payload = (JSON.parse(text) as { error?: string }) ?? {};
      } catch {
        payload = {};
      }
    }

    if (!response.ok) {
      throw new Error(payload.error ?? "요청을 처리하지 못했습니다.");
    }

    return payload;
  }

  function run(action: () => Promise<void>) {
    setNotice(null);
    setErrorMessage(null);

    startTransition(async () => {
      try {
        await action();
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "작업 처리 중 오류가 발생했습니다.",
        );
      }
    });
  }

  const currentPage = filters.page;
  const pageSize = filters.pageSize;

  return (
    <div className="space-y-8">
      <section className="rounded-[28px] border border-ink/10 bg-mist p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">학생 등록</h2>
            <p className="mt-2 text-sm leading-7 text-slate">
              개별 등록과 수정은 이 화면에서 처리하고, 대량 등록은 붙여넣기 페이지에서 처리합니다.
            </p>
          </div>
          <Link
            href={`/admin/students/paste-import?examType=${filters.examType}`}
            className="inline-flex items-center rounded-full border border-ember/30 px-4 py-2 text-sm font-semibold text-ember transition hover:bg-ember/10"
          >
            붙여넣기 등록
          </Link>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <label className="mb-2 block text-sm font-medium">수험번호</label>
            <input
              value={createForm.examNumber}
              onChange={(event) =>
                setCreateForm((current) => ({ ...current, examNumber: event.target.value }))
              }
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">이름</label>
            <input
              value={createForm.name}
              onChange={(event) =>
                setCreateForm((current) => ({ ...current, name: event.target.value }))
              }
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">연락처</label>
            <input
              value={createForm.phone}
              onChange={(event) =>
                setCreateForm((current) => ({ ...current, phone: event.target.value }))
              }
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">기수</label>
            <input
              value={createForm.generation}
              onChange={(event) =>
                setCreateForm((current) => ({ ...current, generation: event.target.value }))
              }
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
            />
          </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <label className="mb-2 block text-sm font-medium">반</label>
            <input
              value={createForm.className}
              onChange={(event) =>
                setCreateForm((current) => ({ ...current, className: event.target.value }))
              }
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">직렬</label>
            <select
              value={createForm.examType}
              onChange={(event) =>
                setCreateForm((current) => ({
                  ...current,
                  examType: parseExamType(event.target.value, current.examType),
                }))
              }
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
            >
              <option value="GONGCHAE">공채</option>
              <option value="GYEONGCHAE">경채</option>
            </select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">학생 구분</label>
            <select
              value={createForm.studentType}
              onChange={(event) =>
                setCreateForm((current) => ({
                  ...current,
                  studentType: parseStudentType(event.target.value, current.studentType),
                }))
              }
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
            >
              <option value="NEW">신규</option>
              <option value="EXISTING">기존</option>
            </select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">등록일</label>
            <input
              type="date"
              value={createForm.registeredAt}
              onChange={(event) =>
                setCreateForm((current) => ({
                  ...current,
                  registeredAt: event.target.value,
                }))
              }
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
            />
          </div>
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_1fr_auto]">
          <div>
            <label className="mb-2 block text-sm font-medium">온라인 ID</label>
            <input
              value={createForm.onlineId}
              onChange={(event) =>
                setCreateForm((current) => ({ ...current, onlineId: event.target.value }))
              }
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">메모</label>
            <input
              value={createForm.note}
              onChange={(event) =>
                setCreateForm((current) => ({ ...current, note: event.target.value }))
              }
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
            />
          </div>
          <button
            type="button"
            onClick={() =>
              run(async () => {
                await requestJson("/api/students", {
                  method: "POST",
                  body: JSON.stringify(createForm),
                });
                setNotice("학생을 등록했습니다.");
                setCreateForm({
                  ...emptyForm,
                  examType: filters.examType,
                });
                refreshWithFilters();
              })
            }
            disabled={isPending}
            className="mt-7 inline-flex items-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest disabled:cursor-not-allowed disabled:bg-ink/40"
          >
            등록
          </button>
        </div>
      </section>

      <section className="rounded-[28px] border border-ink/10 bg-white p-6">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="mb-2 block text-sm font-medium">직렬</label>
            <div className="flex gap-2">
              {(["GONGCHAE", "GYEONGCHAE"] as const).map((examType) => (
                <button
                  key={examType}
                  type="button"
                  onClick={() => refreshWithFilters({ examType, page: 1 })}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                    filters.examType === examType
                      ? "bg-ink text-white"
                      : "border border-ink/10 text-ink hover:border-ember/30 hover:text-ember"
                  }`}
                >
                  {EXAM_TYPE_LABEL[examType]}
                </button>
              ))}
            </div>
          </div>
          <div className="min-w-[220px] flex-1">
            <label className="mb-2 block text-sm font-medium">검색</label>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-full rounded-2xl border border-ink/10 bg-mist px-4 py-3 text-sm"
              placeholder="수험번호 또는 이름"
            />
          </div>
          <div className="w-full max-w-[180px]">
            <label className="mb-2 block text-sm font-medium">기수</label>
            <input
              value={generation}
              onChange={(event) => setGeneration(event.target.value)}
              className="w-full rounded-2xl border border-ink/10 bg-mist px-4 py-3 text-sm"
            />
          </div>
          <label className="mb-3 inline-flex items-center gap-2 text-sm text-slate">
            <input
              type="checkbox"
              checked={activeOnly}
              onChange={(event) => setActiveOnly(event.target.checked)}
            />
            활성만 보기
          </label>
          <button
            type="button"
            onClick={() => refreshWithFilters({ page: 1 })}
            className="mb-1 inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
          >
            필터 적용
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

        <div className="mt-6 overflow-hidden rounded-[24px] border border-ink/10">
          <PaginationControls
            totalCount={filters.totalCount}
            page={currentPage}
            pageSize={pageSize}
            onPageChange={(nextPage) => refreshWithFilters({ page: nextPage })}
            onPageSizeChange={(nextPageSize) =>
              refreshWithFilters({ page: 1, pageSize: nextPageSize })
            }
            itemLabel="명"
          />
          <table className="min-w-full divide-y divide-ink/10 text-sm">
            <thead className="bg-mist text-left">
              <tr>
                <th className="px-4 py-3 font-semibold">수험번호</th>
                <th className="px-4 py-3 font-semibold">이름</th>
                <th className="px-4 py-3 font-semibold">연락처</th>
                <th className="px-4 py-3 font-semibold">기수</th>
                <th className="px-4 py-3 font-semibold">반</th>
                <th className="px-4 py-3 font-semibold">구분</th>
                <th className="px-4 py-3 font-semibold">점수 수</th>
                <th className="px-4 py-3 font-semibold">동작</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/10 bg-white">
              {students.map((student) => {
                const draft = getDraft(student.examNumber);

                return (
                  <tr key={student.examNumber}>
                    <td className="px-4 py-3 font-medium">
                      {editingExamNumber === student.examNumber ? (
                        <input
                          value={draft.examNumber}
                          disabled
                          className="w-full rounded-xl border border-ink/10 px-3 py-2 text-sm"
                        />
                      ) : (
                        student.examNumber
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {editingExamNumber === student.examNumber ? (
                        <input
                          value={draft.name}
                          onChange={(event) =>
                            setDrafts((current) => ({
                              ...current,
                              [student.examNumber]: {
                                ...draft,
                                name: event.target.value,
                              },
                            }))
                          }
                          className="w-full rounded-xl border border-ink/10 px-3 py-2 text-sm"
                        />
                      ) : (
                        student.name
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {editingExamNumber === student.examNumber ? (
                        <input
                          value={draft.phone}
                          onChange={(event) =>
                            setDrafts((current) => ({
                              ...current,
                              [student.examNumber]: {
                                ...draft,
                                phone: event.target.value,
                              },
                            }))
                          }
                          className="w-full rounded-xl border border-ink/10 px-3 py-2 text-sm"
                        />
                      ) : (
                        student.phone ?? "-"
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {editingExamNumber === student.examNumber ? (
                        <input
                          value={draft.generation}
                          onChange={(event) =>
                            setDrafts((current) => ({
                              ...current,
                              [student.examNumber]: {
                                ...draft,
                                generation: event.target.value,
                              },
                            }))
                          }
                          className="w-full rounded-xl border border-ink/10 px-3 py-2 text-sm"
                        />
                      ) : (
                        student.generation ?? "-"
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {editingExamNumber === student.examNumber ? (
                        <input
                          value={draft.className}
                          onChange={(event) =>
                            setDrafts((current) => ({
                              ...current,
                              [student.examNumber]: {
                                ...draft,
                                className: event.target.value,
                              },
                            }))
                          }
                          className="w-full rounded-xl border border-ink/10 px-3 py-2 text-sm"
                        />
                      ) : (
                        student.className ?? "-"
                      )}
                    </td>
                    <td className="px-4 py-3">{STUDENT_TYPE_LABEL[student.studentType]}</td>
                    <td className="px-4 py-3">{student._count.scores}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <Link
                          href={`/admin/students/${student.examNumber}`}
                          className="rounded-full border border-ink/10 px-3 py-2 text-xs font-semibold transition hover:border-ember/30 hover:text-ember"
                        >
                          상세 보기
                        </Link>
                        {editingExamNumber === student.examNumber ? (
                          <>
                            <button
                              type="button"
                              onClick={() =>
                                run(async () => {
                                  await requestJson(`/api/students/${student.examNumber}`, {
                                    method: "PUT",
                                    body: JSON.stringify(draft),
                                  });
                                  setNotice("학생 정보를 수정했습니다.");
                                  setEditingExamNumber(null);
                                  refreshWithFilters();
                                })
                              }
                              disabled={isPending}
                              className="rounded-full border border-ink/10 px-3 py-2 text-xs font-semibold transition hover:border-forest/30 hover:text-forest"
                            >
                              저장
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingExamNumber(null)}
                              className="rounded-full border border-ink/10 px-3 py-2 text-xs font-semibold transition hover:border-ink/30"
                            >
                              취소
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setDrafts((current) => ({
                                  ...current,
                                  [student.examNumber]: buildDraft(student),
                                }));
                                setEditingExamNumber(student.examNumber);
                              }}
                              className="rounded-full border border-ink/10 px-3 py-2 text-xs font-semibold transition hover:border-ember/30 hover:text-ember"
                            >
                              수정
                            </button>
                            {student.isActive ? (
                              <button
                                type="button"
                                onClick={() =>
                                  run(async () => {
                                    await requestJson(`/api/students/${student.examNumber}`, {
                                      method: "DELETE",
                                    });
                                    setNotice("학생을 비활성화했습니다.");
                                    refreshWithFilters();
                                  })
                                }
                                disabled={isPending}
                                className="rounded-full border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                비활성화
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() =>
                                  run(async () => {
                                    await requestJson(`/api/students/${student.examNumber}`, {
                                      method: "PATCH",
                                    });
                                    setNotice("학생을 다시 활성화했습니다.");
                                    refreshWithFilters();
                                  })
                                }
                                disabled={isPending}
                                className="rounded-full border border-forest/30 px-3 py-2 text-xs font-semibold text-forest transition hover:bg-forest/10 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                재활성화
                              </button>
                            )}
                          </>
                        )}
                      </div>
                      {editingExamNumber === student.examNumber ? (
                        <div className="mt-3 grid gap-2">
                          <div className="grid gap-2 md:grid-cols-2">
                            <select
                              value={draft.studentType}
                              onChange={(event) =>
                                setDrafts((current) => ({
                                  ...current,
                                  [student.examNumber]: {
                                    ...draft,
                                    studentType: parseStudentType(
                                      event.target.value,
                                      draft.studentType,
                                    ),
                                  },
                                }))
                              }
                              className="rounded-xl border border-ink/10 px-3 py-2 text-sm"
                            >
                              <option value="NEW">신규</option>
                              <option value="EXISTING">기존</option>
                            </select>
                            <input
                              type="date"
                              value={draft.registeredAt}
                              onChange={(event) =>
                                setDrafts((current) => ({
                                  ...current,
                                  [student.examNumber]: {
                                    ...draft,
                                    registeredAt: event.target.value,
                                  },
                                }))
                              }
                              className="rounded-xl border border-ink/10 px-3 py-2 text-sm"
                            />
                          </div>
                          <div className="grid gap-2 md:grid-cols-2">
                            <input
                              value={draft.onlineId}
                              onChange={(event) =>
                                setDrafts((current) => ({
                                  ...current,
                                  [student.examNumber]: {
                                    ...draft,
                                    onlineId: event.target.value,
                                  },
                                }))
                              }
                              className="rounded-xl border border-ink/10 px-3 py-2 text-sm"
                              placeholder="온라인 ID"
                            />
                            <input
                              value={draft.note}
                              onChange={(event) =>
                                setDrafts((current) => ({
                                  ...current,
                                  [student.examNumber]: {
                                    ...draft,
                                    note: event.target.value,
                                  },
                                }))
                              }
                              className="rounded-xl border border-ink/10 px-3 py-2 text-sm"
                              placeholder="메모"
                            />
                          </div>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
              {filters.totalCount === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate">
                    조건에 맞는 학생이 없습니다.
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
