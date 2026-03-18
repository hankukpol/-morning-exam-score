import Link from "next/link";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { EXAM_TYPE_LABEL, SUBJECT_LABEL } from "@/lib/constants";
import { ScoreCsvImporter } from "./score-csv-importer";

export const dynamic = "force-dynamic";

export type PeriodOption = {
  id: number;
  name: string;
  isActive: boolean;
  examType: "GONGCHAE" | "GYEONGCHAE";
  sessions: SessionOption[];
};

export type SessionOption = {
  id: number;
  examType: string;
  week: number;
  subject: string;
  displaySubjectName: string | null;
  examDate: string;
};

export default async function ScoreImportPage() {
  await requireAdminContext(AdminRole.TEACHER);

  const periods = await getPrisma().examPeriod.findMany({
    orderBy: [{ isActive: "desc" }, { startDate: "desc" }],
    select: {
      id: true,
      name: true,
      isActive: true,
      isGongchaeEnabled: true,
      isGyeongchaeEnabled: true,
      sessions: {
        where: { isCancelled: false },
        orderBy: [{ examDate: "asc" }, { subject: "asc" }],
        select: {
          id: true,
          examType: true,
          week: true,
          subject: true,
          displaySubjectName: true,
          examDate: true,
        },
      },
    },
  });

  // Flatten periods into options — one "period" per examType where enabled
  const periodOptions: PeriodOption[] = [];
  for (const p of periods) {
    const examTypes: Array<"GONGCHAE" | "GYEONGCHAE"> = [];
    if (p.isGongchaeEnabled) examTypes.push("GONGCHAE");
    if (p.isGyeongchaeEnabled) examTypes.push("GYEONGCHAE");

    for (const examType of examTypes) {
      const sessions = p.sessions
        .filter((s) => s.examType === examType)
        .map((s) => ({
          id: s.id,
          examType: s.examType,
          week: s.week,
          subject: s.subject,
          displaySubjectName: s.displaySubjectName ?? null,
          examDate: s.examDate.toISOString(),
        }));

      if (sessions.length > 0) {
        periodOptions.push({
          id: p.id,
          name: `${p.name} (${EXAM_TYPE_LABEL[examType as keyof typeof EXAM_TYPE_LABEL] ?? examType})`,
          isActive: p.isActive,
          examType,
          sessions,
        });
      }
    }
  }

  const subjectOptions = Object.entries(SUBJECT_LABEL).map(([key, label]) => ({
    key,
    label,
  }));

  return (
    <div className="p-8 sm:p-10">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
            성적 관리
          </div>
          <h1 className="mt-5 text-3xl font-semibold text-ink">성적 CSV 가져오기 (다과목)</h1>
          <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
            여러 과목 점수를 한 행에 담은 CSV 파일을 업로드하여 성적을 일괄 등록합니다.
            행마다 학번과 각 과목 점수를 입력합니다.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/admin/scores/bulk-import"
            className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
          >
            단일 과목 CSV
          </Link>
          <Link
            href="/admin/scores"
            className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
          >
            성적 관리 허브
          </Link>
        </div>
      </div>

      <div className="mt-8">
        <ScoreCsvImporter
          periodOptions={periodOptions}
          subjectOptions={subjectOptions}
        />
      </div>
    </div>
  );
}
