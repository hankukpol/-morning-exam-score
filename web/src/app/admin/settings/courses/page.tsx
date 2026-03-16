import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { CourseManager } from "@/components/courses/course-manager";

export const dynamic = "force-dynamic";

export default async function CoursesSettingsPage() {
  await requireAdminContext(AdminRole.TEACHER);

  const courses = await getPrisma().course.findMany({
    orderBy: [{ createdAt: "desc" }],
  });

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        P0-3 강좌 마스터
      </div>
      <h1 className="mt-5 text-3xl font-semibold">강좌 관리</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        종합반·단과·특강 강좌를 등록하고 관리합니다. 수강료, 정원, 기수 기간을 설정할 수 있습니다.
      </p>
      <div className="mt-8">
        <CourseManager initialCourses={courses as any} />
      </div>
    </div>
  );
}
