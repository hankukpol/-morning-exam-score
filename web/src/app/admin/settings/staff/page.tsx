import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { StaffManager } from "./staff-manager";

export const dynamic = "force-dynamic";

export type StaffRow = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: AdminRole;
  isActive: boolean;
  createdAt: string;
};

export default async function StaffPage() {
  await requireAdminContext(AdminRole.MANAGER);

  const staff = await getPrisma().adminUser.findMany({
    select: { id: true, name: true, email: true, phone: true, role: true, isActive: true, createdAt: true },
    orderBy: [{ role: "desc" }, { name: "asc" }],
  });

  const rows: StaffRow[] = staff.map((s) => ({
    ...s,
    createdAt: s.createdAt.toISOString(),
  }));

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-ink/10 bg-mist px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ink">
        설정
      </div>
      <h1 className="mt-5 text-3xl font-semibold">직원 관리</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        직원 계정의 이름, 연락처, 권한 역할을 관리합니다. 계정 생성은 Supabase Auth에서 먼저
        진행 후 UUID를 등록해야 합니다.
      </p>
      <div className="mt-8">
        <StaffManager initialStaff={rows} />
      </div>
    </div>
  );
}
