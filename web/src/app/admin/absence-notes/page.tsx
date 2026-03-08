import {
  AbsenceCategory,
  AbsenceStatus,
  AdminRole,
} from "@/generated/prisma";
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
import { listAbsenceNotes } from "@/lib/absence-notes/service";
import { getPrisma } from "@/lib/prisma";

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
  const today = new Date(new Date().setHours(0, 0, 0, 0));
  const selectedStatus = readStringParam(searchParams, "status") ?? "ALL";
  const selectedCategory = readStringParam(searchParams, "absenceCategory") ?? "ALL";
  const search = readStringParam(searchParams, "search") ?? "";

  const [notes, students] = await Promise.all([
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
        })
      : Promise.resolve([]),
    getPrisma().student.findMany({
      where: {
        examType,
        isActive: true,
      },
      select: {
        examNumber: true,
        name: true,
      },
      orderBy: {
        examNumber: "asc",
      },
    }),
  ]);

  const sessionOptions =
    selectedPeriod?.sessions
      .filter(
        (session) =>
          session.examType === examType &&
          !session.isCancelled &&
          session.examDate >= today,
      )
      .map((session) => ({
        id: session.id,
        examDate: session.examDate.toISOString(),
        subject: session.subject,
        week: session.week,
      })) ?? [];

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

      <form className="mt-8 grid gap-4 rounded-[28px] border border-ink/10 bg-mist p-6 md:grid-cols-5">
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
        <div className="md:col-span-5 flex justify-end">
          <button
            type="submit"
            className="inline-flex items-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest"
          >
            조회
          </button>
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
