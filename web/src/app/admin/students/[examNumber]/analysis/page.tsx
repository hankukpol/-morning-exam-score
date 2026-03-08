import Link from "next/link";
import { AdminRole } from "@/generated/prisma";
import {
  BarComparisonChart,
  RadarComparisonChart,
  TrendLineChart,
} from "@/components/analytics/charts";
import { getStudentDetailAnalysis } from "@/lib/analytics/analysis";
import { requireAdminContext } from "@/lib/auth";
import { SUBJECT_LABEL } from "@/lib/constants";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

type PageProps = {
  params: {
    examNumber: string;
  };
  searchParams?: Record<string, string | string[] | undefined>;
};

function readParam(
  searchParams: PageProps["searchParams"],
  key: string,
) {
  const value = searchParams?.[key];
  return Array.isArray(value) ? value[0] : value;
}

export default async function StudentAnalysisPage({ params, searchParams }: PageProps) {
  await requireAdminContext(AdminRole.VIEWER);
  const periodId = Number(readParam(searchParams, "periodId") ?? 0) || undefined;
  const data = await getStudentDetailAnalysis({
    examNumber: params.examNumber,
    periodId,
  });

  if (!data) {
    return (
      <div className="p-8 sm:p-10">
        <p className="text-sm text-slate">학생을 찾을 수 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="p-8 sm:p-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
            F-13-D Personal Analysis
          </div>
          <h1 className="mt-5 text-3xl font-semibold">
            {data.student.name} ({data.student.examNumber})
          </h1>
          <p className="mt-3 text-sm leading-7 text-slate">
            {data.selectedPeriod ? `${data.selectedPeriod.name} 기준` : "분석할 성적이 없습니다."}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            href={`/admin/students/${data.student.examNumber}/history`}
            className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
          >
            성적 이력
          </Link>
          <Link
            href={`/admin/counseling?examNumber=${data.student.examNumber}`}
            className="inline-flex items-center rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white transition hover:bg-forest"
          >
            면담 화면
          </Link>
        </div>
      </div>

      <form className="mt-8 flex flex-wrap gap-3 rounded-[28px] border border-ink/10 bg-mist p-6">
        <select
          name="periodId"
          defaultValue={data.selectedPeriod?.id ? String(data.selectedPeriod.id) : ""}
          className="rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
        >
          {data.availablePeriods.map((period) => (
            <option key={period.id} value={period.id}>
              {period.name}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="inline-flex items-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest"
        >
          기간 변경
        </button>
      </form>

      <div className="mt-8 grid gap-6 xl:grid-cols-2">
        <section className="rounded-[28px] border border-ink/10 bg-white p-6">
          <h2 className="text-xl font-semibold">과목별 레이더</h2>
          <div className="mt-4">
            <RadarComparisonChart data={data.radarData ?? []} />
          </div>
        </section>

        <section className="rounded-[28px] border border-ink/10 bg-white p-6">
          <h2 className="text-xl font-semibold">과목 평균 비교</h2>
          <div className="mt-4">
            <BarComparisonChart
              data={data.subjectSummary.map((row) => ({
                subject: row.subject,
                studentAverage: row.studentAverage ?? 0,
                cohortAverage: row.cohortAverage ?? 0,
                top10Average: row.top10Average ?? 0,
              }))}
              xKey="subject"
              bars={[
                { dataKey: "studentAverage", color: "#EA580C", name: "개인 평균" },
                { dataKey: "cohortAverage", color: "#2563EB", name: "전체 평균" },
                { dataKey: "top10Average", color: "#0F766E", name: "상위 10%" },
              ]}
            />
          </div>
        </section>
      </div>

      <section className="mt-8 rounded-[28px] border border-ink/10 bg-white p-6">
        <h2 className="text-xl font-semibold">회차별 추이</h2>
        <div className="mt-4">
          <TrendLineChart
            data={data.trendData.map((row) => ({
              label: row.label,
              studentScore: row.studentScore,
              cohortAverage: row.cohortAverage,
              top10Average: row.top10Average,
              top30Average: row.top30Average,
            }))}
            xKey="label"
            lines={[
              { dataKey: "studentScore", color: "#EA580C", name: "개인 점수" },
              { dataKey: "cohortAverage", color: "#2563EB", name: "전체 평균" },
              { dataKey: "top10Average", color: "#0F766E", name: "상위 10%" },
              { dataKey: "top30Average", color: "#7C3AED", name: "상위 30%" },
            ]}
          />
        </div>
      </section>

      <section className="mt-8 rounded-[28px] border border-ink/10 bg-white p-6">
        <h2 className="text-xl font-semibold">과목별 비교 테이블</h2>
        <div className="mt-6 overflow-x-auto rounded-[24px] border border-ink/10">
          <table className="min-w-full divide-y divide-ink/10 text-sm">
            <thead className="bg-mist/80 text-left">
              <tr>
                <th className="px-4 py-3 font-semibold">과목</th>
                <th className="px-4 py-3 font-semibold">개인 평균</th>
                <th className="px-4 py-3 font-semibold">백분위 목표</th>
                <th className="px-4 py-3 font-semibold">전체 평균</th>
                <th className="px-4 py-3 font-semibold">최고점</th>
                <th className="px-4 py-3 font-semibold">상위 10%</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/10">
              {data.subjectSummary.map((row) => (
                <tr key={row.subject}>
                  <td className="px-4 py-3">{SUBJECT_LABEL[row.subject]}</td>
                  <td className="px-4 py-3">{row.studentAverage ?? "-"}</td>
                  <td className="px-4 py-3">{row.targetScore ?? "-"}</td>
                  <td className="px-4 py-3">{row.cohortAverage ?? "-"}</td>
                  <td className="px-4 py-3">{row.highestScore ?? "-"}</td>
                  <td className="px-4 py-3">{row.top10Average ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8 rounded-[28px] border border-ink/10 bg-white p-6">
        <h2 className="text-xl font-semibold">오답 상위 문항</h2>
        <div className="mt-6 overflow-x-auto rounded-[24px] border border-ink/10">
          <table className="min-w-full divide-y divide-ink/10 text-sm">
            <thead className="bg-mist/80 text-left">
              <tr>
                <th className="px-4 py-3 font-semibold">시험일</th>
                <th className="px-4 py-3 font-semibold">과목</th>
                <th className="px-4 py-3 font-semibold">문항</th>
                <th className="px-4 py-3 font-semibold">정답</th>
                <th className="px-4 py-3 font-semibold">학생 답안</th>
                <th className="px-4 py-3 font-semibold">정답률</th>
                <th className="px-4 py-3 font-semibold">난이도</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/10">
              {data.wrongQuestionRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate">
                    오답 문항 데이터가 없습니다.
                  </td>
                </tr>
              ) : null}
              {data.wrongQuestionRows.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-3">{formatDate(row.examDate)}</td>
                  <td className="px-4 py-3">{SUBJECT_LABEL[row.subject]}</td>
                  <td className="px-4 py-3">{row.questionNo}</td>
                  <td className="px-4 py-3">{row.correctAnswer}</td>
                  <td className="px-4 py-3">{row.answer}</td>
                  <td className="px-4 py-3">
                    {row.correctRate !== null && row.correctRate !== undefined
                      ? `${row.correctRate.toFixed(1)}%`
                      : "-"}
                  </td>
                  <td className="px-4 py-3">{row.difficulty ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
