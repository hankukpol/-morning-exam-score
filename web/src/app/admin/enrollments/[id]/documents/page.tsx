import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

// ─── Document card definition ─────────────────────────────────────────────────

type DocCard = {
  key: string;
  title: string;
  titleKo: string;
  description: string;
  href: string;
  icon: string; // emoji/unicode icon
  badgeLabel?: string;
  badgeColor?: "green" | "amber" | "slate";
  isAvailable: boolean;
};

// ─── Page ─────────────────────────────────────────────────────────────────────

type PageProps = { params: Promise<{ id: string }> };

export default async function EnrollmentDocumentsPage({ params }: PageProps) {
  const { id } = await params;
  await requireAdminContext(AdminRole.COUNSELOR);

  const prisma = getPrisma();

  const [enrollment, contract] = await Promise.all([
    prisma.courseEnrollment.findUnique({
      where: { id },
      include: {
        student: { select: { name: true, phone: true } },
        cohort: { select: { name: true } },
        product: { select: { name: true } },
        specialLecture: { select: { name: true } },
      },
    }),
    prisma.courseContract.findUnique({
      where: { enrollmentId: id },
      select: { printedAt: true, issuedAt: true },
    }),
  ]);

  if (!enrollment) notFound();

  const courseName =
    enrollment.cohort?.name ??
    enrollment.product?.name ??
    enrollment.specialLecture?.name ??
    "수강 상세";

  const studentName = enrollment.student.name;

  // ── Build document card list ──────────────────────────────────────────────

  const contractBadge: { label: string; color: "green" | "amber" | "slate" } =
    contract === null
      ? { label: "미발행", color: "amber" }
      : contract.printedAt
        ? {
            label: `출력 완료 · ${formatDate(contract.printedAt.toISOString())}`,
            color: "green",
          }
        : { label: "미출력", color: "amber" };

  const docs: DocCard[] = [
    {
      key: "card",
      title: "수강증",
      titleKo: "ENROLLMENT CARD",
      description: "학생 수강 ID 카드. QR코드 포함, 명함 크기 인쇄 지원.",
      href: `/admin/enrollments/${id}/card`,
      icon: "🪪",
      isAvailable: true,
    },
    {
      key: "confirmation",
      title: "수강확인서",
      titleKo: "ENROLLMENT CONFIRMATION",
      description: "수강 사실을 확인하는 공문 형식의 문서. A4 인쇄 지원.",
      href: `/admin/enrollments/${id}/confirmation`,
      icon: "📋",
      isAvailable: true,
    },
    {
      key: "certificate",
      title: "수강등록확인서",
      titleKo: "ENROLLMENT CERTIFICATE",
      description: "수강 등록 및 수납 내역을 포함한 공식 확인서. A4 인쇄 지원.",
      href: `/admin/enrollments/${id}/certificate`,
      icon: "📜",
      isAvailable: true,
    },
    {
      key: "contract",
      title: "수강계약서",
      titleKo: "ENROLLMENT CONTRACT",
      description: "학원법 제14조에 따른 수강 계약서. B5 인쇄 지원. 특약사항 편집 가능.",
      href: `/admin/enrollments/${id}/contract`,
      icon: "📝",
      badgeLabel: contractBadge.label,
      badgeColor: contractBadge.color,
      isAvailable: true,
    },
    {
      key: "textbooks",
      title: "교재 목록",
      titleKo: "TEXTBOOK LIST",
      description: "수강 중 사용하는 교재 목록 및 수령 현황 확인.",
      href: `/admin/enrollments/${id}/textbooks`,
      icon: "📚",
      isAvailable: true,
    },
    {
      key: "tax-certificate",
      title: "교육비 납입증명서",
      titleKo: "EDUCATION FEE TAX CERTIFICATE",
      description: "연말정산 소득공제용 교육비 납입증명서. 과세연도별 발급 지원. A4 인쇄.",
      href: `/admin/enrollments/${id}/tax-certificate`,
      icon: "🧾",
      isAvailable: true,
    },
  ];

  return (
    <div className="p-8 sm:p-10">
      <Breadcrumbs
        items={[
          { label: "수강 관리", href: "/admin/enrollments" },
          { label: "수강 목록", href: "/admin/enrollments" },
          {
            label: `${studentName} - ${courseName}`,
            href: `/admin/enrollments/${id}`,
          },
          { label: "서류 발급" },
        ]}
      />

      {/* Page header */}
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        수강 관리
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <h1 className="text-3xl font-semibold">서류 발급</h1>
        <Link
          href={`/admin/enrollments/${id}`}
          className="text-sm text-slate transition hover:text-ember"
        >
          ← 수강 상세
        </Link>
      </div>

      {/* Student / course summary */}
      <div className="mt-6 rounded-[20px] border border-ink/10 bg-white px-6 py-4">
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <p className="text-xs font-medium text-slate">수강생</p>
            <Link
              href={`/admin/students/${enrollment.examNumber}?tab=enrollments`}
              className="mt-0.5 block font-semibold text-ink transition hover:text-ember"
            >
              {studentName}
              <span className="ml-2 text-xs font-normal text-slate">
                ({enrollment.examNumber})
              </span>
            </Link>
          </div>
          <div className="h-8 w-px bg-ink/10" />
          <div>
            <p className="text-xs font-medium text-slate">수강 강좌</p>
            <p className="mt-0.5 font-semibold text-ink">{courseName}</p>
          </div>
          <div className="h-8 w-px bg-ink/10" />
          <div>
            <p className="text-xs font-medium text-slate">수강 기간</p>
            <p className="mt-0.5 text-sm text-ink">
              {formatDate(enrollment.startDate.toISOString())}
              {enrollment.endDate
                ? ` ~ ${formatDate(enrollment.endDate.toISOString())}`
                : " ~ (미정)"}
            </p>
          </div>
        </div>
      </div>

      {/* Document cards grid */}
      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {docs.map((doc) => (
          <DocumentCard key={doc.key} doc={doc} />
        ))}
      </div>

      {/* Helper note */}
      <p className="mt-8 text-xs text-slate/60">
        각 문서를 클릭하면 인쇄 미리보기 페이지로 이동합니다. 브라우저 인쇄 기능으로 PDF 저장도 가능합니다.
      </p>
    </div>
  );
}

