import type { Metadata } from "next";
import Link from "next/link";
import { ExamType } from "@prisma/client";
import { hasDatabaseConfig } from "@/lib/env";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "공채 시험 일정",
};

const EXAM_TYPE_LABEL: Record<ExamType, string> = {
  GONGCHAE: "공채",
  GYEONGCHAE: "경채",
};

const EXAM_TYPE_BADGE: Record<ExamType, string> = {
  GONGCHAE: "border-forest/20 bg-forest/10 text-forest",
  GYEONGCHAE: "border-ember/20 bg-ember/10 text-ember",
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
    return { label: "D-Day!", pillClass: "border-ember/30 bg-ember/10 text-ember" };
  }
  if (diff <= 14) {
    return { label: `D-${diff}`, pillClass: "border-red-200 bg-red-50 text-red-700" };
  }
  if (diff <= 30) {
    return { label: `D-${diff}`, pillClass: "border-amber-200 bg-amber-50 text-amber-700" };
  }
  return { label: `D-${diff}`, pillClass: "border-forest/20 bg-forest/10 text-forest" };
}

export default async function CivilExamsPage() {
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

  // Fetch all active exams; filter out exams where both writtenDate and resultDate are in the past
  const allExams = await getPrisma().civilServiceExam.findMany({
    where: { isActive: true },
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

  // Filter: keep exam if at least one date is today or future, or if no dates set
  const exams = allExams.filter((exam) => {
    const dates = [exam.writtenDate, exam.interviewDate, exam.resultDate].filter(Boolean) as Date[];
    if (dates.length === 0) return true;
    // Keep if at least one date is not in the past
    return dates.some((d) => {
      const t = new Date(d);
      t.setHours(0, 0, 0, 0);
      return t >= today;
    });
  });

  // Group by year
  const yearGroups = exams.reduce<Record<number, typeof exams>>((acc, exam) => {
    if (!acc[exam.year]) acc[exam.year] = [];
    acc[exam.year].push(exam);
    return acc;
  }, {});
  const years = Object.keys(yearGroups)
    .map(Number)
    .sort((a, b) => b - a);

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
      </section>

      {/* Exam cards grouped by year */}
      {exams.length === 0 ? (
        <section className="rounded-[28px] border border-ink/10 bg-white p-8 text-center">
          <div className="text-4xl mb-4">📅</div>
          <p className="text-base font-semibold text-ink">예정된 시험이 없습니다</p>
          <p className="mt-2 text-sm text-slate">
            현재 등록된 공채 시험 일정이 없습니다. 공지사항을 확인해 주세요.
          </p>
          <Link
            href="/student/notices"
            className="mt-4 inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
          >
            공지사항 보기
          </Link>
        </section>
      ) : (
        years.map((year) => (
          <section key={year} className="space-y-3">
            <div className="flex items-center gap-3 px-1">
              <span className="text-lg font-bold text-ink">{year}년</span>
              <div className="h-px flex-1 bg-ink/10" />
            </div>

            {yearGroups[year]?.map((exam) => {
              const written = exam.writtenDate ? computeDDay(exam.writtenDate) : null;
              const interview = exam.interviewDate ? computeDDay(exam.interviewDate) : null;
              const result = exam.resultDate ? computeDDay(exam.resultDate) : null;

              return (
                <article
                  key={exam.id}
                  className="rounded-[24px] border border-ink/10 bg-white p-5 shadow-sm"
                >
                  {/* Title row */}
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-semibold text-ink">{exam.name}</h2>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
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
                          <span className="w-16 shrink-0 text-xs font-semibold text-slate">
                            필기시험
                          </span>
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
                          <span className="w-16 shrink-0 text-xs font-semibold text-slate">
                            면접시험
                          </span>
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
                          <span className="w-16 shrink-0 text-xs font-semibold text-slate">
                            최종발표
                          </span>
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
            })}
          </section>
        ))
      )}

      {/* Footer note */}
      <section className="rounded-[24px] border border-ink/10 bg-white p-4 text-center">
        <p className="text-xs text-slate">
          시험 일정은 변경될 수 있습니다. 반드시 공식 경찰청 채용 홈페이지에서 확인하세요.
        </p>
        <a
          href="tel:053-241-0112"
          className="mt-2 inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-xs font-semibold transition hover:border-ember/30 hover:text-ember"
        >
          문의: 053-241-0112
        </a>
      </section>
    </main>
  );
}
