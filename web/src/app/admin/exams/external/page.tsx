import { AdminRole, ExamEventType } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { ExternalExamManager } from "./external-exam-manager";

export const dynamic = "force-dynamic";

export type ExamEventRow = {
  id: string;
  title: string;
  eventType: ExamEventType;
  examDate: string;
  registrationFee: number;
  registrationDeadline: string | null;
  venue: string | null;
  isActive: boolean;
  createdAt: string;
  _count: { registrations: number };
};

export default async function ExternalExamPage() {
  await requireAdminContext(AdminRole.COUNSELOR);

  const events = await getPrisma().examEvent.findMany({
    where: { eventType: ExamEventType.EXTERNAL },
    orderBy: { examDate: "desc" },
    include: { _count: { select: { registrations: true } } },
  });

  const rows: ExamEventRow[] = events.map((e) => ({
    id: e.id,
    title: e.title,
    eventType: e.eventType,
    examDate: e.examDate.toISOString(),
    registrationFee: e.registrationFee,
    registrationDeadline: e.registrationDeadline?.toISOString() ?? null,
    venue: e.venue,
    isActive: e.isActive,
    createdAt: e.createdAt.toISOString(),
    _count: e._count,
  }));

  return (
    <div className="p-8 sm:p-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full border border-purple-200 bg-purple-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-purple-700">
            External Exam
          </div>
          <h1 className="mt-5 text-3xl font-semibold">외부모의고사 관리</h1>
          <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
            경찰청·공단 주관 외부 시험 일정을 등록하고 수강생 응시 결과를 기록합니다.
          </p>
        </div>
      </div>
      <div className="mt-8">
        <ExternalExamManager initialEvents={rows} />
      </div>
    </div>
  );
}
