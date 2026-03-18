"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ActionModal } from "@/components/ui/action-modal";
import type { PaymentLinkRow, CourseOption, LinkStats } from "@/app/admin/payments/links/page";

type Props = {
  initialLinks: PaymentLinkRow[];
  courses: CourseOption[];
  initialStats: LinkStats;
};

type LinkForm = {
  title: string;
  courseId: string;
  amount: string;
  discountAmount: string;
  allowPoint: boolean;
  expiresAt: string;
  expiryPreset: string;
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

const EXPIRY_PRESETS = [
  { label: "24시간", hours: 24 },
  { label: "48시간", hours: 48 },
  { label: "72시간", hours: 72 },
  { label: "1주일", hours: 168 },
  { label: "직접 입력", hours: 0 },
];

function addHoursToNow(hours: number): string {
  const d = new Date();
  d.setHours(d.getHours() + hours);
  return d.toISOString().split("T")[0];
}

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
  expiryPreset: "168",
  maxUsage: "",
  note: "",
};

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
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

function formatRelativeTime(isoString: string): string {
  const diff = new Date(isoString).getTime() - Date.now();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (diff < 0) return "만료됨";
  if (hours < 1) return `${minutes}분 후 만료`;
  if (hours < 24) return `${hours}시간 후 만료`;
  const days = Math.floor(hours / 24);
  return `${days}일 후 만료`;
}

type KpiCardProps = {
  label: string;
  value: number;
  color?: string;
  badge?: string;
};

function KpiCard({ label, value, color = "text-ink", badge }: KpiCardProps) {
  return (
    <div className="rounded-[28px] border border-ink/10 bg-white p-5">
      <p className="text-xs font-medium text-slate">{label}</p>
      <div className="mt-2 flex items-end gap-2">
        <p className={`text-2xl font-bold tabular-nums ${color}`}>{value.toLocaleString()}</p>
        {badge && (
          <span className="mb-0.5 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
            {badge}
          </span>
        )}
      </div>
    </div>
  );
}