// ─── Document Card component ──────────────────────────────────────────────────

const BADGE_STYLES: Record<"green" | "amber" | "slate", string> = {
  green: "bg-forest/10 text-forest border-forest/20",
  amber: "bg-amber-50 text-amber-700 border-amber-200",
  slate: "bg-mist text-slate border-ink/10",
};

function DocumentCard({ doc }: { doc: DocCard }) {
  return (
    <Link
      href={doc.href}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex flex-col rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel transition hover:border-ember/30 hover:shadow-lg"
    >
      {/* Icon */}
      <div className="flex items-start justify-between">
        <span className="text-3xl" aria-hidden="true">
          {doc.icon}
        </span>
        {doc.badgeLabel && doc.badgeColor && (
          <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${BADGE_STYLES[doc.badgeColor]}`}
          >
            {doc.badgeLabel}
          </span>
        )}
      </div>

      {/* Title */}
      <div className="mt-4">
        <p className="text-lg font-semibold text-ink transition group-hover:text-ember">
          {doc.title}
        </p>
        <p className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.18em] text-slate/60">
          {doc.titleKo}
        </p>
      </div>

      {/* Description */}
      <p className="mt-3 flex-1 text-sm leading-relaxed text-slate">
        {doc.description}
      </p>

      {/* CTA */}
      <div className="mt-5 flex items-center gap-1.5 text-sm font-semibold text-ember">
        <span>새 탭에서 열기</span>
        <span className="transition group-hover:translate-x-1">→</span>
      </div>
    </Link>
  );
}
