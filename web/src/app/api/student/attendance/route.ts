import { NextRequest, NextResponse } from "next/server";
import { requireStudentPortalStudent } from "@/lib/student-portal/api";
import { getStudentPortalAttendanceSummary } from "@/student-portal-api-data";

export async function GET(request: NextRequest) {
  const auth = await requireStudentPortalStudent(request);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const data = await getStudentPortalAttendanceSummary({
    examNumber: auth.student.examNumber,
  });

  if (!data) {
    return NextResponse.json({ error: "Student not found." }, { status: 404 });
  }

  return NextResponse.json({ data });
}