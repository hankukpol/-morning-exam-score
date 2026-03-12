import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/constants";
import { getSetupState } from "@/lib/env";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AdminAccountsPage() {
  await requireAdminContext(AdminRole.SUPER_ADMIN);
  const setup = getSetupState();
  const admins = await getPrisma().adminUser.findMany({
    orderBy: [{ role: "desc" }, { createdAt: "asc" }],
  });

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        SUPER ADMIN ONLY
      </div>
      <h1 className="mt-5 text-3xl font-semibold">관리자 계정 베이스</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        Phase 1에서는 Supabase Auth의 사용자 UUID와 Prisma `admin_users` 레코드를 연결하는 구조를
        먼저 고정합니다. 초대 자동화는 Service Role 키가 준비되면 이어서 붙일 수 있습니다.
      </p>

      <div className="mt-8 rounded-[28px] border border-ink/10 bg-mist p-6">
        <h2 className="text-lg font-semibold">운영 메모</h2>
        <div className="mt-4 space-y-3 text-sm leading-7 text-slate">
          <p>1. Supabase Auth에서 관리자 계정을 먼저 생성합니다.</p>
          <p>2. 생성된 user UUID를 `admin_users.id`에 그대로 넣습니다.</p>
          <p>3. 권한은 `SUPER_ADMIN`, `TEACHER`, `VIEWER` 중 하나로 설정합니다.</p>
          <p>
            4. Service Role 키 상태:{" "}
            <span className="font-semibold text-ink">
              {setup.serviceRoleReady ? "준비됨" : "미설정"}
            </span>
          </p>
        </div>
      </div>

      <div className="mt-8 overflow-hidden rounded-[28px] border border-ink/10">
        <table className="min-w-full divide-y divide-ink/10 text-sm">
          <thead className="bg-ink text-left text-white">
            <tr>
              <th className="px-5 py-4 font-semibold">이름</th>
              <th className="px-5 py-4 font-semibold">이메일</th>
              <th className="px-5 py-4 font-semibold">역할</th>
              <th className="px-5 py-4 font-semibold">상태</th>
              <th className="px-5 py-4 font-semibold">생성일</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/10 bg-white">
            {admins.map((admin) => (
              <tr key={admin.id}>
                <td className="px-5 py-4 font-medium">{admin.name}</td>
                <td className="px-5 py-4 text-slate">{admin.email}</td>
                <td className="px-5 py-4">{ROLE_LABEL[admin.role]}</td>
                <td className="px-5 py-4">
                  {admin.isActive ? (
                    <span className="rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold text-forest">
                      활성
                    </span>
                  ) : (
                    <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">
                      비활성
                    </span>
                  )}
                </td>
                <td className="px-5 py-4 text-slate">
                  {admin.createdAt.toLocaleDateString("ko-KR")}
                </td>
              </tr>
            ))}
            {admins.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-slate">
                  등록된 관리자 계정이 없습니다.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
