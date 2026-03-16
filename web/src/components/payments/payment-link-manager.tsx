"use client";

import { useState, useTransition } from "react";
import { ActionModal } from "@/components/ui/action-modal";
import type { PaymentLinkRow, CourseOption } from "@/app/admin/payments/links/page";

type Props = {
  initialLinks: PaymentLinkRow[];
  courses: CourseOption[];
};

type LinkForm = {
  title: string;
  courseId: string;
  amount: string;
  discountAmount: string;
  allowPoint: boolean;
  expiresAt: string;
  maxUsage: string;
  note: string;
};

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "활성",
  EXPIRED: "만료",
  DISABLED: "비활성",
  USED_UP: "소진",
};

const STATUS_COLOR: Record<string, string> = {
  ACTIVE: "border-forest/20 bg-forest/10 text-forest",
  EXPIRED: "border-slate/20 bg-slate/10 text-slate",
  DISABLED: "border-red-200 bg-red-50 text-red-700",
  USED_UP: "border-amber-200 bg-amber-50 text-amber-700",
};

function todayPlusDays(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().split("T")[0];
}

const EMPTY_FORM: LinkForm = {
  title: "",
  courseId: "",
  amount: "",
  discountAmount: "0",
  allowPoint: true,
  expiresAt: todayPlusDays(7),
  maxUsage: "",
  note: "",
};

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

function copyToClipboard(text: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    navigator.clipboard.writeText(text).catch(() => {});
  }
}

function getBaseUrl() {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  return "";
}

