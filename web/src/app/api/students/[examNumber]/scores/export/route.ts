import { NextRequest, NextResponse } from "next/server";
import { AdminRole } from "@prisma/client";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

type RouteContext = {
  params: { examNumber: string };
};

export async function GET(
  _request: NextRequest,
  { params }: RouteContext,
) {
  const auth = await requireApiAdmin(AdminRole.VIEWER);
  if (!auth.ok)
    return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { examNumber } = params;

  const scores = await getPrisma().score.findMany({
    where: { examNumber },
    include: {
      session: {
        select: {
          examDate: true,
          subject: true,
          week: true,
          period: { select: { name: true } },
        },
      },
    },
    orderBy: [{ session: { examDate: "desc" } }],
  });

  const ATTEND_LABEL: Record<string, string> = {
    NORMAL: "출석",
    LIVE: "라이브",
    EXCUSED: "사유 결시",
    ABSENT: "무단 결시",
  };

  const header = "날짜,기수,과목,주차,출결,원점수,OX점수,최종점수,메모\n";

  const rows = scores
    .map((s) => {
      const date = s.session.examDate
        ? new Date(s.session.examDate).toLocaleDateString("ko-KR")
        : "";
      const period = s.session.period?.name ?? "";
      const subject = s.session.subject;
      const week = s.session.week;
      const attend = ATTEND_LABEL[s.attendType] ?? s.attendType;
      const raw = s.rawScore ?? "";
      const ox = s.oxScore ?? "";
      const final = s.finalScore ?? "";
      // Escape commas and double-quotes in memo
      const note = (s.note ?? "").replace(/"/g, '""');
      return `${date},${period},${subject},${week}회,${attend},${raw},${ox},${final},"${note}"`;
    })
    .join("\n");

  const csv = "\uFEFF" + header + rows; // BOM for Excel Korean support

  // Get student name for filename
  const student = await getPrisma().student.findUnique({
    where: { examNumber },
    select: { name: true },
  });

  const filename = `성적이력_${student?.name ?? examNumber}_${examNumber}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
