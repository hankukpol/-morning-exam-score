import Link from "next/link";
import { Subject } from "@prisma/client";
import { StudentLookupForm } from "@/components/student-portal/student-lookup-form";
import { WrongNoteManager } from "@/components/student-portal/wrong-note-manager";
import { SUBJECT_LABEL } from "@/lib/constants";
import { hasDatabaseConfig } from "@/lib/env";
import { getStudentPortalViewer, listStudentWrongNotes } from "@/lib/student-portal/service";

export const dynamic = "force-dynamic";

export default async function StudentWrongNotesPage() {
  if (!hasDatabaseConfig()) {
    return (
      <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl space-y-6">
          <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
            <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
              Wrong Notes Unavailable
            </div>
            <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
              오답 노트는 DB 연결 후 사용할 수 있습니다.
            </h1>
            <p className="mt-5 text-sm leading-8 text-slate sm:text-base">
              현재 환경에는 학생 답안과 오답 노트 데이터를 불러올 데이터베이스가
              연결되어 있지 않습니다.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/student"
                className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
              >
                학생 포털로 이동
              </Link>
            </div>
          </section>
        </div>
      </main>
    );
  }

  const student = await getStudentPortalViewer();

  if (!student) {
    return (
      <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl space-y-6">
          <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
            <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
              오답 노트
            </div>
            <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
              오답 노트
            </h1>
            <p className="mt-5 text-sm leading-8 text-slate sm:text-base">
              오답 노트는 본인 조회가 완료된 뒤에만 열 수 있습니다.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/student"
                className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
              >
                학생 포털로 이동
              </Link>
            </div>
          </section>

          <StudentLookupForm redirectPath="/student/wrong-notes" />
        </div>
      </main>
    );
  }

  const notes = await listStudentWrongNotes({
    examNumber: student.examNumber,
  });

  // 과목별 오답 수 집계
  const subjectCounts = notes.reduce<Partial<Record<Subject, number>>>((acc, note) => {
    acc[note.subject] = (acc[note.subject] ?? 0) + 1;
    return acc;
  }, {});

  const subjectSummary = Object.entries(subjectCounts)
    .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0))
    .map(([subject, count]) => ({
      subject: subject as Subject,
      count: count ?? 0,
      label: SUBJECT_LABEL[subject as Subject] ?? subject,
    }));

  // 메모가 있는 노트 수
  const notesWithMemo = notes.filter((note) => note.memo && note.memo.trim()).length;

  return (
    <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        {/* 헤더 */}
        <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
                오답 노트
              </div>
              <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
                {student.name}의 오답 노트
              </h1>
              <p className="mt-5 text-sm leading-8 text-slate sm:text-base">
                성적 조회 화면에서 저장한 오답 문항을 복습하고 메모를 남겨 취약 영역을 집중 관리하세요.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/student"
                className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
              >
                포털로 돌아가기
              </Link>
              <Link
                href="/student/scores"
                className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
              >
                성적 조회
              </Link>
            </div>
          </div>

          {/* KPI 카드 */}
          <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
              <p className="text-sm text-slate">저장한 오답</p>
              <p className="mt-3 text-xl font-semibold">{notes.length}문항</p>
            </article>
            <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
              <p className="text-sm text-slate">메모 작성 완료</p>
              <p className="mt-3 text-xl font-semibold">{notesWithMemo}문항</p>
            </article>
            <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
              <p className="text-sm text-slate">가장 많은 오답 과목</p>
              <p className="mt-3 text-xl font-semibold">
                {subjectSummary[0] ? subjectSummary[0].label : "-"}
              </p>
            </article>
            <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
              <p className="text-sm text-slate">오답이 있는 과목 수</p>
              <p className="mt-3 text-xl font-semibold">{subjectSummary.length}과목</p>
            </article>
          </div>

          {/* 과목별 오답 분포 */}
          {subjectSummary.length > 0 && (
            <div className="mt-6">
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate">
                과목별 오답 현황
              </p>
              <div className="flex flex-wrap gap-2">
                {subjectSummary.map(({ subject, count, label }) => (
                  <span
                    key={subject}
                    className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 bg-white px-3 py-1.5 text-xs font-semibold"
                  >
                    <span>{label}</span>
                    <span className="rounded-full bg-ember/10 px-1.5 py-0.5 text-ember">
                      {count}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </section>

        <StudentLookupForm
          currentStudent={{
            examNumber: student.examNumber,
            name: student.name,
            examType: student.examType,
          }}
          redirectPath="/student/wrong-notes"
        />

        <WrongNoteManager
          initialNotes={notes.map((note) => ({
            id: note.id,
            questionId: note.questionId,
            memo: note.memo,
            createdAt: note.createdAt.toISOString(),
            updatedAt: note.updatedAt.toISOString(),
            examDate: note.examDate.toISOString(),
            subject: note.subject,
            sessionId: note.sessionId,
            questionNo: note.questionNo,
            correctAnswer: note.correctAnswer,
            correctRate: note.correctRate,
            difficulty: note.difficulty,
            studentAnswer: note.studentAnswer,
          }))}
        />
      </div>
    </main>
  );
}