export function PaymentLinkManager({ initialLinks, courses }: Props) {
  const [links, setLinks] = useState<PaymentLinkRow[]>(initialLinks);
  const [form, setForm] = useState<LinkForm>(EMPTY_FORM);
  const [error, setError] = useState("");
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();

  const [createOpen, setCreateOpen] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);
  const [targetLink, setTargetLink] = useState<PaymentLinkRow | null>(null);

  function handleCourseChange(courseId: string) {
    const course = courses.find((c) => String(c.id) === courseId);
    setForm((f) => ({
      ...f,
      courseId,
      amount: course ? String(course.tuitionFee) : f.amount,
    }));
  }

  function handleCreate() {
    setError("");
    startTransition(async () => {
      try {
        const payload = {
          title: form.title.trim(),
          courseId: form.courseId ? Number(form.courseId) : undefined,
          amount: Number(form.amount),
          discountAmount: Number(form.discountAmount) || 0,
          allowPoint: form.allowPoint,
          expiresAt: new Date(form.expiresAt).toISOString(),
          maxUsage: form.maxUsage ? Number(form.maxUsage) : undefined,
          note: form.note.trim() || undefined,
        };
        const data = await requestJson<{ link: PaymentLinkRow }>("/api/payment-links", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setLinks((prev) => [data.link, ...prev]);
        setForm(EMPTY_FORM);
        setCreateOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "생성 실패");
      }
    });
  }

  function handleDisable() {
    if (!targetLink) return;
    startTransition(async () => {
      try {
        await requestJson(`/api/payment-links/${targetLink.id}`, { method: "DELETE" });
        setLinks((prev) =>
          prev.map((l) => (l.id === targetLink.id ? { ...l, status: "DISABLED" } : l)),
        );
        setDisableOpen(false);
        setTargetLink(null);
      } catch {
        // ignore
      }
    });
  }

  function handleCopy(link: PaymentLinkRow) {
    const url = `${getBaseUrl()}/pay/${link.token}`;
    copyToClipboard(url);
    setCopiedId(link.id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  const finalAmount =
    Math.max(0, (Number(form.amount) || 0) - (Number(form.discountAmount) || 0));

  return (
    <>
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate">{links.length}개 링크</p>
        <button
          type="button"
          onClick={() => { setForm(EMPTY_FORM); setError(""); setCreateOpen(true); }}
          className="rounded-full bg-ember px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-ember/90"
        >
          + 결제 링크 생성
        </button>
      </div>

      {/* Link table */}
      <div className="mt-4 overflow-x-auto rounded-[28px] border border-ink/10 bg-white">
        <table className="min-w-full divide-y divide-ink/5 text-sm">
          <thead>
            <tr>
              {["제목 / 강좌", "결제 금액", "만료일", "사용 현황", "상태", "생성자", "관리"].map((h) => (
                <th
                  key={h}
                  className="px-4 py-3 text-left text-xs font-medium text-slate uppercase bg-mist/50 whitespace-nowrap"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/5">
            {links.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-slate">
                  생성된 결제 링크가 없습니다.
                </td>
              </tr>
            ) : (
              links.map((link) => {
                const expired = link.status === "ACTIVE" && new Date(link.expiresAt) < new Date();
                const displayStatus = expired ? "EXPIRED" : link.status;
                return (
                  <tr key={link.id} className="hover:bg-mist/30">
                    <td className="px-4 py-3">
                      <p className="font-medium text-ink">{link.title}</p>
                      {link.course && (
                        <p className="text-xs text-slate mt-0.5">{link.course.name}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 tabular-nums whitespace-nowrap">
                      <p className="font-semibold text-ink">{link.finalAmount.toLocaleString()}원</p>
                      {link.discountAmount > 0 && (
                        <p className="text-xs text-slate">
                          -{link.discountAmount.toLocaleString()}원 할인
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate whitespace-nowrap">
                      {link.expiresAt.split("T")[0].replace(/-/g, ".")}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-xs text-slate whitespace-nowrap">
                      {link._count.payments}
                      {link.maxUsage != null ? ` / ${link.maxUsage}` : ""} 건
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${STATUS_COLOR[displayStatus] ?? STATUS_COLOR.ACTIVE}`}
                      >
                        {STATUS_LABEL[displayStatus] ?? displayStatus}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate whitespace-nowrap">
                      {link.staff.name}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleCopy(link)}
                          className="rounded-full border border-ink/10 px-3 py-1 text-xs font-medium text-ink transition hover:border-ink/30"
                        >
                          {copiedId === link.id ? "복사됨 ✓" : "링크 복사"}
                        </button>
                        <a
                          href={`/pay/${link.token}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-full border border-ink/10 px-3 py-1 text-xs font-medium text-ink transition hover:border-ink/30"
                        >
                          미리보기
                        </a>
                        {link.status === "ACTIVE" && (
                          <button
                            type="button"
                            onClick={() => { setTargetLink(link); setDisableOpen(true); }}
                            className="rounded-full border border-red-200 px-3 py-1 text-xs font-medium text-red-600 transition hover:bg-red-50"
                          >
                            비활성화
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Create modal */}
      <ActionModal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title="결제 링크 생성"
        confirmLabel="링크 생성"
        onConfirm={handleCreate}
        isLoading={isPending}
      >
        <div className="space-y-4">
          {error && (
            <p className="rounded-2xl bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>
          )}

          {/* Title */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate">
              링크 제목 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="예: 2026 공채 종합반 3월 등록"
              className="w-full rounded-2xl border border-ink/15 bg-white px-4 py-2.5 text-sm outline-none focus:border-ember/60 focus:ring-1 focus:ring-ember/30"
            />
          </div>

          {/* Course */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate">강좌 연결 (선택)</label>
            <select
              value={form.courseId}
              onChange={(e) => handleCourseChange(e.target.value)}
              className="w-full rounded-2xl border border-ink/15 bg-white px-4 py-2.5 text-sm outline-none focus:border-ember/60"
            >
              <option value="">강좌 선택 없음</option>
              {courses.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.name} ({c.tuitionFee.toLocaleString()}원)
                </option>
              ))}
            </select>
          </div>

          {/* Amount + Discount */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate">
                결제 금액 (원) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                min={0}
                placeholder="600000"
                className="w-full rounded-2xl border border-ink/15 bg-white px-4 py-2.5 text-sm outline-none focus:border-ember/60"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate">할인 금액 (원)</label>
              <input
                type="number"
                value={form.discountAmount}
                onChange={(e) => setForm((f) => ({ ...f, discountAmount: e.target.value }))}
                min={0}
                placeholder="0"
                className="w-full rounded-2xl border border-ink/15 bg-white px-4 py-2.5 text-sm outline-none focus:border-ember/60"
              />
            </div>
          </div>

          {form.amount && (
            <div className="rounded-2xl bg-forest/5 border border-forest/15 px-4 py-2.5">
              <p className="text-sm text-forest font-semibold">
                최종 결제 금액: {finalAmount.toLocaleString()}원
              </p>
            </div>
          )}

          {/* Expiry + Max Usage */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate">
                만료일 <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={form.expiresAt}
                onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))}
                className="w-full rounded-2xl border border-ink/15 bg-white px-4 py-2.5 text-sm outline-none focus:border-ember/60"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate">
                최대 사용 횟수 (비워두면 무제한)
              </label>
              <input
                type="number"
                value={form.maxUsage}
                onChange={(e) => setForm((f) => ({ ...f, maxUsage: e.target.value }))}
                min={1}
                placeholder="무제한"
                className="w-full rounded-2xl border border-ink/15 bg-white px-4 py-2.5 text-sm outline-none focus:border-ember/60"
              />
            </div>
          </div>

          {/* Allow point */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.allowPoint}
              onChange={(e) => setForm((f) => ({ ...f, allowPoint: e.target.checked }))}
              className="h-4 w-4 rounded border-ink/20 text-ember"
            />
            <span className="text-sm text-ink">포인트 사용 허용</span>
          </label>

          {/* Note */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate">메모 (내부용)</label>
            <input
              type="text"
              value={form.note}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              placeholder="예: 3월 특별 이벤트 링크"
              className="w-full rounded-2xl border border-ink/15 bg-white px-4 py-2.5 text-sm outline-none focus:border-ember/60"
            />
          </div>
        </div>
      </ActionModal>

      {/* Disable confirm modal */}
      <ActionModal
        isOpen={disableOpen}
        onClose={() => setDisableOpen(false)}
        title="결제 링크 비활성화"
        confirmLabel="비활성화"
        confirmVariant="danger"
        onConfirm={handleDisable}
        isLoading={isPending}
      >
        <p className="text-sm text-slate">
          <span className="font-semibold text-ink">{targetLink?.title}</span> 링크를
          비활성화합니다. 이미 전송된 링크로 더 이상 결제할 수 없게 됩니다.
        </p>
      </ActionModal>
    </>
  );
}
