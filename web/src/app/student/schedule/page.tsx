import type { Metadata } from "next";
import Link from "next/link";
import { StudentLookupForm } from "@/components/student-portal/student-lookup-form";
import { SUBJECT_LABEL } from "@/lib/constants";
import { hasDatabaseConfig } from "@/lib/env";
import { formatDateWithWeekday } from "@/lib/format";
import { getPrisma } from "@/lib/prisma";
import { getStudentPortalViewer } from "@/lib/student-portal/service";
import { ScheduleClient } from "./schedule-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "강의 시간표",
};

export default async function StudentSchedulePage() {
  if (!hasDatabaseConfig()) {
    return (
      <main className="space-y-6 px-0 py-6">
        <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
          <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
            Student Schedule Unavailable
          </div>
          <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
            시간표는 DB 연결 후 사용할 수 있습니다.
          </h1>
          <p className="mt-5 text-sm leading-8 text-slate sm:text-base">
            현재 환경에는 강의 일정 데이터를 불러올 데이터베이스가 연결되어 있지 않습니다.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/student"
              className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
            >
              학생 포털로 돌아가기
            </Link>
          </div>
        </section>
      </main>
    );
  }

  const viewer = await getStudentPortalViewer();

  if (!viewer) {
    return (
      <main className="space-y-6 px-0 py-6">
        <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
          <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
            Student Schedule Login
          </div>
          <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
            시간표는 로그인 후 확인할 수 있습니다.
          </h1>
          <p className="mt-5 text-sm leading-8 text-slate sm:text-base">
            학생 포털에 로그인하면 배정된 기수의 강의 일정을 확인할 수 있습니다.
          </p>
        </section>

        <StudentLookupForm redirectPath="/student/schedule" />
      </main>
    );
  }

  const now = new Date();

  // Find the student's active course enrollment and its cohort; also fetch upcoming exam sessions
  const [activeEnrollment, upcomingExams] = await Promise.all([
    getPrisma().courseEnrollment.findFirst({
      where: {
        examNumber: viewer.examNumber,
        status: "ACTIVE",
        cohortId: { not: null },
      },
      orderBy: { createdAt: "desc" },
      select: {
        cohortId: true,
        cohort: {
          select: {
            id: true,
            name: true,
            endDate: true,
            lectureSchedules: {
              where: { isActive: true },
              select: {
                id: true,
                subjectName: true,
                instructorName: true,
                dayOfWeek: true,
                startTime: true,
                endTime: true,
                isActive: true,
              },
              orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
            },
          },
        },
      },
    }),
    getPrisma().examSession.findMany({
      where: {
        examType: viewer.examType,
        isCancelled: false,
        examDate: { gte: now },
      },
      orderBy: { examDate: "asc" },
      take: 5,
      select: {
        id: true,
        examDate: true,
        subject: true,
        week: true,
        period: {
          select: { name: true },
        },
      },
    }),
  ]);

  const schedules = activeEnrollment?.cohort?.lectureSchedules ?? [];
  const cohortName = activeEnrollment?.cohort?.name ?? null;
  const cohortEndDate = activeEnrollment?.cohort?.endDate ?? null;

  // Group upcoming exams by date
  const examDateMap = new Map<string, { examDate: Date; subjects: string[]; week: number | null; periodName: string | null }>();
  for (const exam of upcomingExams) {
    const dateKey = exam.examDate.toISOString().slice(0, 10);
    const entry = examDateMap.get(dateKey);
    if (entry) {
      entry.subjects.push(SUBJECT_LABEL[exam.subject] ?? exam.subject);
    } else {
      examDateMap.set(dateKey, {
        examDate: exam.examDate,
        subjects: [SUBJECT_LABEL[exam.subject] ?? exam.subject],
        week: exam.week,
        periodName: exam.period?.name ?? null,
      });
    }
  }
  const upcomingExamDates = Array.from(examDateMap.values());

  // Countdown to next exam (in days, rounded down)
  const nextExamDate = upcomingExamDates[0]?.examDate ?? null;
  const daysUntilNextExam = nextExamDate
    ? Math.max(0, Math.floor((nextExamDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
    : null;

  return (
    <main className="space-y-6 px-0 py-6">
      {/* Header */}
      <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
              Student Schedule
            </div>
            <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
              {viewer.name}의 강의 시간표
            </h1>
            <p className="mt-5 text-sm leading-8 text-slate sm:text-base">
              현재 수강 중인 기수의 요일별 강의 일정을 확인할 수 있습니다.
            </p>
            {cohortName && (
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold text-forest">
                  {cohortName}
                </span>
                {cohortEndDate && (
                  <span className="inline-flex rounded-full border border-ink/10 bg-mist px-3 py-1 text-xs font-semibold text-slate">
                    종료: {formatDateWithWeekday(cohortEndDate)}
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/student"
              className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
            >
              포털로 돌아가기
            </Link>
          </div>
        </div>
      </section>

      {/* Upcoming exam dates */}
      <section className="rounded-[28px] border border-ember/20 bg-white p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-ink">예정된 시험 일정</h2>
          {daysUntilNextExam !== null && (
            <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${
              daysUntilNextExam === 0
                ? "border-red-200 bg-red-50 text-red-700"
                : daysUntilNextExam <= 3
                ? "border-ember/30 bg-ember/10 text-ember"
                : "border-forest/20 bg-forest/10 text-forest"
            }`}>
              {daysUntilNextExam === 0 ? "오늘 시험" : `다음 시험까지 ${daysUntilNextExam}일`}
            </span>
          )}
        </div>
        {upcomingExamDates.length === 0 ? (
          <div className="rounded-[20px] border border-dashed border-ink/10 px-5 py-8 text-center">
            <p className="text-sm font-semibold text-ink">예정된 시험이 없습니다</p>
            <p className="mt-1.5 text-xs text-slate">
              앞으로 예정된 시험 일정이 아직 등록되지 않았습니다.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {upcomingExamDates.map((item, idx) => {
              const dateKey = item.examDate.toISOString().slice(0, 10);
              const isNext = idx === 0;
              return (
                <div
                  key={dateKey}
                  className={`flex flex-wrap items-center gap-3 rounded-[20px] border px-4 py-3 ${
                    isNext
                      ? "border-ember/30 bg-ember/5"
                      : "border-ink/10 bg-mist/40"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {isNext && (
                      <span className="inline-flex h-5 items-center rounded-full bg-ember px-2 text-[10px] font-bold text-white">
                        NEXT
                      </span>
                    )}
                    <span className={`text-sm font-semibold ${isNext ? "text-ember" : "text-ink"}`}>
                      {formatDateWithWeekday(item.examDate)}
                    </span>
                  </div>
                  {item.week !== null && (
                    <span className="inline-flex rounded-full border border-ink/10 bg-white px-2.5 py-0.5 text-xs font-semibold text-slate">
                      {item.week}주차
                    </span>
                  )}
                  {item.periodName && (
                    <span className="inline-flex rounded-full border border-forest/20 bg-forest/5 px-2.5 py-0.5 text-xs font-semibold text-forest">
                      {item.periodName}
                    </span>
                  )}
                  <div className="flex flex-wrap gap-1.5 ml-auto">
                    {item.subjects.map((sub) => (
                      <span
                        key={sub}
                        className="inline-flex rounded-full border border-ink/10 bg-white px-2.5 py-0.5 text-xs text-slate"
                      >
                        {sub}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {cohortEndDate && (
          <p className="mt-3 text-xs text-slate">
            기수 종료일: {formatDateWithWeekday(cohortEndDate)}
          </p>
        )}
      </section>

      {/* Schedule content */}
      <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
        {activeEnrollment === null ? (
          <div className="rounded-[24px] border border-dashed border-ink/10 px-5 py-8 text-center">
            <p className="text-base font-semibold text-ink">현재 수강 중인 기수가 없습니다</p>
            <p className="mt-2 text-sm text-slate">
              활성 수강 등록이 있어야 시간표를 조회할 수 있습니다.
            </p>
            <a
              href="tel:053-241-0112"
              className="mt-4 inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
            >
              문의: 053-241-0112
            </a>
          </div>
        ) : (
          <ScheduleClient schedules={schedules} cohortName={cohortName} />
        )}
      </section>
    </main>
  );
}
