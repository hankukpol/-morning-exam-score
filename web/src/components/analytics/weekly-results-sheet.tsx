import { Fragment } from "react";
import Link from "next/link";
import { AttendType, Subject, StudentStatus } from "@/generated/prisma";
import { WeeklyResultsSheetRow, type TuesdayWeekSummary } from "@/lib/analytics/service";
import { STATUS_LABEL, STATUS_ROW_CLASS, formatRank, formatScore } from "@/lib/analytics/presentation";
import { SUBJECT_LABEL } from "@/lib/constants";
import { formatDate } from "@/lib/format";

type SessionColumn = {
  id: number;
  subject: Subject;
  examDate: Date;
};

type WeeklyResultsSheetProps = {
  week: TuesdayWeekSummary;
  sessions: SessionColumn[];
  rows: WeeklyResultsSheetRow[];
};

function formatCellValue(
  attendType: AttendType | null,
  value: number | null,
  mode: "mock" | "ox",
) {
  if (attendType === AttendType.NORMAL) {
    return value === null ? "" : formatScore(value);
  }

  if (attendType === AttendType.LIVE) {
    if (value !== null && mode === "mock") {
      return `${formatScore(value)}(라)`;
    }

    return "라이브";
  }

  if (attendType === AttendType.EXCUSED) {
    return "사유";
  }

  return "";
}

function noteClass(status: StudentStatus) {
  if (status === StudentStatus.DROPOUT) {
    return "bg-red-600 text-white";
  }

  if (status === StudentStatus.WARNING_2) {
    return "bg-amber-200 text-amber-900";
  }

  if (status === StudentStatus.WARNING_1) {
    return "bg-rose-100 text-rose-700";
  }

  return "";
}

