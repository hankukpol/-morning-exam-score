import { AdminRole, ExamType } from "@/generated/prisma";
import { StudentManager } from "@/components/students/student-manager";
import { requireAdminContext } from "@/lib/auth";
import { listStudentsPage } from "@/lib/students/service";

export const dynamic = "force-dynamic";

type StudentsPageProps = {
  searchParams?: {
    examType?: ExamType;
    search?: string;
    generation?: string;
    activeOnly?: string;
    page?: string;
    pageSize?: string;
  };
};

export default async function AdminStudentsPage({ searchParams }: StudentsPageProps) {
  const examType = searchParams?.examType ?? "GONGCHAE";
  const search = searchParams?.search ?? "";
  const generation = searchParams?.generation ?? "";
  const activeOnly = searchParams?.activeOnly !== "false";
  const page = Math.max(1, Number(searchParams?.page ?? "1") || 1);
  const pageSize = Math.min(Math.max(Number(searchParams?.pageSize ?? "30") || 30, 1), 100);
  const [, result] = await Promise.all([
    requireAdminContext(AdminRole.TEACHER),
    listStudentsPage({
      examType,
      search,
      generation: generation ? Number(generation) : undefined,
      activeOnly,
      page,
      pageSize,
    }),
  ]);

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        F-02 Students
      </div>
      <h1 className="mt-5 text-3xl font-semibold">수강생 관리</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        怨듭콈? 寃쎌콈瑜?遺꾨━?댁꽌 議고쉶?섍퀬, 媛쒕퀎 ?깅줉/?섏젙/鍮꾪솢?깊솕? ?대젰 議고쉶瑜?紐⑤몢 ???붾㈃?먯꽌
        泥섎━?⑸땲??
      </p>
      <div className="mt-8">
        <StudentManager
          students={result.students.map((student) => ({
            ...student,
            registeredAt: student.registeredAt?.toISOString() ?? null,
          }))}
          filters={{
            examType,
            search,
            generation,
            activeOnly,
            page: result.page,
            pageSize: result.pageSize,
            totalCount: result.totalCount,
          }}
        />
      </div>
    </div>
  );
}
