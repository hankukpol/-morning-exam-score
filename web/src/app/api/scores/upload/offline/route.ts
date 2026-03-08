import { AdminRole, AttendType } from "@/generated/prisma";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import {
  executeOfflineScoreUpload,
  previewOfflineScoreUpload,
} from "@/lib/scores/service";

type Mode = "preview" | "execute";

export async function POST(request: Request) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const sessionId = Number(formData.get("sessionId"));
    const mode = (formData.get("mode") as Mode | null) ?? "preview";
    const attendType = formData.get("attendType") as AttendType | null;

    if (!Number.isFinite(sessionId) || sessionId <= 0) {
      return NextResponse.json({ error: "시험 회차를 선택하세요." }, { status: 400 });
    }

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "오프라인 채점 파일을 선택하세요." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    if (mode === "preview") {
      const preview = await previewOfflineScoreUpload({
        sessionId,
        fileName: file.name,
        buffer,
        attendType: attendType ?? undefined,
      });

      return NextResponse.json(preview);
    }

    const result = await executeOfflineScoreUpload({
      adminId: auth.context.adminUser.id,
      sessionId,
      fileName: file.name,
      buffer,
      attendType: attendType ?? undefined,
      ipAddress: request.headers.get("x-forwarded-for"),
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "오프라인 채점 파일 처리에 실패했습니다.",
      },
      { status: 400 },
    );
  }
}
