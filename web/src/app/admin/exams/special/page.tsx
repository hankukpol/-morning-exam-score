import { AdminRole, ExamEventType } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { SpecialExamManager } from "./special-exam-manager";

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

export default async function SpecialExamPage() {
  await requireAdminContext(AdminRole.COUNSELOR);

  const events = await getPrisma().examEvent.findMany({
    where: { eventType: ExamEventType.SPECIAL },
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
          <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
            Exam Registration
          </div>
          <h1 className="mt-5 text-3xl font-semibold">특강모의고사 관리</h1>
          <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
            특강 수강생 대상 별도 시험을 등록하고 접수를 처리합니다.
          </p>
        </div>
      </div>

      <div className="mt-8">
        <SpecialExamManager initialEvents={rows} />
      </div>
    </div>
  );
}
