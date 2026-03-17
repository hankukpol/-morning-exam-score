import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import {
  EnrollmentList,
  type EnrollmentWithRelations,
} from "@/components/enrollments/enrollment-list";

export const dynamic = "force-dynamic";

export default async function EnrollmentsPage() {
  const ctx = await requireAdminContext(AdminRole.COUNSELOR);

  const enrollments = await getPrisma().courseEnrollment.findMany({
    include: {
      student: { select: { name: true, phone: true } },
      cohort: { select: { name: true, examCategory: true } },
      product: { select: { name: true } },
      specialLecture: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        수강 관리
      </div>
      <h1 className="mt-5 text-3xl font-semibold">수강 등록 목록</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        수강생의 등록 내역을 조회하고 상태를 변경합니다. 수강 중, 휴원, 퇴원 처리를 이 페이지에서
        진행합니다.
      </p>
      <div className="mt-8">
        <EnrollmentList
          initialEnrollments={enrollments as unknown as EnrollmentWithRelations[]}
          adminRole={ctx.adminUser.role}
        />
      </div>
    </div>
  );
}
