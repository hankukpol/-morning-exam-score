import { AdminRole } from "@prisma/client";
import { notFound } from "next/navigation";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { DiscountCodeEditForm } from "./discount-code-edit-form";

export const dynamic = "force-dynamic";

export default async function DiscountCodeEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdminContext(AdminRole.MANAGER);

  const { id: rawId } = await params;
  const id = Number(rawId);
  if (isNaN(id)) notFound();

  const code = await getPrisma().discountCode.findUnique({
    where: { id },
    select: {
      id: true,
      code: true,
      type: true,
      discountType: true,
      discountValue: true,
      maxUsage: true,
      validFrom: true,
      validUntil: true,
      isActive: true,
      usageCount: true,
    },
  });

  if (!code) notFound();

  return (
    <div className="p-8 sm:p-10">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate">
        <Link href="/admin/settings/discount-codes" className="transition hover:text-ember">
          할인 코드 관리
        </Link>
        <span>/</span>
        <Link
          href={`/admin/settings/discount-codes/${code.id}`}
          className="font-mono transition hover:text-ember"
        >
          {code.code}
        </Link>
        <span>/</span>
        <span className="font-semibold text-ink">수정</span>
      </div>

      <div className="mt-6">
        <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
          할인코드 수정
        </div>
        <h1 className="mt-3 font-mono text-3xl font-semibold">{code.code} 수정</h1>
        <p className="mt-2 text-sm text-slate">
          할인 코드의 정보를 수정합니다.
        </p>
      </div>

      <DiscountCodeEditForm
        discountCode={{
          id: code.id,
          code: code.code,
          type: code.type,
          discountType: code.discountType,
          discountValue: code.discountValue,
          maxUsage: code.maxUsage,
          validFrom: code.validFrom.toISOString(),
          validUntil: code.validUntil?.toISOString() ?? null,
          isActive: code.isActive,
          usageCount: code.usageCount,
        }}
      />
    </div>
  );
}
