import { NextResponse } from "next/server";
import { lookupStudentPortalStudent } from "@/lib/student-portal/service";
import {
  clearStudentPortalSession,
  writeStudentPortalSession,
} from "@/lib/student-portal/session";

type RequestBody = {
  examNumber?: string;
  name?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RequestBody;
    const student = await lookupStudentPortalStudent({
      examNumber: String(body.examNumber ?? ""),
      name: String(body.name ?? ""),
    });

    writeStudentPortalSession({
      examNumber: student.examNumber,
      name: student.name,
    });

    return NextResponse.json({ student });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "학생 포털 조회에 실패했습니다.",
      },
      { status: 400 },
    );
  }
}

export async function DELETE() {
  clearStudentPortalSession();
  return NextResponse.json({ success: true });
}
