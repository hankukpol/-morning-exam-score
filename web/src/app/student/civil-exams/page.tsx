import type { Metadata } from "next";
import Link from "next/link";
import { ExamType } from "@prisma/client";
import { hasDatabaseConfig } from "@/lib/env";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "공채 시험 일정",
};

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

const EXAM_TYPE_LABEL: Record<ExamType, string> = {
  GONGCHAE: "공채",
  GYEONGCHAE: "경채",
};

const EXAM_TYPE_BADGE: Record<ExamType, string> = {
  GONGCHAE: "border-forest/20 bg-forest/10 text-forest",
  GYEONGCHAE: "border-ember/20 bg-ember/10 text-ember",
};

/** Overall exam status derived from dates relative to today */
type ExamStatus = "UPCOMING" | "ONGOING" | "CLOSED";

function computeExamStatus(
  writtenDate: Date | null,
  interviewDate: Date | null,
  resultDate: Date | null,
): ExamStatus {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dates = [writtenDate, interviewDate, resultDate].filter(Boolean) as Date[];
  if (dates.length === 0) return "UPCOMING";

  const allPast = dates.every((d) => {
    const t = new Date(d);
    t.setHours(0, 0, 0, 0);
    return t < today;
  });
  if (allPast) return "CLOSED";

  // If the first date (written) is in the past but something later is future — ONGOING
  if (writtenDate) {
    const w = new Date(writtenDate);
    w.setHours(0, 0, 0, 0);
    if (w < today) return "ONGOING";
  }

  return "UPCOMING";
}

const EXAM_STATUS_LABEL: Record<ExamStatus, string> = {
  UPCOMING: "예정",
  ONGOING: "진행 중",
  CLOSED: "종료",
};

const EXAM_STATUS_BADGE: Record<ExamStatus, string> = {
  UPCOMING: "border-amber-200 bg-amber-50 text-amber-700",
  ONGOING: "border-forest/20 bg-forest/10 text-forest",
  CLOSED: "border-ink/10 bg-mist text-slate",
};

function formatKoreanDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}.${m}.${d}`;
}

function computeDDay(date: Date): {
  label: string;
  pillClass: string;
} {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  const diff = Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (diff < 0) {
    return { label: "완료", pillClass: "border-ink/10 bg-mist text-slate" };
  }
  if (diff === 0) {
    return { label: "D-Day!", pillClass: "border-ember/30 bg-ember/10 text-ember font-bold" };
  }
  if (diff <= 14) {
    return { label: `D-${diff}`, pillClass: "border-red-200 bg-red-50 text-red-700" };
  }
  if (diff <= 30) {
    return { label: `D-${diff}`, pillClass: "border-amber-200 bg-amber-50 text-amber-700" };
  }
  return { label: `D-${diff}일`, pillClass: "border-forest/20 bg-forest/10 text-forest" };
}

type ExamRow = {
  id: number;
  name: string;
  examType: ExamType;
  year: number;
  writtenDate: Date | null;
  interviewDate: Date | null;
  resultDate: Date | null;
  description: string | null;
};

function ExamCard({ exam }: { exam: ExamRow }) {
  const written = exam.writtenDate ? computeDDay(exam.writtenDate) : null;
  const interview = exam.interviewDate ? computeDDay(exam.interviewDate) : null;
  const result = exam.resultDate ? computeDDay(exam.resultDate) : null;
  const status = computeExamStatus(exam.writtenDate, exam.interviewDate, exam.resultDate);

  return (
    <article className="rounded-[24px] border border-ink/10 bg-white p-5 shadow-sm">
      {/* Title row */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold text-ink">{exam.name}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${EXAM_STATUS_BADGE[status]}`}
          >
            {EXAM_STATUS_LABEL[status]}
          </span>
          <span
            className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${EXAM_TYPE_BADGE[exam.examType]}`}
          >
            {EXAM_TYPE_LABEL[exam.examType]}
          </span>
          <span className="inline-flex rounded-full border border-ink/10 bg-mist px-2.5 py-0.5 text-xs font-semibold text-slate">
            {exam.year}년
          </span>
        </div>
      </div>

      {/* Date rows */}
      <div className="mt-4 space-y-2.5">
        {exam.writtenDate && (
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="w-16 shrink-0 text-xs font-semibold text-slate">필기시험</span>
              <span className="text-sm font-medium text-ink">
                {formatKoreanDate(exam.writtenDate)}
              </span>
            </div>
            {written && (
              <span
                className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold ${written.pillClass}`}
              >
                {written.label}
              </span>
            )}
          </div>
        )}
        {exam.interviewDate && (
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="w-16 shrink-0 text-xs font-semibold text-slate">면접시험</span>
              <span className="text-sm font-medium text-ink">
                {formatKoreanDate(exam.interviewDate)}
              </span>
            </div>
            {interview && (
              <span
                className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold ${interview.pillClass}`}
              >
                {interview.label}
              </span>
            )}
          </div>
        )}
        {exam.resultDate && (
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="w-16 shrink-0 text-xs font-semibold text-slate">최종발표</span>
              <span className="text-sm font-medium text-ink">
                {formatKoreanDate(exam.resultDate)}
              </span>
            </div>
            {result && (
              <span
                className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold ${result.pillClass}`}
              >
                {result.label}
              </span>
            )}
          </div>
        )}
        {!exam.writtenDate && !exam.interviewDate && !exam.resultDate && (
          <p className="text-xs text-slate">시험 날짜가 아직 미정입니다.</p>
        )}
      </div>

      {/* Description */}
      {exam.description && (
        <p className="mt-3 border-t border-ink/5 pt-3 text-xs leading-relaxed text-slate">
          {exam.description}
        </p>
      )}
    </article>
  );
}

