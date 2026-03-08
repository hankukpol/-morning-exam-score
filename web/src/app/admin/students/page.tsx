import { AdminRole, ExamType } from "@/generated/prisma";
import { StudentManager } from "@/components/students/student-manager";
import { requireAdminContext } from "@/lib/auth";
import { listStudents } from "@/lib/students/service";

export const dynamic = "force-dynamic";

type StudentsPageProps = {
  searchParams?: {
    examType?: ExamType;
    search?: string;
    generation?: string;
    activeOnly?: string;
  };
};

export default async function AdminStudentsPage({ searchParams }: StudentsPageProps) {
  await requireAdminContext(AdminRole.TEACHER);

  const examType = searchParams?.examType ?? "GONGCHAE";
  const search = searchParams?.search ?? "";
  const generation = searchParams?.generation ?? "";
  const activeOnly = searchParams?.activeOnly !== "false";
  const students = await listStudents({
    examType,
    search,
    generation: generation ? Number(generation) : undefined,
    activeOnly,
  });

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        F-02 Students
      </div>
      <h1 className="mt-5 text-3xl font-semibold">수강생 관리</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        공채와 경채를 분리해서 조회하고, 개별 등록/수정/비활성화와 이력 조회를 모두 이 화면에서
        처리합니다.
      </p>
      <div className="mt-8">
        <StudentManager
          students={students.map((student) => ({
            ...student,
            registeredAt: student.registeredAt?.toISOString() ?? null,
          }))}
          filters={{
            examType,
            search,
            generation,
            activeOnly,
          }}
        />
      </div>
    </div>
  );
}
