import { StudentType } from "@/generated/prisma";
import { RankingRow } from "@/lib/analytics/service";
import { formatRank, formatScore } from "@/lib/analytics/presentation";
import { STUDENT_TYPE_LABEL } from "@/lib/constants";

type RankingTableProps = {
  rows: RankingRow[];
  view: "overall" | "new";
};

export function RankingTable({ rows, view }: RankingTableProps) {
  return (
    <div className="overflow-x-auto rounded-[28px] border border-ink/10 bg-white">
      <table className="min-w-full divide-y divide-ink/10 text-sm">
        <thead className="bg-mist/80 text-left">
          <tr>
            <th className="px-4 py-3 font-semibold">석차</th>
            <th className="px-4 py-3 font-semibold">수험번호</th>
            <th className="px-4 py-3 font-semibold">이름</th>
            <th className="px-4 py-3 font-semibold">구분</th>
            <th className="px-4 py-3 font-semibold">평균</th>
            <th className="px-4 py-3 font-semibold">참여율</th>
            <th className="px-4 py-3 font-semibold">개근</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink/10">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-4 py-8 text-center text-slate">
                집계할 성적이 없습니다.
              </td>
            </tr>
          ) : null}
          {rows.map((row) => {
            const rank = view === "new" ? row.newRank : row.overallRank;

            return (
              <tr key={row.examNumber} className={!row.isActive ? "bg-slate-50/70 text-slate" : ""}>
                <td className="px-4 py-3 font-semibold">{formatRank(rank)}</td>
                <td className="px-4 py-3">{row.examNumber}</td>
                <td className="px-4 py-3">{row.name}</td>
                <td className="px-4 py-3">
                  {STUDENT_TYPE_LABEL[row.studentType as StudentType]}
                </td>
                <td className="px-4 py-3">{formatScore(row.average)}</td>
                <td className="px-4 py-3">{row.participationRate.toFixed(1)}%</td>
                <td className="px-4 py-3">{row.perfectAttendance ? "개근" : "-"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
