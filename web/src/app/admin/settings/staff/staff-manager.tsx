"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AdminRole } from "@prisma/client";
import { ActionModal } from "@/components/ui/action-modal";
import type { StaffRow } from "./page";

const ROLE_LABEL: Record<AdminRole, string> = {
  SUPER_ADMIN: "최고 관리자",
  DIRECTOR: "원장",
  DEPUTY_DIRECTOR: "부원장",
  MANAGER: "실장",
  ACADEMIC_ADMIN: "교무주임",
  COUNSELOR: "상담원",
  TEACHER: "강사",
  VIEWER: "조회자",
};

const ROLE_COLOR: Record<AdminRole, string> = {
  SUPER_ADMIN: "bg-red-50 text-red-700 border-red-200",
  DIRECTOR: "bg-amber-50 text-amber-700 border-amber-200",
  DEPUTY_DIRECTOR: "bg-amber-50 text-amber-600 border-amber-200",
  MANAGER: "bg-amber-50 text-amber-700 border-amber-200",
  ACADEMIC_ADMIN: "bg-forest/10 text-forest border-forest/20",
  COUNSELOR: "bg-sky-50 text-sky-700 border-sky-200",
  TEACHER: "bg-violet-50 text-violet-700 border-violet-200",
  VIEWER: "bg-ink/5 text-slate border-ink/10",
};

const ROLES: AdminRole[] = [
  AdminRole.SUPER_ADMIN,
  AdminRole.DIRECTOR,
  AdminRole.DEPUTY_DIRECTOR,
  AdminRole.MANAGER,
  AdminRole.ACADEMIC_ADMIN,
  AdminRole.COUNSELOR,
  AdminRole.TEACHER,
  AdminRole.VIEWER,
];

interface StaffForm {
  name: string;
  email: string;
  phone: string;
  role: AdminRole;
  isActive: boolean;
}

const EMPTY_FORM: StaffForm = {
  name: "",
  email: "",
  phone: "",
  role: AdminRole.VIEWER,
  isActive: true,
};

interface Props {
  initialStaff: StaffRow[];
}

export function StaffManager({ initialStaff }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [editTarget, setEditTarget] = useState<StaffRow | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<StaffRow | null>(null);
  const [form, setForm] = useState<StaffForm>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);

  const displayed = showInactive ? initialStaff : initialStaff.filter((s) => s.isActive);

  function openEdit(s: StaffRow) {
    setForm({ name: s.name, email: s.email, phone: s.phone ?? "", role: s.role, isActive: s.isActive });
    setError(null);
    setEditTarget(s);
  }

  function handleEdit() {
    if (!editTarget || !form.name.trim() || !form.email.trim()) {
      setError("이름과 이메일을 입력하세요."); return;
    }
    startTransition(async () => {
      try {
        const res = await fetch(`/api/admin-users/${editTarget.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: form.name.trim(),
            phone: form.phone.trim() || null,
            role: form.role,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "수정 실패");
        setEditTarget(null);
        router.refresh();
      } catch (e) { setError(e instanceof Error ? e.message : "수정 실패"); }
    });
  }

  function handleToggleActive() {
    if (!deactivateTarget) return;
    startTransition(async () => {
      try {
        const res = await fetch(`/api/admin-users/${deactivateTarget.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isActive: !deactivateTarget.isActive }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "처리 실패");
        setDeactivateTarget(null);
        router.refresh();
      } catch (e) { setError(e instanceof Error ? e.message : "처리 실패"); }
    });
  }

  return (
    <div>
      {/* Controls */}
      <div className="flex items-center justify-between mb-4">
        <label className="flex items-center gap-2 text-sm text-slate cursor-pointer">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="rounded border-ink/20"
          />
          비활성 계정 포함
        </label>
        <p className="text-xs text-slate">총 {displayed.length}명</p>
      </div>

      {/* Table */}
      <div className="rounded-[20px] border border-ink/10 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-mist border-b border-ink/10">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate">이름</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate">이메일</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate">연락처</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-slate">권한</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-slate">상태</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/5">
            {displayed.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-slate text-sm">
                  직원이 없습니다.
                </td>
              </tr>
            ) : (
              displayed.map((s) => (
                <tr key={s.id} className={`hover:bg-mist/40 ${!s.isActive ? "opacity-50" : ""}`}>
                  <td className="px-4 py-3 font-medium">{s.name}</td>
                  <td className="px-4 py-3 text-slate text-xs">{s.email}</td>
                  <td className="px-4 py-3 text-slate">{s.phone ?? "-"}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${ROLE_COLOR[s.role] ?? ""}`}>
                      {ROLE_LABEL[s.role]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${s.isActive ? "bg-forest/10 text-forest border-forest/20" : "bg-ink/5 text-slate border-ink/10"}`}>
                      {s.isActive ? "활성" : "비활성"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-3">
                      <button onClick={() => openEdit(s)} className="text-xs text-slate hover:text-ink">수정</button>
                      <button
                        onClick={() => { setError(null); setDeactivateTarget(s); }}
                        className={`text-xs ${s.isActive ? "text-red-400 hover:text-red-600" : "text-forest hover:text-forest/70"}`}
                      >
                        {s.isActive ? "비활성화" : "활성화"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Edit Modal */}
      <ActionModal
        open={!!editTarget}
        badgeLabel="직원 관리"
        title="직원 정보 수정"
        description={`"${editTarget?.name}" 계정 정보를 수정합니다.`}
        confirmLabel="저장"
        cancelLabel="취소"
        isPending={isPending}
        onClose={() => setEditTarget(null)}
        onConfirm={handleEdit}
        panelClassName="max-w-md"
      >
        <div className="space-y-3 pt-2">
          {error && <p className="rounded-[12px] bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate">이름 *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full rounded-[12px] border border-ink/20 px-4 py-2.5 text-sm outline-none focus:border-forest"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate">이메일 (변경 불가)</label>
            <input
              type="email"
              value={form.email}
              disabled
              className="w-full rounded-[12px] border border-ink/10 bg-mist px-4 py-2.5 text-sm text-slate outline-none cursor-not-allowed"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate">연락처</label>
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              placeholder="010-0000-0000"
              className="w-full rounded-[12px] border border-ink/20 px-4 py-2.5 text-sm outline-none focus:border-forest"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate">권한 *</label>
            <select
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as AdminRole }))}
              className="w-full rounded-[12px] border border-ink/20 px-4 py-2.5 text-sm outline-none focus:border-forest"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>{ROLE_LABEL[r]}</option>
              ))}
            </select>
          </div>
        </div>
      </ActionModal>

      {/* Toggle Active Modal */}
      <ActionModal
        open={!!deactivateTarget}
        badgeLabel="직원 관리"
        badgeTone={deactivateTarget?.isActive ? "warning" : undefined}
        title={deactivateTarget?.isActive ? "계정 비활성화" : "계정 활성화"}
        description={deactivateTarget?.isActive
          ? `"${deactivateTarget?.name}" 계정을 비활성화합니다. 로그인이 불가해집니다.`
          : `"${deactivateTarget?.name}" 계정을 다시 활성화합니다.`
        }
        confirmLabel={deactivateTarget?.isActive ? "비활성화" : "활성화"}
        confirmTone={deactivateTarget?.isActive ? "danger" : undefined}
        cancelLabel="취소"
        isPending={isPending}
        onClose={() => setDeactivateTarget(null)}
        onConfirm={handleToggleActive}
      />
    </div>
  );
}
