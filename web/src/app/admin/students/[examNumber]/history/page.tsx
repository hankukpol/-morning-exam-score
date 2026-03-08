import Link from "next/link";
import { AdminRole } from "@/generated/prisma";
import { ATTEND_TYPE_LABEL, SCORE_SOURCE_LABEL, SUBJECT_LABEL } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import { requireAdminContext } from "@/lib/auth";
import { getStudentHistory } from "@/lib/students/service";

export const dynamic = "force-dynamic";

type HistoryPageProps = {
  params: {
    examNumber: string;
  };
};

export default async function StudentHistoryPage({ params }: HistoryPageProps) {
  await requireAdminContext(AdminRole.VIEWER);
  const student = await getStudentHistory(params.examNumber);

  if (!student) {
    return (
      <div className="p-8 sm:p-10">
        <p className="text-sm text-slate">수강생을 찾을 수 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="p-8 sm:p-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
            Student History
          </div>
          <h1 className="mt-5 text-3xl font-semibold">
            {student.name} ({student.examNumber})
          </h1>
          <p className="mt-3 text-sm leading-7 text-slate">
            {student.className ?? "-"} / {student.generation ? `${student.generation}기` : "기수 미설정"}
          </p>
        </div>
        <Link
          href={`/admin/students?examType=${student.examType}`}
          className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
        >
          목록으로
        </Link>
      </div>

      <div className="mt-8 overflow-hidden rounded-[28px] border border-ink/10">
        <table className="min-w-full divide-y divide-ink/10 text-sm">
          <thead className="bg-mist text-left">
            <tr>
              <th className="px-4 py-3 font-semibold">기간</th>
              <th className="px-4 py-3 font-semibold">날짜</th>
              <th className="px-4 py-3 font-semibold">주차</th>
              <th className="px-4 py-3 font-semibold">과목</th>
              <th className="px-4 py-3 font-semibold">원점수</th>
              <th className="px-4 py-3 font-semibold">OX</th>
              <th className="px-4 py-3 font-semibold">최종점수</th>
              <th className="px-4 py-3 font-semibold">응시유형</th>
              <th className="px-4 py-3 font-semibold">입력원천</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/10 bg-white">
            {student.scores.map((score) => (
              <tr key={score.id}>
                <td className="px-4 py-3">{score.session.period.name}</td>
                <td className="px-4 py-3">{formatDate(score.session.examDate)}</td>
                <td className="px-4 py-3">{score.session.week}주차</td>
                <td className="px-4 py-3">{SUBJECT_LABEL[score.session.subject]}</td>
                <td className="px-4 py-3">{score.rawScore ?? "-"}</td>
                <td className="px-4 py-3">{score.oxScore ?? "-"}</td>
                <td className="px-4 py-3">{score.finalScore ?? "-"}</td>
                <td className="px-4 py-3">{ATTEND_TYPE_LABEL[score.attendType]}</td>
                <td className="px-4 py-3">{SCORE_SOURCE_LABEL[score.sourceType]}</td>
              </tr>
            ))}
            {student.scores.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-slate">
                  입력된 성적이 없습니다.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
