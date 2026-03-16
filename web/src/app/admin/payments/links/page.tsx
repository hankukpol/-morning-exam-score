import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { PaymentLinkManager } from "@/components/payments/payment-link-manager";

export const dynamic = "force-dynamic";

export type PaymentLinkRow = {
  id: number;
  token: string;
  title: string;
  courseId: number | null;
  amount: number;
  discountAmount: number;
  finalAmount: number;
  allowPoint: boolean;
  expiresAt: string;
  maxUsage: number | null;
  usageCount: number;
  status: "ACTIVE" | "EXPIRED" | "DISABLED" | "USED_UP";
  note: string | null;
  createdBy: string;
  createdAt: string;
  staff: { name: string };
  course: { name: string } | null;
  _count: { payments: number };
};

export type CourseOption = {
  id: number;
  name: string;
  tuitionFee: number;
};

export default async function PaymentLinksPage() {
  await requireAdminContext(AdminRole.COUNSELOR);

  const [rawLinks, rawCourses] = await getPrisma().$transaction([
    getPrisma().paymentLink.findMany({
      include: {
        staff: { select: { name: true } },
        course: { select: { name: true } },
        _count: { select: { payments: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    getPrisma().course.findMany({
      where: { isActive: true },
      select: { id: true, name: true, tuitionFee: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const links: PaymentLinkRow[] = rawLinks.map((l) => ({
    ...l,
    expiresAt: l.expiresAt.toISOString(),
    createdAt: l.createdAt.toISOString(),
  }));

  const courses: CourseOption[] = rawCourses;

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        수납 관리
      </div>
      <h1 className="mt-5 text-3xl font-semibold">결제 링크 관리</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        온라인 결제 링크를 생성하여 카카오톡·문자로 학생에게 전송합니다. 학생이 링크를 통해
        결제하면 자동으로 수납이 등록됩니다.
      </p>
      <div className="mt-8">
        <PaymentLinkManager initialLinks={links} courses={courses} />
      </div>
    </div>
  );
}
