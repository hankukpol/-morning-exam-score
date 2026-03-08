import Link from "next/link";
import { StudentLookupForm } from "@/components/student-portal/student-lookup-form";
import { WrongNoteManager } from "@/components/student-portal/wrong-note-manager";
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
              F-15-D Wrong Notes
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

  return (
    <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
                F-15-D Wrong Notes
              </div>
              <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
                {student.name}의 오답 노트
              </h1>
              <p className="mt-5 text-sm leading-8 text-slate sm:text-base">
                저장한 오답을 다시 보며 메모를 남기고, 복습 완료 후 정리할 수 있습니다.
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
                href={`/student/notices?examType=${student.examType}`}
                className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
              >
                공지사항
              </Link>
            </div>
          </div>
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
