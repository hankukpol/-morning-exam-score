import { getStudentPortalViewer } from "@/lib/student-portal/service";

export async function requireStudentPortalStudent() {
  const student = await getStudentPortalViewer();

  if (!student) {
    return {
      ok: false as const,
      status: 401,
      error: "학생 포털 조회 정보가 없습니다. 다시 조회해 주세요.",
    };
  }

  return {
    ok: true as const,
    student,
  };
}
