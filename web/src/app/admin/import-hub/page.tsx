import Link from "next/link";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const STUDENT_TEMPLATE_HEADERS = [
  "이름",
  "전화번호",
  "생년월일(YYMMDD)",
  "직렬(공채/경채)",
  "학번(선택)",
].join(",");

const ENROLLMENT_TEMPLATE_HEADERS = [
  "학번",
  "강좌유형(종합반/특강)",
  "강좌명",
  "시작일(YYYY-MM-DD)",
  "종료일(YYYY-MM-DD)",
  "상태(ACTIVE/PENDING)",
].join(",");

const PAYMENT_TEMPLATE_HEADERS = [
  "학번",
  "결제일(YYYY-MM-DD)",
  "금액",
  "결제수단(현금/카드/이체)",
  "비고",
].join(",");

export default async function ImportHubPage() {
  await requireAdminContext(AdminRole.MANAGER);

  const prisma = getPrisma();

  const [studentCount, enrollmentCount, paymentCount] = await Promise.all([
    prisma.student.count(),
    prisma.courseEnrollment.count(),
    prisma.payment.count(),
  ]);

  const importTypes = [
    {
      key: "students",
      title: "학생 일괄 등록",
      description:
        "CSV 파일로 학생 명단을 한 번에 등록합니다. 이미 등록된 학번은 정보가 갱신됩니다.",
      icon: "👥",
      dbCount: studentCount,
      dbLabel: "등록된 학생",
      templateHeaders: STUDENT_TEMPLATE_HEADERS,
      templateFilename: "student_import_template.csv",
      importHref: "/admin/import-hub/students",
      buttonLabel: "학생 불러오기",
      accent: "border-forest/20 bg-forest/5",
      accentBtn: "bg-forest text-white hover:bg-forest/90",
    },
    {
      key: "enrollments",
      title: "수강 일괄 등록",
      description:
        "기존 에듀그램 데이터 등 수강 등록 내역을 CSV로 가져옵니다.",
      icon: "📋",
      dbCount: enrollmentCount,
      dbLabel: "수강 등록 건수",
      templateHeaders: ENROLLMENT_TEMPLATE_HEADERS,
      templateFilename: "enrollment_import_template.csv",
      importHref: "/admin/import-hub/enrollments",
      buttonLabel: "수강 내역 불러오기",
      accent: "border-amber-200 bg-amber-50",
      accentBtn: "bg-amber-600 text-white hover:bg-amber-700",
    },
    {
      key: "payments",
      title: "수납 내역 가져오기",
      description:
        "과거 수납 내역을 CSV로 마이그레이션합니다. 학번이 반드시 필요합니다.",
      icon: "💳",
      dbCount: paymentCount,
      dbLabel: "수납 건수",
      templateHeaders: PAYMENT_TEMPLATE_HEADERS,
      templateFilename: "payment_import_template.csv",
      importHref: "/admin/import-hub/payments",
      buttonLabel: "수납 내역 불러오기",
      accent: "border-ember/20 bg-ember/5",
      accentBtn: "bg-ember text-white hover:bg-ember/90",
    },
  ];

  return (
    <div className="p-8 sm:p-10">
      {/* Breadcrumb */}
      <nav className="mb-6 flex items-center gap-2 text-sm text-slate">
        <Link href="/admin" className="transition hover:text-ink">
          홈
        </Link>
        <span>/</span>
        <span className="text-ink">데이터 가져오기</span>
      </nav>

      {/* Header */}
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        데이터 마이그레이션
      </div>
      <div className="mt-5">
        <h1 className="text-3xl font-semibold">일괄 데이터 가져오기</h1>
        <p className="mt-2 max-w-2xl text-sm leading-7 text-slate">
          에듀그램 등 기존 관리 프로그램에서 내보낸 CSV 파일을 사용해 학생,
          수강, 수납 데이터를 일괄 등록합니다. 각 항목의 템플릿 파일을
          다운로드하여 형식을 맞춰 주세요.
        </p>
      </div>

      {/* Notice */}
      <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
        <p className="text-sm font-semibold text-amber-800">
          마이그레이션 주의사항
        </p>
        <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-amber-700">
          <li>가져오기 전에 반드시 원본 데이터를 백업하세요.</li>
          <li>
            학생 등록 시 학번이 없으면 시스템이 자동 부여합니다 (선택 사항).
          </li>
          <li>수강·수납 등록 시 학번이 반드시 존재해야 합니다.</li>
          <li>성적 데이터는 새로 시작하며 마이그레이션 대상이 아닙니다.</li>
        </ul>
      </div>

      {/* Cards */}
      <div className="mt-8 grid gap-6 md:grid-cols-3">
        {importTypes.map((item) => (
          <div
            key={item.key}
            className={`rounded-[28px] border p-6 ${item.accent}`}
          >
            <div className="text-3xl">{item.icon}</div>
            <h2 className="mt-3 text-lg font-semibold">{item.title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate">
              {item.description}
            </p>

            {/* DB count */}
            <div className="mt-4 flex items-center gap-2">
              <span className="text-2xl font-semibold text-ink">
                {item.dbCount.toLocaleString()}
              </span>
              <span className="text-xs text-slate">{item.dbLabel}</span>
            </div>

            {/* Actions */}
            <div className="mt-5 flex flex-col gap-2">
              {/* Template download — uses data: URI via anchor tag with download attribute */}
              <a
                href={`data:text/csv;charset=utf-8,${encodeURIComponent(item.templateHeaders + "\n")}`}
                download={item.templateFilename}
                className="inline-flex items-center justify-center gap-1.5 rounded-full border border-ink/10 bg-white px-4 py-2.5 text-sm font-semibold text-ink transition hover:border-forest/30 hover:text-forest"
              >
                템플릿 다운로드 (CSV)
              </a>
              <Link
                href={item.importHref}
                className={`inline-flex items-center justify-center rounded-full px-4 py-2.5 text-sm font-semibold transition ${item.accentBtn}`}
              >
                {item.buttonLabel}
              </Link>
            </div>
          </div>
        ))}
      </div>

      {/* Quick tips */}
      <div className="mt-8 rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
        <h2 className="text-base font-semibold">CSV 파일 작성 가이드</h2>
        <div className="mt-4 grid gap-6 md:grid-cols-3">
          <div>
            <h3 className="text-sm font-semibold text-forest">학생 등록</h3>
            <p className="mt-2 text-xs leading-5 text-slate">
              첫 줄은 헤더 행입니다. 이름과 직렬(공채/경채)은 필수입니다.
              전화번호는 010-XXXX-XXXX 형식을 권장합니다. 생년월일은
              YYMMDD 6자리 (예: 980115).
            </p>
            <code className="mt-2 block rounded-xl bg-mist px-3 py-2 text-[11px] text-ink">
              {STUDENT_TEMPLATE_HEADERS}
            </code>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-amber-700">수강 등록</h3>
            <p className="mt-2 text-xs leading-5 text-slate">
              학번은 이미 등록된 학생이어야 합니다. 강좌유형은 종합반 또는
              특강. 날짜는 YYYY-MM-DD 형식.
            </p>
            <code className="mt-2 block rounded-xl bg-mist px-3 py-2 text-[11px] text-ink">
              {ENROLLMENT_TEMPLATE_HEADERS}
            </code>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-ember">수납 내역</h3>
            <p className="mt-2 text-xs leading-5 text-slate">
              학번과 결제일, 금액은 필수입니다. 금액은 숫자만 입력 (원 단위).
              결제수단은 현금, 카드, 이체 중 하나.
            </p>
            <code className="mt-2 block rounded-xl bg-mist px-3 py-2 text-[11px] text-ink">
              {PAYMENT_TEMPLATE_HEADERS}
            </code>
          </div>
        </div>
      </div>
    </div>
  );
}
