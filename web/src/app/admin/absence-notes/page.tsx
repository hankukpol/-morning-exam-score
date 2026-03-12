import {
  AbsenceCategory,
  AbsenceStatus,
  AdminRole,
} from "@prisma/client";
import { AbsenceNoteManager } from "@/components/absence-notes/absence-note-manager";
import {
  getAnalyticsContext,
  readStringParam,
} from "@/lib/analytics/ui";
import { requireAdminContext } from "@/lib/auth";
import {
  ABSENCE_CATEGORY_LABEL,
  EXAM_TYPE_LABEL,
} from "@/lib/constants";
import {
  getAbsenceNoteDashboard,
  listAbsenceNotes,
} from "@/lib/absence-notes/service";
import { todayDateInputValue } from "@/lib/format";
import { getPrisma } from "@/lib/prisma";
import { NON_PLACEHOLDER_STUDENT_FILTER } from "@/lib/students/placeholder";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

const STATUS_OPTIONS = [
  { value: "ALL", label: "전체" },
  { value: AbsenceStatus.PENDING, label: "대기" },
  { value: AbsenceStatus.APPROVED, label: "승인" },
  { value: AbsenceStatus.REJECTED, label: "반려" },
] as const;

export default async function AdminAbsenceNotesPage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.TEACHER);
  const { periods, selectedPeriod, examType } = await getAnalyticsContext(searchParams);
  const defaultSubmittedDate = todayDateInputValue();
  const selectedStatus = readStringParam(searchParams, "status") ?? "ALL";
  const selectedCategory = readStringParam(searchParams, "absenceCategory") ?? "ALL";
  const search = readStringParam(searchParams, "search") ?? "";
  const submittedFrom = readStringParam(searchParams, "submittedFrom") ?? defaultSubmittedDate;
  const submittedTo = readStringParam(searchParams, "submittedTo") ?? defaultSubmittedDate;

  const [notes, students, dashboard] = await Promise.all([
    selectedPeriod
      ? listAbsenceNotes({
          periodId: selectedPeriod.id,
          examType,
          status:
            selectedStatus === "ALL" ? undefined : (selectedStatus as AbsenceStatus),
          absenceCategory:
            selectedCategory === "ALL"
              ? undefined
              : (selectedCategory as AbsenceCategory),
          search,
          submittedFrom: submittedFrom || undefined,
          submittedTo: submittedTo || undefined,
        })
      : Promise.resolve([]),
    getPrisma().student.findMany({
      where: {
        AND: [NON_PLACEHOLDER_STUDENT_FILTER, { examType, isActive: true }],
      },
      select: { examNumber: true, name: true, currentStatus: true },
      orderBy: { examNumber: "asc" },
    }),
    selectedPeriod
      ? getAbsenceNoteDashboard(selectedPeriod.id, examType)
      : Promise.resolve(null),
  ]);

  const sessionOptions =
    selectedPeriod?.sessions
      .filter((session) => session.examType === examType && !session.isCancelled)
      .map((session) => ({
        id: session.id,
        examDate: session.examDate.toISOString(),
        subject: session.subject,
        week: session.week,
      })) ?? [];

  // export URL (현재 필터 그대로 내보내기)
  const exportParams = new URLSearchParams();
  if (selectedPeriod) exportParams.set("periodId", String(selectedPeriod.id));
  exportParams.set("examType", examType);
  if (selectedStatus !== "ALL") exportParams.set("status", selectedStatus);
  if (selectedCategory !== "ALL") exportParams.set("absenceCategory", selectedCategory);
  if (search) exportParams.set("search", search);
  if (submittedFrom) exportParams.set("submittedFrom", submittedFrom);
  if (submittedTo) exportParams.set("submittedTo", submittedTo);
  const exportUrl = `/api/absence-notes/export?${exportParams.toString()}`;

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        F-10 Absence Notes
      </div>
      <h1 className="mt-5 text-3xl font-semibold">사유서 관리</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        사유 결시 등록, 승인/반려, 개근 인정 여부를 관리합니다. 승인 시 EXCUSED 반영과
        경고/탈락 상태 재계산이 함께 실행됩니다.
      </p>

      {/* KPI 대시보드 */}
      {dashboard && (
        <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <article
            className={`rounded-[28px] border p-6 ${
              dashboard.pending > 0
                ? "border-amber-200 bg-amber-50"
                : "border-ink/10 bg-white"
            }`}
          >
            <p className="text-sm text-slate">검토 대기</p>
            <p
              className={`mt-3 text-3xl font-semibold ${
                dashboard.pending > 0 ? "text-amber-700" : ""
              }`}
            >
              {dashboard.pending}
              <span
                className={`ml-1 text-base font-normal ${
                  dashboard.pending > 0 ? "text-amber-600" : "text-slate"
                }`}
              >
                건
              </span>
            </p>
            <p className="mt-2 text-xs text-slate">승인/반려 처리가 필요한 사유서</p>
          </article>

          <article className="rounded-[28px] border border-ink/10 bg-white p-6">
            <p className="text-sm text-slate">오늘 승인</p>
            <p className="mt-3 text-3xl font-semibold">
              {dashboard.approvedToday}
              <span className="ml-1 text-base font-normal text-slate">건</span>
            </p>
            <p className="mt-2 text-xs text-slate">오늘 처리된 승인 건수</p>
          </article>

          <article
            className={`rounded-[28px] border p-6 ${
              dashboard.rejected > 0
                ? "border-red-100 bg-red-50/60"
                : "border-ink/10 bg-white"
            }`}
          >
            <p className="text-sm text-slate">반려</p>
            <p
              className={`mt-3 text-3xl font-semibold ${
                dashboard.rejected > 0 ? "text-red-700" : ""
              }`}
            >
              {dashboard.rejected}
              <span
                className={`ml-1 text-base font-normal ${
                  dashboard.rejected > 0 ? "text-red-500" : "text-slate"
                }`}
              >
                건
              </span>
            </p>
            <p className="mt-2 text-xs text-slate">반려된 사유서 (재검토 필요)</p>
          </article>

          <article className="rounded-[28px] border border-ink/10 bg-white p-6">
            <p className="text-sm text-slate">기간 합계</p>
            <p className="mt-3 text-3xl font-semibold">
              {dashboard.total}
              <span className="ml-1 text-base font-normal text-slate">건</span>
            </p>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate">
              {Object.entries(dashboard.categoryBreakdown).map(([cat, count]) => (
                <span key={cat}>
                  {ABSENCE_CATEGORY_LABEL[cat as AbsenceCategory] ?? cat} {count}
                </span>
              ))}
            </div>
          </article>
        </section>
      )}

      {/* 필터 */}
      <form className="mt-8 rounded-[28px] border border-ink/10 bg-mist p-6">
        <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
          <div>
            <label className="mb-2 block text-sm font-medium">시험 기간</label>
            <select
              name="periodId"
              defaultValue={selectedPeriod?.id ? String(selectedPeriod.id) : ""}
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
            >
              {periods.map((period) => (
                <option key={period.id} value={period.id}>
                  {period.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">직렬</label>
            <select
              name="examType"
              defaultValue={examType}
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
            >
              <option value="GONGCHAE">{EXAM_TYPE_LABEL.GONGCHAE}</option>
              <option value="GYEONGCHAE">{EXAM_TYPE_LABEL.GYEONGCHAE}</option>
            </select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">상태</label>
            <select
              name="status"
              defaultValue={selectedStatus}
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">사유 유형</label>
            <select
              name="absenceCategory"
              defaultValue={selectedCategory}
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
            >
              <option value="ALL">전체</option>
              {Object.values(AbsenceCategory).map((category) => (
                <option key={category} value={category}>
                  {ABSENCE_CATEGORY_LABEL[category]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">수험번호 / 이름</label>
            <input
              type="text"
              name="search"
              defaultValue={search}
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
              placeholder="검색"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">제출일 시작</label>
            <input
              type="date"
              name="submittedFrom"
              defaultValue={submittedFrom}
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">제출일 종료</label>
            <input
              type="date"
              name="submittedTo"
              defaultValue={submittedTo}
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
            />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate">
            {notes.length > 0 ? `${notes.length}건 조회됨` : ""}
          </p>
          <div className="flex gap-3">
            <a
              href={exportUrl}
              className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
            >
              Excel 내보내기
            </a>
            <button
              type="submit"
              className="inline-flex items-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest"
            >
              조회
            </button>
          </div>
        </div>
      </form>

      <div className="mt-8">
        <AbsenceNoteManager
          students={students}
          sessions={sessionOptions}
          notes={notes.map((note) => ({
            ...note,
            submittedAt: note.submittedAt ? note.submittedAt.toISOString() : null,
            approvedAt: note.approvedAt ? note.approvedAt.toISOString() : null,
            session: {
              ...note.session,
              examDate: note.session.examDate.toISOString(),
            },
          }))}
        />
      </div>
    </div>
  );
}