export function WeeklyResultsSheet({ week, sessions, rows }: WeeklyResultsSheetProps) {
  const headCellClass = "border border-slate-200 bg-slate-50 px-3 py-3 font-semibold";
  const headNameCellClass = "border border-slate-200 bg-slate-50 px-4 py-3 font-semibold";
  const subHeadCellClass = "border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold";
  const sortedSessions = [...sessions].sort(
    (left, right) => left.examDate.getTime() - right.examDate.getTime() || left.id - right.id,
  );
  const averages = sortedSessions.map((session) => {
    const mockValues = rows
      .map((row) => row.cells.find((cell) => cell.sessionId === session.id))
      .filter((cell) => cell?.attendType === AttendType.NORMAL && cell.mockScore !== null)
      .map((cell) => cell?.mockScore as number);
    const oxValues =
      session.subject === Subject.POLICE_SCIENCE
        ? rows
            .map((row) => row.cells.find((cell) => cell.sessionId === session.id))
            .filter((cell) => cell?.attendType === AttendType.NORMAL && cell.policeOxScore !== null)
            .map((cell) => cell?.policeOxScore as number)
        : [];

    return {
      mock: mockValues.length === 0 ? null : mockValues.reduce((sum, value) => sum + value, 0) / mockValues.length,
      ox: oxValues.length === 0 ? null : oxValues.reduce((sum, value) => sum + value, 0) / oxValues.length,
    };
  });

  return (
    <div className="overflow-x-auto rounded-[28px] border border-ink/10 bg-white">
      <div className="min-w-[1280px]">
        <div className="border-b border-ink/10 px-6 py-5 text-center">
          <h2 className="text-2xl font-semibold">주간 성적표</h2>
          <p className="mt-2 text-sm text-slate">
            {week.label}
            {week.legacyWeeks.length > 0 ? ` / 기존 week ${week.legacyWeeks.join(", ")}` : ""}
          </p>
        </div>

        <table className="min-w-full border-collapse text-center text-sm">
          <thead>
            <tr>
              <th rowSpan={2} className={headCellClass}>번호</th>
              <th rowSpan={2} className={headNameCellClass}>이름</th>
              {sortedSessions.map((session) => (
                <th
                  key={session.id}
                  colSpan={session.subject === Subject.POLICE_SCIENCE ? 2 : 1}
                  className={headCellClass}
                >
                  <div>{formatDate(session.examDate)}</div>
                  <div className="mt-1 text-xs font-medium text-slate">
                    {SUBJECT_LABEL[session.subject]}
                  </div>
                </th>
              ))}
              <th rowSpan={2} className={headCellClass}>모의고사 성적</th>
              <th rowSpan={2} className={headCellClass}>모의고사 석차</th>
              <th rowSpan={2} className={headCellClass}>경찰학 OX 성적</th>
              <th rowSpan={2} className={headCellClass}>경찰학 OX 석차</th>
              <th rowSpan={2} className={headCellClass}>참석률</th>
              <th rowSpan={2} className={headCellClass}>비고</th>
            </tr>
            <tr>
              {sortedSessions.map((session) =>
                session.subject === Subject.POLICE_SCIENCE ? (
                  <Fragment key={session.id}>
                    <th className={subHeadCellClass}>모의고사</th>
                    <th className={subHeadCellClass}>경찰학 OX</th>
                  </Fragment>
                ) : (
                  <th key={`${session.id}-mock`} className={subHeadCellClass}>모의고사</th>
                ),
              )}
            </tr>
            <tr className="bg-slate-50">
              <th colSpan={2} className="border border-slate-200 px-3 py-3 font-semibold">응시자 평균</th>
              {averages.map((average, index) =>
                sortedSessions[index]?.subject === Subject.POLICE_SCIENCE ? (
                  <Fragment key={`avg-${sortedSessions[index].id}`}>
                    <th className="border border-slate-200 px-3 py-2 font-semibold text-ember">
                      {formatScore(average.mock)}
                    </th>
                    <th className="border border-slate-200 px-3 py-2 font-semibold text-ember">
                      {formatScore(average.ox)}
                    </th>
                  </Fragment>
                ) : (
                  <th key={`avg-${sortedSessions[index].id}-mock`} className="border border-slate-200 px-3 py-2 font-semibold text-ember">
                    {formatScore(average.mock)}
                  </th>
                ),
              )}
              <th className="border border-slate-200 px-3 py-2" />
              <th className="border border-slate-200 px-3 py-2" />
              <th className="border border-slate-200 px-3 py-2" />
              <th className="border border-slate-200 px-3 py-2" />
              <th className="border border-slate-200 px-3 py-2" />
              <th className="border border-slate-200 px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.examNumber} className={row.isActive ? STATUS_ROW_CLASS[row.weekStatus] : "bg-slate-50/80 text-slate"}>
                <td className="border border-ink/10 px-3 py-3 font-semibold">{index + 1}</td>
                <td className="border border-ink/10 px-4 py-3 text-left">
                  <Link
                    href={`/admin/students/${row.examNumber}/history`}
                    className="font-semibold underline-offset-4 hover:text-forest hover:underline"
                  >
                    {row.name}
                  </Link>
                </td>
                {sortedSessions.map((session) => {
                  const cell = row.cells.find((item) => item.sessionId === session.id);
                  const mockDisplay = formatCellValue(cell?.attendType ?? null, cell?.mockScore ?? null, "mock");

                  if (session.subject === Subject.POLICE_SCIENCE) {
                    const oxDisplay = formatCellValue(
                      cell?.attendType ?? null,
                      cell?.policeOxScore ?? null,
                      "ox",
                    );
                    return (
                      <Fragment key={`${row.examNumber}-${session.id}`}>
                        <td className="border border-ink/10 px-3 py-3">
                          {mockDisplay}
                        </td>
                        <td className="border border-ink/10 px-3 py-3">
                          {oxDisplay}
                        </td>
                      </Fragment>
                    );
                  }

                  return (
                    <td key={`${row.examNumber}-${session.id}-mock`} className="border border-ink/10 px-3 py-3">
                      {mockDisplay}
                    </td>
                  );
                })}
                <td className="border border-ink/10 px-3 py-3 font-semibold">{Math.round(row.mockAverage)}</td>
                <td className="border border-ink/10 px-3 py-3 font-semibold text-red-500">{formatRank(row.mockRank)}</td>
                <td className="border border-ink/10 px-3 py-3 font-semibold">
                  {row.policeOxAverage === null ? "-" : Math.round(row.policeOxAverage)}
                </td>
                <td className="border border-ink/10 px-3 py-3 font-semibold text-red-500">{formatRank(row.policeOxRank)}</td>
                <td className="border border-ink/10 px-3 py-3 font-semibold">{Math.round(row.attendanceRate)}%</td>
                <td className={`border border-ink/10 px-3 py-3 font-semibold ${noteClass(row.weekStatus)}`}>
                  {row.weekStatus === StudentStatus.NORMAL ? "" : STATUS_LABEL[row.weekStatus]}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