export default async function CivilExamsPage({ searchParams }: PageProps) {
  const rawType = Array.isArray(searchParams?.type)
    ? searchParams?.type[0]
    : searchParams?.type;
  const filterType: ExamType | "ALL" =
    rawType === "GONGCHAE" ? "GONGCHAE"
    : rawType === "GYEONGCHAE" ? "GYEONGCHAE"
    : "ALL";

  if (!hasDatabaseConfig()) {
    return (
      <main className="space-y-6 px-0 py-6">
        <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
          <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
            시험 일정 준비 중
          </div>
          <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
            공채 시험 일정은 DB 연결 후 사용할 수 있습니다.
          </h1>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/student"
              className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
            >
              ← 홈으로 돌아가기
            </Link>
          </div>
        </section>
      </main>
    );
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Fetch all active exams
  const allExams = await getPrisma().civilServiceExam.findMany({
    where: {
      isActive: true,
      ...(filterType !== "ALL" ? { examType: filterType } : {}),
    },
    orderBy: [{ year: "desc" }, { writtenDate: "asc" }],
    select: {
      id: true,
      name: true,
      examType: true,
      year: true,
      writtenDate: true,
      interviewDate: true,
      resultDate: true,
      description: true,
    },
  });

  // Split into upcoming (at least one future date) and past (all dates in past)
  const upcomingExams = allExams.filter((exam) => {
    const dates = [exam.writtenDate, exam.interviewDate, exam.resultDate].filter(
      Boolean,
    ) as Date[];
    if (dates.length === 0) return true;
    return dates.some((d) => {
      const t = new Date(d);
      t.setHours(0, 0, 0, 0);
      return t >= today;
    });
  });

  const pastExams = allExams.filter(
    (exam) => !upcomingExams.some((u) => u.id === exam.id),
  );

  // Group upcoming by year
  const upcomingYearGroups = upcomingExams.reduce<Record<number, typeof upcomingExams>>(
    (acc, exam) => {
      if (!acc[exam.year]) acc[exam.year] = [];
      acc[exam.year].push(exam);
      return acc;
    },
    {},
  );
  const upcomingYears = Object.keys(upcomingYearGroups)
    .map(Number)
    .sort((a, b) => b - a);

  // Count per type for filter tabs
  const gongchaeCount = allExams.filter((e) => e.examType === "GONGCHAE").length;
  const gyeongchaeCount = allExams.filter((e) => e.examType === "GYEONGCHAE").length;

  const filterTabs: { label: string; value: ExamType | "ALL"; count: number }[] = [
    { label: "전체", value: "ALL", count: allExams.length },
    { label: "공채", value: "GONGCHAE", count: gongchaeCount },
    { label: "경채", value: "GYEONGCHAE", count: gyeongchaeCount },
  ];

  return (
    <main className="space-y-6 px-0 py-6">
      {/* Header */}
      <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link
              href="/student"
              className="inline-flex items-center gap-1 text-sm text-slate transition hover:text-ember"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="h-4 w-4"
              >
                <path
                  fillRule="evenodd"
                  d="M11.78 5.22a.75.75 0 0 1 0 1.06L8.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z"
                  clipRule="evenodd"
                />
              </svg>
              홈으로
            </Link>
            <div className="mt-4 inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
              Civil Exam Schedule
            </div>
            <h1 className="mt-4 text-3xl font-semibold leading-tight sm:text-5xl">
              공채 시험 일정
            </h1>
            <p className="mt-4 text-sm leading-7 text-slate sm:text-base">
              경찰공채·경간부 시험 일정을 확인하세요
            </p>
          </div>
        </div>

        {/* KPI summary */}
        <div className="mt-6 grid grid-cols-3 gap-3">
          <article className="rounded-[20px] border border-ink/10 bg-mist p-3 text-center">
            <p className="text-xs text-slate">전체</p>
            <p className="mt-1 text-lg font-bold text-ink">{allExams.length}</p>
          </article>
          <article className="rounded-[20px] border border-forest/20 bg-forest/5 p-3 text-center">
            <p className="text-xs text-slate">예정·진행</p>
            <p className="mt-1 text-lg font-bold text-forest">{upcomingExams.length}</p>
          </article>
          <article className="rounded-[20px] border border-ink/10 bg-mist p-3 text-center">
            <p className="text-xs text-slate">종료</p>
            <p className="mt-1 text-lg font-bold text-slate">{pastExams.length}</p>
          </article>
        </div>
      </section>

      {/* Filter tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {filterTabs.map((tab) => {
          const isActive = filterType === tab.value;
          const href =
            tab.value === "ALL"
              ? "/student/civil-exams"
              : `/student/civil-exams?type=${tab.value}`;
          return (
            <Link
              key={tab.value}
              href={href}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-semibold transition ${
                isActive
                  ? "border-ember/30 bg-ember text-white shadow-sm"
                  : "border-ink/10 bg-white text-slate hover:border-ember/20 hover:text-ink"
              }`}
            >
              {tab.label}
              <span
                className={`inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1 text-[10px] font-bold ${
                  isActive ? "bg-white/20 text-white" : "bg-ink/10 text-slate"
                }`}
              >
                {tab.count}
              </span>
            </Link>
          );
        })}
      </div>

      {/* Upcoming exams grouped by year */}
      {upcomingExams.length === 0 ? (
        <section className="rounded-[28px] border border-ink/10 bg-white p-8 text-center">
          <div className="text-4xl mb-4">📅</div>
          <p className="text-base font-semibold text-ink">예정된 시험이 없습니다</p>
          <p className="mt-2 text-sm text-slate">
            {filterType !== "ALL"
              ? `${EXAM_TYPE_LABEL[filterType]} 시험 일정이 아직 등록되지 않았습니다.`
              : "현재 등록된 공채 시험 일정이 없습니다. 공지사항을 확인해 주세요."}
          </p>
          <div className="mt-4 flex justify-center gap-3">
            {filterType !== "ALL" && (
              <Link
                href="/student/civil-exams"
                className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
              >
                전체 보기
              </Link>
            )}
            <Link
              href="/student/notices"
              className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
            >
              공지사항 보기
            </Link>
          </div>
        </section>
      ) : (
        upcomingYears.map((year) => (
          <section key={year} className="space-y-3">
            <div className="flex items-center gap-3 px-1">
              <span className="text-lg font-bold text-ink">{year}년</span>
              <div className="h-px flex-1 bg-ink/10" />
              <span className="text-xs font-semibold text-slate">
                {upcomingYearGroups[year]?.length ?? 0}건
              </span>
            </div>
            {upcomingYearGroups[year]?.map((exam) => (
              <ExamCard key={exam.id} exam={exam} />
            ))}
          </section>
        ))
      )}

      {/* Past exams collapsible */}
      {pastExams.length > 0 && (
        <section className="rounded-[28px] border border-ink/10 bg-white">
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between p-5 sm:p-6">
              <div className="flex items-center gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate">
                    Past Exams
                  </p>
                  <h2 className="mt-1 text-lg font-semibold">종료된 시험</h2>
                </div>
                <span className="inline-flex rounded-full border border-ink/10 bg-mist px-3 py-0.5 text-xs font-semibold text-slate">
                  {pastExams.length}건
                </span>
              </div>
              {/* Chevron rotates when open */}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="h-5 w-5 shrink-0 text-slate transition-transform group-open:rotate-180"
              >
                <path
                  fillRule="evenodd"
                  d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
                  clipRule="evenodd"
                />
              </svg>
            </summary>

            <div className="space-y-3 px-5 pb-5 sm:px-6 sm:pb-6">
              <div className="border-t border-ink/5 pt-4" />
              {pastExams.map((exam) => (
                <ExamCard key={exam.id} exam={exam} />
              ))}
            </div>
          </details>
        </section>
      )}

      {/* Footer note */}
      <section className="rounded-[24px] border border-ink/10 bg-white p-4 text-center">
        <p className="text-xs text-slate">
          시험 일정은 변경될 수 있습니다. 반드시 공식 경찰청 채용 홈페이지에서 확인하세요.
        </p>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          <a
            href="tel:053-241-0112"
            className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-xs font-semibold transition hover:border-ember/30 hover:text-ember"
          >
            문의: 053-241-0112
          </a>
          <a
            href="https://recruit.police.go.kr"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-full border border-ink/10 px-4 py-2 text-xs font-semibold transition hover:border-forest/30 hover:text-forest"
          >
            경찰청 채용 홈페이지
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3">
              <path fillRule="evenodd" d="M4.25 5.5a.75.75 0 0 0-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 0 0 .75-.75v-4a.75.75 0 0 1 1.5 0v4A2.25 2.25 0 0 1 12.75 17h-8.5A2.25 2.25 0 0 1 2 14.75v-8.5A2.25 2.25 0 0 1 4.25 4h5a.75.75 0 0 1 0 1.5h-5Z" clipRule="evenodd" />
              <path fillRule="evenodd" d="M6.194 12.753a.75.75 0 0 0 1.06.053L16.5 4.44v2.81a.75.75 0 0 0 1.5 0v-4.5a.75.75 0 0 0-.75-.75h-4.5a.75.75 0 0 0 0 1.5h2.553l-9.056 8.194a.75.75 0 0 0-.053 1.06Z" clipRule="evenodd" />
            </svg>
          </a>
        </div>
      </section>
    </main>
  );
}
