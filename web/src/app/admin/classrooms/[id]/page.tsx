import { AdminRole, AttendType, StudentStatus } from "@prisma/client";
import { notFound } from "next/navigation";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { ClassroomDetail } from "./classroom-detail";

export const dynamic = "force-dynamic";

// Serializable types for passing to client
export interface ClassroomStudentRow {
  id: string;
  examNumber: string;
  joinedAt: string;
  leftAt: string | null;
  student: {
    examNumber: string;
    name: string;
    generation: number | null;
    currentStatus: StudentStatus;
    phone: string | null;
  };
}

export interface ClassroomData {
  id: string;
  name: string;
  generation: number | null;
  teacher: { id: string; name: string };
  students: ClassroomStudentRow[];
}

export default async function ClassroomDetailPage({
  params,
}: {
  params: { id: string };
}) {
  await requireAdminContext(AdminRole.TEACHER);

  const today = new Date();
  const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  const classroom = await getPrisma().classroom.findUnique({
    where: { id: params.id },
    include: {
      teacher: { select: { id: true, name: true } },
      students: {
        where: { leftAt: null },
        include: {
          student: {
            select: {
              examNumber: true,
              name: true,
              generation: true,
              currentStatus: true,
              phone: true,
            },
          },
        },
        orderBy: [{ student: { generation: "desc" } }, { student: { name: "asc" } }],
      },
    },
  });

  if (!classroom) notFound();

  // Today's attendance logs
  const todayLogs = await getPrisma().classroomAttendanceLog.findMany({
    where: { classroomId: params.id, attendDate: todayDate },
    select: { examNumber: true, attendType: true, source: true },
  });

  const logMap = new Map(todayLogs.map((l) => [l.examNumber, l]));

  // Serialize dates for client
  const classroomData: ClassroomData = {
    id: classroom.id,
    name: classroom.name,
    generation: classroom.generation,
    teacher: classroom.teacher,
    students: classroom.students.map((s) => ({
      ...s,
      joinedAt: s.joinedAt.toISOString(),
      leftAt: s.leftAt?.toISOString() ?? null,
    })),
  };

  return (
    <div className="p-8 sm:p-10">
      <div className="flex items-center gap-2 mb-2">
        <Link href="/admin/classrooms" className="text-sm text-slate hover:text-ink">
          ← 담임반 목록
        </Link>
      </div>
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        담임반
      </div>
      <h1 className="mt-5 text-3xl font-semibold">{classroom.name}</h1>
      <p className="mt-2 text-sm text-slate">
        담임: {classroom.teacher.name}
        {classroom.generation && ` · ${classroom.generation}기`}
        {" · "}재적 {classroom.students.length}명
      </p>

      <div className="mt-8">
        <ClassroomDetail
          classroom={classroomData}
          todayLogMap={Object.fromEntries(logMap)}
          todayDate={todayDate.toISOString()}
        />
      </div>
    </div>
  );
}
