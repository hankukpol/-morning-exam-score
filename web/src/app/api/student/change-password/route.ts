import { NextResponse } from "next/server";
import { requireStudentPortalStudent } from "@/lib/student-portal/api";

export const dynamic = "force-dynamic";

// ─── POST: 비밀번호 변경 요청 ─────────────────────────────────────────────────
//
// 학생 포털은 학번+이름 JWT 쿠키 인증을 사용합니다.
// Supabase Auth 기반이 아니므로 별도 비밀번호가 없습니다.
// 연락처(phone) 변경은 직원을 통한 요청으로만 처리합니다.
// 이 엔드포인트는 향후 학생 전용 Supabase Auth 연동 시 확장할 수 있도록 placeholder로 제공됩니다.

export async function POST(request: Request) {
  const auth = await requireStudentPortalStudent(request);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  return NextResponse.json(
    {
      error:
        "학생 포털은 수험번호와 이름으로만 로그인합니다. 연락처 변경이 필요하시면 학원 창구(053-241-0112)로 문의해 주세요.",
    },
    { status: 400 },
  );
}