export function PaymentLinkManager({ initialLinks, courses, initialStats }: Props) {
  const [links, setLinks] = useState<PaymentLinkRow[]>(initialLinks);
  const [stats, setStats] = useState<LinkStats>(initialStats);
  const [form, setForm] = useState<LinkForm>(EMPTY_FORM);
  const [error, setError] = useState("");
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();

  const [createOpen, setCreateOpen] = useState<boolean>(false);
  const [disableOpen, setDisableOpen] = useState<boolean>(false);
  const [targetLink, setTargetLink] = useState<PaymentLinkRow | null>(null);

  function recomputeStats(updatedLinks: PaymentLinkRow[]): LinkStats {
    const now = new Date();
    return {
      total: updatedLinks.length,
      active: updatedLinks.filter((l) => l.status === "ACTIVE" && !l.isExpired).length,
      paid: updatedLinks.reduce((sum, l) => sum + l._count.payments, 0),
      expired: updatedLinks.filter((l) => l.status === "EXPIRED" || (l.status === "ACTIVE" && l.isExpired)).length,
      disabled: updatedLinks.filter((l) => l.status === "DISABLED").length,
      usedUp: updatedLinks.filter((l) => l.status === "USED_UP").length,
      expiringSoon: updatedLinks.filter(
        (l) =>
          l.status === "ACTIVE" &&
          !l.isExpired &&
          new Date(l.expiresAt) < new Date(now.getTime() + 24 * 60 * 60 * 1000),
      ).length,
    };
  }

  function handleCourseChange(courseId: string) {
    const course = courses.find((c) => String(c.id) === courseId);
    setForm((f) => ({
      ...f,
      courseId,
      amount: course ? String(course.tuitionFee) : f.amount,
    }));
  }

  function handleExpiryPreset(preset: string) {
    const hours = Number(preset);
    setForm((f) => ({
      ...f,
      expiryPreset: preset,
      expiresAt: hours > 0 ? addHoursToNow(hours) : f.expiresAt,
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
          expiresAt: new Date(form.expiresAt + "T23:59:59").toISOString(),
          maxUsage: form.maxUsage ? Number(form.maxUsage) : undefined,
          note: form.note.trim() || undefined,
        };
        const data = await requestJson<{ link: PaymentLinkRow }>("/api/payment-links", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        const newLink: PaymentLinkRow = {
          ...data.link,
          isExpired: false,
          isExpiringSoon: false,
        };
        const updated = [newLink, ...links];
        setLinks(updated);
        setStats(recomputeStats(updated));
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
        const updated = links.map((l) =>
          l.id === targetLink.id ? { ...l, status: "DISABLED" as const } : l,
        );
        setLinks(updated);
        setStats(recomputeStats(updated));
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

  const finalAmount = Math.max(
    0,
    (Number(form.amount) || 0) - (Number(form.discountAmount) || 0),
  );

  return (
    <>
      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <KpiCard label="전체 링크" value={stats.total} />
        <KpiCard
          label="활성 링크"
          value={stats.active}
          color="text-forest"
          badge={stats.expiringSoon > 0 ? `${stats.expiringSoon}개 임박` : undefined}
        />
        <KpiCard label="결제 완료" value={stats.paid} color="text-ember" />
        <KpiCard label="만료됨" value={stats.expired} color="text-slate" />
        <KpiCard label="비활성" value={stats.disabled} color="text-red-600" />
      </div>

      {/* Expiring soon banner */}
      {stats.expiringSoon > 0 && (
        <div className="mt-4 flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
          <span className="text-sm font-semibold text-amber-800">
            24시간 이내 만료 링크 {stats.expiringSoon}개
          </span>
          <span className="text-xs text-amber-700">
            만료 전에 연장하거나 새 링크를 발송하세요.
          </span>
        </div>
      )}

      {/* Header */}
      <div className="mt-6 flex items-center justify-between">
        <p className="text-sm text-slate">{links.length}개 링크</p>
        <div className="flex items-center gap-3">
          <Link
            href="/admin/payment-links/bulk"
            className="rounded-full border border-ink/15 px-5 py-2.5 text-sm font-semibold text-ink transition hover:border-ink/30 hover:text-ember"
          >
            일괄 생성
          </Link>
          <button
            type="button"
            onClick={() => {
              setForm(EMPTY_FORM);
              setError("");
              setCreateOpen(true);
            }}
            className="rounded-full bg-ember px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-ember/90"
          >
            + 결제 링크 생성
          </button>
        </div>
      </div>

      {/* Link table */}
      <div className="mt-4 overflow-x-auto rounded-[28px] border border-ink/10 bg-white">
        <table className="min-w-full divide-y divide-ink/5 text-sm">
          <thead>
            <tr>
              {["제목 / 강좌", "결제 금액", "만료일", "사용 현황", "상태", "생성자", "관리"].map(
                (h) => (
                  <th
                    key={h}
                    className="whitespace-nowrap bg-mist/50 px-4 py-3 text-left text-xs font-medium uppercase text-slate"
                  >
                    {h}
                  </th>
                ),
              )}
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
                const displayStatus =
                  link.status === "ACTIVE" && link.isExpired ? "EXPIRED" : link.status;
                const isExpiringSoon = link.isExpiringSoon;

                return (
                  <tr
                    key={link.id}
                    className={`hover:bg-mist/30 ${isExpiringSoon ? "bg-amber-50/40" : ""}`}
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/payment-links/${link.id}`}
                        className="font-medium text-ink transition hover:text-ember"
                      >
                        {link.title}
                      </Link>
                      {link.course && (
                        <p className="mt-0.5 text-xs text-slate">{link.course.name}</p>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                      <p className="font-semibold text-ink">
                        {link.finalAmount.toLocaleString()}원
                      </p>
                      {link.discountAmount > 0 && (
                        <p className="text-xs text-slate">
                          -{link.discountAmount.toLocaleString()}원 할인
                        </p>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs">
                      <p className="text-slate">
                        {link.expiresAt.split("T")[0].replace(/-/g, ".")}
                      </p>
                      {isExpiringSoon && (
                        <p className="mt-0.5 font-semibold text-amber-700">
                          {formatRelativeTime(link.expiresAt)}
                        </p>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums text-xs text-slate">
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
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-slate">
                      {link.staff.name}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleCopy(link)}
                          className="rounded-full border border-ink/10 px-3 py-1 text-xs font-medium text-ink transition hover:border-ink/30"
                        >
                          {copiedId === link.id ? "복사됨" : "링크 복사"}
                        </button>
                        <a
                          href={`/pay/${link.token}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-full border border-ink/10 px-3 py-1 text-xs font-medium text-ink transition hover:border-ink/30"
                        >
                          미리보기
                        </a>
                        <Link
                          href={`/admin/payment-links/${link.id}`}
                          className="rounded-full border border-ink/10 px-3 py-1 text-xs font-medium text-ink transition hover:border-ink/30"
                        >
                          상세
                        </Link>
                        {link.status === "ACTIVE" && !link.isExpired && (
                          <button
                            type="button"
                            onClick={() => {
                              setTargetLink(link);
                              setDisableOpen(true);
                            }}
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
        open={createOpen}
        badgeLabel="결제 링크"
        title="결제 링크 생성"
        description="학생에게 전송할 결제 링크를 생성합니다."
        confirmLabel="링크 생성"
        cancelLabel="취소"
        onClose={() => setCreateOpen(false)}
        onConfirm={handleCreate}
        isPending={isPending}
        panelClassName="max-w-lg"
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
            <div className="rounded-2xl border border-forest/15 bg-forest/5 px-4 py-2.5">
              <p className="text-sm font-semibold text-forest">
                최종 결제 금액: {finalAmount.toLocaleString()}원
              </p>
            </div>
          )}

          {/* Expiry preset */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate">
              만료 시간 <span className="text-red-500">*</span>
            </label>
            <div className="mb-2 flex flex-wrap gap-2">
              {EXPIRY_PRESETS.map((preset) => (
                <button
                  key={preset.hours}
                  type="button"
                  onClick={() => handleExpiryPreset(String(preset.hours))}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                    form.expiryPreset === String(preset.hours)
                      ? "border-ember/40 bg-ember/10 text-ember"
                      : "border-ink/15 text-ink hover:border-ink/30"
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <input
              type="date"
              value={form.expiresAt}
              onChange={(e) =>
                setForm((f) => ({ ...f, expiresAt: e.target.value, expiryPreset: "0" }))
              }
              className="w-full rounded-2xl border border-ink/15 bg-white px-4 py-2.5 text-sm outline-none focus:border-ember/60"
            />
          </div>

          {/* Max Usage */}
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

          {/* Allow point */}
          <label className="flex cursor-pointer items-center gap-2">
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
        open={disableOpen}
        badgeLabel="결제 링크"
        title="결제 링크 비활성화"
        description="이 결제 링크를 비활성화합니다."
        confirmLabel="비활성화"
        cancelLabel="취소"
        confirmTone="danger"
        onClose={() => setDisableOpen(false)}
        onConfirm={handleDisable}
        isPending={isPending}
      >
        <p className="text-sm text-slate">
          <span className="font-semibold text-ink">{targetLink?.title}</span> 링크를
          비활성화합니다. 이미 전송된 링크로 더 이상 결제할 수 없게 됩니다.
        </p>
      </ActionModal>
    </>
  );
}
