import Link from "next/link";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { StudentImportForm } from "./student-import-form";

export const dynamic = "force-dynamic";

export default async function StudentImportPage() {
  await requireAdminContext(AdminRole.ACADEMIC_ADMIN);

  const prisma = getPrisma();
  const studentCount = await prisma.student.count();

  const TEMPLATE_HEADERS =
    "이름,전화번호,생년월일(YYMMDD),직렬(공채/경채),학번(선택)";

  return (
    <div className="p-8 sm:p-10">
      {/* Breadcrumb */}
      <nav className="mb-6 flex items-center gap-2 text-sm text-slate">
        <Link href="/admin" className="transition hover:text-ink">
          홈
        </Link>
        <span>/</span>
        <Link href="/admin/import-hub" className="transition hover:text-ink">
          데이터 가져오기
        </Link>
        <span>/</span>
        <span className="text-ink">학생 일괄 등록</span>
      </nav>

      {/* Header */}
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        학생 일괄 등록
      </div>
      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">학생 일괄 등록</h1>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-slate">
            CSV 파일로 학생 명단을 한 번에 등록합니다. 현재{" "}
            <strong>{studentCount.toLocaleString()}명</strong>이 등록되어
            있습니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={`data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE_HEADERS + "\n홍길동,010-1234-5678,980115,공채,\n")}`}
            download="student_import_template.csv"
            className="inline-flex items-center gap-2 rounded-full border border-ink/10 px-5 py-2.5 text-sm font-semibold transition hover:border-forest/30 hover:text-forest"
          >
            템플릿 다운로드
          </a>
          <Link
            href="/admin/import-hub"
            className="inline-flex items-center rounded-full border border-ink/10 px-5 py-2.5 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
          >
            ← 가져오기 허브
          </Link>
        </div>
      </div>

      {/* Instructions */}
      <div className="mt-6 rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
        <h2 className="text-base font-semibold">CSV 형식 안내</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold text-slate">필수 컬럼</h3>
            <ul className="mt-2 space-y-1.5 text-sm text-slate">
              <li>
                <strong className="text-ink">이름</strong> — 학생 성명
              </li>
              <li>
                <strong className="text-ink">직렬(공채/경채)</strong> —{" "}
                <code className="rounded bg-mist px-1.5 py-0.5 text-xs">
                  공채
                </code>{" "}
                또는{" "}
                <code className="rounded bg-mist px-1.5 py-0.5 text-xs">
                  경채
                </code>{" "}
                입력
              </li>
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate">선택 컬럼</h3>
            <ul className="mt-2 space-y-1.5 text-sm text-slate">
              <li>
                <strong className="text-ink">전화번호</strong> — 010-XXXX-XXXX
              </li>
              <li>
                <strong className="text-ink">생년월일(YYMMDD)</strong> — 6자리
                (예: 980115)
              </li>
              <li>
                <strong className="text-ink">학번</strong> — 비워두면 자동
                부여
              </li>
            </ul>
          </div>
        </div>
        <div className="mt-4 rounded-xl bg-mist px-4 py-3">
          <p className="text-xs font-medium text-slate">예시 CSV 내용</p>
          <code className="mt-1 block text-xs text-ink">
            {TEMPLATE_HEADERS}
            <br />
            홍길동,010-1234-5678,980115,공채,
            <br />
            김영희,010-9876-5432,001225,경채,2024001
          </code>
        </div>
      </div>

      {/* Form */}
      <div className="mt-6">
        <StudentImportForm />
      </div>
    </div>
  );
}
