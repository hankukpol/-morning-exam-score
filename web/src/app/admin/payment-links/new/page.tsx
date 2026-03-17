import { AdminRole } from "@prisma/client";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { PaymentLinkForm } from "./payment-link-form";

export const dynamic = "force-dynamic";

export default async function NewPaymentLinkPage() {
  await requireAdminContext(AdminRole.COUNSELOR);

  const rawCourses = await getPrisma().course.findMany({
    where: { isActive: true },
    select: { id: true, name: true, tuitionFee: true },
    orderBy: { name: "asc" },
  });

  const courses = rawCourses.map((c) => ({
    id: c.id,
    name: c.name,
    tuitionFee: c.tuitionFee ?? 0,
  }));

  return (
    <div className="p-8 sm:p-10">
      {/* Breadcrumb */}
      <nav className="mb-6 flex items-center gap-2 text-sm text-slate">
        <Link href="/admin/payments/links" className="transition hover:text-ember">
          결제 링크
        </Link>
        <span>/</span>
        <span className="text-ink">신규 생성</span>
      </nav>

      <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        수납 관리
      </div>
      <h1 className="mt-5 text-3xl font-semibold">결제 링크 생성</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        학생에게 전송할 온라인 결제 링크를 생성합니다. 학생이 링크를 통해 결제하면 자동으로
        수납이 등록됩니다.
      </p>

      <div className="mt-8 max-w-2xl">
        <PaymentLinkForm courses={courses} />
      </div>
    </div>
  );
}
