import { AdminRole, AttendType } from "@/generated/prisma";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import {
  executeOnlineScoreUpload,
  previewOnlineScoreUpload,
  type ScoreResolutionInput,
} from "@/lib/scores/service";

type Mode = "preview" | "execute";

function parseResolutions(raw: FormDataEntryValue | null) {
  if (typeof raw !== "string" || !raw) {
    return {} satisfies ScoreResolutionInput;
  }

  return JSON.parse(raw) as ScoreResolutionInput;
}

export async function POST(request: Request) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const formData = await request.formData();
    const mainFile = formData.get("mainFile");
    const oxFile = formData.get("oxFile");
    const detailFile = formData.get("detailFile");
    const oxDetailFile = formData.get("oxDetailFile");
    const sessionId = Number(formData.get("sessionId"));
    const mode = (formData.get("mode") as Mode | null) ?? "preview";
    const attendType = formData.get("attendType") as AttendType | null;
    const resolutions = parseResolutions(formData.get("resolutions"));

    if (!Number.isFinite(sessionId) || sessionId <= 0) {
      return NextResponse.json({ error: "시험 회차를 선택하세요." }, { status: 400 });
    }

    if (!(mainFile instanceof File)) {
      return NextResponse.json({ error: "온라인 점수 파일을 선택하세요." }, { status: 400 });
    }

    const mainBuffer = Buffer.from(await mainFile.arrayBuffer());
    const oxBuffer = oxFile instanceof File ? Buffer.from(await oxFile.arrayBuffer()) : undefined;
    const detailBuffer =
      detailFile instanceof File ? Buffer.from(await detailFile.arrayBuffer()) : undefined;
    const oxDetailBuffer =
      oxDetailFile instanceof File
        ? Buffer.from(await oxDetailFile.arrayBuffer())
        : undefined;

    if (mode === "preview") {
      const preview = await previewOnlineScoreUpload({
        sessionId,
        mainFileName: mainFile.name,
        mainBuffer,
        oxFileName: oxFile instanceof File ? oxFile.name : undefined,
        oxBuffer,
        detailFileName: detailFile instanceof File ? detailFile.name : undefined,
        detailBuffer,
        oxDetailFileName: oxDetailFile instanceof File ? oxDetailFile.name : undefined,
        oxDetailBuffer,
        resolutions,
        attendType: attendType ?? undefined,
      });

      return NextResponse.json(preview);
    }

    const result = await executeOnlineScoreUpload({
      adminId: auth.context.adminUser.id,
      sessionId,
      mainFileName: mainFile.name,
      mainBuffer,
      oxFileName: oxFile instanceof File ? oxFile.name : undefined,
      oxBuffer,
      detailFileName: detailFile instanceof File ? detailFile.name : undefined,
      detailBuffer,
      oxDetailFileName: oxDetailFile instanceof File ? oxDetailFile.name : undefined,
      oxDetailBuffer,
      resolutions,
      attendType: attendType ?? undefined,
      ipAddress: request.headers.get("x-forwarded-for"),
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "온라인 채점 파일 처리에 실패했습니다." },
      { status: 400 },
    );
  }
}
