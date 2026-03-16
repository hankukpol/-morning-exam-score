import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { InstructorSettlementView } from "@/components/settlements/instructor-settlement-view";

export const dynamic = "force-dynamic";

export type InstructorSettlementRow = {
  instructorId: string;
  instructorName: string;
  subject: string;
  lectures: Array<{
    lectureId: string;
    lectureName: string;
    subjectName: string;
    price: number;
    instructorRate: number;
    enrolledCount: number;
    totalRevenue: number;
    instructorAmount: number;
    academyAmount: number;
  }>;
  totalRevenue: number;
  totalInstructorAmount: number;
  totalAcademyAmount: number;
};

export default async function InstructorSettlementsPage() {
  await requireAdminContext(AdminRole.MANAGER);

  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth() + 1;
  const monthStr = `${year}-${String(month).padStart(2, "0")}`;

  // Get all active instructors with their lecture subjects and enrollment counts
  const instructors = await getPrisma().instructor.findMany({
    where: { isActive: true },
    include: {
      lectureSubjects: {
        include: {
          lecture: {
            select: {
              id: true,
              name: true,
              isActive: true,
              _count: {
                select: {
                  enrollments: {
                    where: { status: { in: ["ACTIVE", "COMPLETED"] } },
                  },
                },
              },
            },
          },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  const rows: InstructorSettlementRow[] = instructors.map((instructor) => {
    const lectures = instructor.lectureSubjects.map((subject) => {
      const enrolledCount = subject.lecture._count.enrollments;
      const totalRevenue = enrolledCount * subject.price;
      const instructorAmount = Math.floor(totalRevenue * (subject.instructorRate / 100));
      const academyAmount = totalRevenue - instructorAmount;
      return {
        lectureId: subject.lectureId,
        lectureName: subject.lecture.name,
        subjectName: subject.subjectName,
        price: subject.price,
        instructorRate: subject.instructorRate,
        enrolledCount,
        totalRevenue,
        instructorAmount,
        academyAmount,
      };
    });

    const totalRevenue = lectures.reduce((s, l) => s + l.totalRevenue, 0);
    const totalInstructorAmount = lectures.reduce((s, l) => s + l.instructorAmount, 0);
    const totalAcademyAmount = totalRevenue - totalInstructorAmount;

    return {
      instructorId: instructor.id,
      instructorName: instructor.name,
      subject: instructor.subject,
      lectures,
      totalRevenue,
      totalInstructorAmount,
      totalAcademyAmount,
    };
  });

  // Filter out instructors with no lectures
  const activeRows = rows.filter((r) => r.lectures.length > 0);

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        수납 정산
      </div>
      <h1 className="mt-5 text-3xl font-semibold">강사 정산</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        특강 강사별 수강료 배분 및 정산 현황을 조회합니다. 강사별 배분율은 강사 설정에서 특강 과목을
        등록할 때 설정됩니다.
      </p>
      <div className="mt-8">
        <InstructorSettlementView month={monthStr} rows={activeRows} />
      </div>
    </div>
  );
}
