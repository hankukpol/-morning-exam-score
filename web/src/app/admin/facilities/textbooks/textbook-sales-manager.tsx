"use client";

import { useState, useTransition } from "react";
import { type TextbookRow, type SaleRow } from "./page";
import { ActionModal } from "@/components/ui/action-modal";

const SUBJECT_LABELS: Record<string, string> = {
  CONSTITUTIONAL_LAW: "헌법",
  CRIMINOLOGY: "범죄학",
  CRIMINAL_PROCEDURE: "형사소송법",
  CRIMINAL_LAW: "형법",
  POLICE_SCIENCE: "경찰학",
  CUMULATIVE: "종합",
};

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "요청에 실패했습니다.");
  return data as T;
}

type SellFormState = {
  textbookId: number | null;
  quantity: string;
  examNumber: string;
  note: string;
};

type Props = {
  textbooks: TextbookRow[];
  initialTodaySales: SaleRow[];
};

export function TextbookSalesManager({ textbooks, initialTodaySales }: Props) {
  const [todaySales, setTodaySales] = useState<SaleRow[]>(initialTodaySales);
  const [sellModalOpen, setSellModalOpen] = useState(false);
  const [form, setForm] = useState<SellFormState>({
    textbookId: null,
    quantity: "1",
    examNumber: "",
    note: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedTextbook = textbooks.find((t) => t.id === form.textbookId);

  function openSellModal(textbookId?: number) {
    setForm({
      textbookId: textbookId ?? null,
      quantity: "1",
      examNumber: "",
      note: "",
    });
    setError(null);
    setSellModalOpen(true);
  }

  function handleClose() {
    if (!isPending) {
      setSellModalOpen(false);
      setError(null);
    }
  }

  function handleConfirm() {
    if (!form.textbookId) {
      setError("교재를 선택하세요.");
      return;
    }
    const qty = Number(form.quantity);
    if (!qty || qty < 1) {
      setError("수량은 1개 이상이어야 합니다.");
      return;
    }

    setError(null);
    startTransition(async () => {
      try {
        const result = await requestJson<{
          sale: {
            id: number;
            textbookId: number;
            textbook: { title: string };
            examNumber: string | null;
            staff: { name: string };
            quantity: number;
            unitPrice: number;
            totalPrice: number;
            note: string | null;
            soldAt: string;
          };
          remainingStock: number;
        }>(`/api/textbooks/${form.textbookId}/sell`, {
          method: "POST",
          body: JSON.stringify({
            quantity: qty,
            examNumber: form.examNumber.trim() || null,
            note: form.note.trim() || null,
          }),
        });

        const newSale: SaleRow = {
          id: result.sale.id,
          textbookId: result.sale.textbookId,
          textbookTitle: result.sale.textbook.title,
          examNumber: result.sale.examNumber,
          staffName: result.sale.staff.name,
          quantity: result.sale.quantity,
          unitPrice: result.sale.unitPrice,
          totalPrice: result.sale.totalPrice,
          note: result.sale.note,
          soldAt: result.sale.soldAt,
        };

        setTodaySales((prev) => [newSale, ...prev]);
        setSellModalOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "판매 등록 실패");
      }
    });
  }

  const todayTotal = todaySales.reduce((sum, s) => sum + s.totalPrice, 0);
  const todayCount = todaySales.reduce((sum, s) => sum + s.quantity, 0);

  const inputCls =
    "w-full rounded-2xl border border-ink/10 px-4 py-2.5 text-sm outline-none focus:border-ink/30 transition";
  const labelCls = "mb-1 block text-xs font-medium text-slate";

  return (
    <div className="space-y-8">
      {/* Today summary */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-[20px] border border-ink/10 bg-white p-5">
          <p className="text-xs font-medium text-slate">오늘 판매 건수</p>
          <p className="mt-1 text-2xl font-bold">{todaySales.length}건</p>
          <p className="text-sm text-slate">{todayCount}권</p>
        </div>
        <div className="rounded-[20px] border border-ink/10 bg-white p-5">
          <p className="text-xs font-medium text-slate">오늘 판매 금액</p>
          <p className="mt-1 text-2xl font-bold">{todayTotal.toLocaleString()}원</p>
        </div>
        <div className="rounded-[20px] border border-ink/10 bg-white p-5 sm:col-span-1 col-span-2">
          <p className="text-xs font-medium text-slate">판매 가능 교재</p>
          <p className="mt-1 text-2xl font-bold">{textbooks.length}종</p>
          <p className="text-sm text-slate">
            재고 있음 {textbooks.filter((t) => t.stock > 0).length}종
          </p>
        </div>
      </div>

      {/* Textbook list */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">교재 목록</h2>
          <button
            onClick={() => openSellModal()}
            className="rounded-full bg-forest px-5 py-2 text-sm font-medium text-white transition hover:bg-forest/90"
          >
            + 판매 등록
          </button>
        </div>
        <div className="overflow-hidden rounded-[20px] border border-ink/10 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink/8 bg-mist/50">
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate">교재명</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate hidden sm:table-cell">과목</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-slate">판매가</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-slate">재고</th>
                <th className="px-5 py-3 text-center text-xs font-semibold text-slate">판매</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/6">
              {textbooks.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-sm text-slate">
                    등록된 교재가 없습니다
                  </td>
                </tr>
              )}
              {textbooks.map((t) => (
                <tr key={t.id} className="hover:bg-mist/30 transition">
                  <td className="px-5 py-3.5 font-medium">
                    {t.title}
                    {t.author && (
                      <span className="ml-2 text-xs text-slate">{t.author}</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-slate hidden sm:table-cell">
                    {t.subject ? (SUBJECT_LABELS[t.subject] ?? t.subject) : "—"}
                  </td>
                  <td className="px-5 py-3.5 text-right tabular-nums">
                    {t.price.toLocaleString()}원
                  </td>
                  <td className="px-5 py-3.5 text-right tabular-nums">
                    <span
                      className={
                        t.stock === 0
                          ? "font-semibold text-red-600"
                          : t.stock <= 5
                          ? "font-semibold text-amber-600"
                          : "text-ink"
                      }
                    >
                      {t.stock}개
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-center">
                    <button
                      disabled={t.stock === 0}
                      onClick={() => openSellModal(t.id)}
                      className="rounded-full border border-forest/30 px-4 py-1.5 text-xs font-medium text-forest transition hover:bg-forest/10 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      판매
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Today's sales */}
      <div>
        <h2 className="text-lg font-semibold mb-4">오늘 판매 내역</h2>
        <div className="overflow-hidden rounded-[20px] border border-ink/10 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink/8 bg-mist/50">
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate">시각</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate">교재명</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate hidden sm:table-cell">수험번호</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-slate">수량</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-slate">금액</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate hidden md:table-cell">처리자</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/6">
              {todaySales.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-sm text-slate">
                    오늘 판매 내역이 없습니다
                  </td>
                </tr>
              )}
              {todaySales.map((s) => (
                <tr key={s.id}>
                  <td className="px-5 py-3.5 text-slate tabular-nums">
                    {new Date(s.soldAt).toLocaleTimeString("ko-KR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="px-5 py-3.5 font-medium">{s.textbookTitle}</td>
                  <td className="px-5 py-3.5 text-slate hidden sm:table-cell">
                    {s.examNumber ?? "—"}
                  </td>
                  <td className="px-5 py-3.5 text-right tabular-nums">{s.quantity}권</td>
                  <td className="px-5 py-3.5 text-right tabular-nums font-medium">
                    {s.totalPrice.toLocaleString()}원
                  </td>
                  <td className="px-5 py-3.5 text-slate hidden md:table-cell">{s.staffName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sell Modal */}
      <ActionModal
        open={sellModalOpen}
        badgeLabel="교재 판매"
        badgeTone="success"
        title="교재 판매 등록"
        description="현장 교재 판매를 등록합니다. 재고가 자동으로 차감됩니다."
        cancelLabel="취소"
        confirmLabel={isPending ? "등록 중..." : "판매 등록"}
        confirmTone="primary"
        isPending={isPending}
        onClose={handleClose}
        onConfirm={handleConfirm}
        panelClassName="max-w-md"
      >
        <div className="space-y-4">
          {/* Textbook select */}
          <div>
            <label className={labelCls}>교재 선택</label>
            <select
              value={form.textbookId ?? ""}
              onChange={(e) =>
                setForm((p) => ({ ...p, textbookId: e.target.value ? Number(e.target.value) : null }))
              }
              className={inputCls}
            >
              <option value="">교재를 선택하세요</option>
              {textbooks.map((t) => (
                <option key={t.id} value={t.id} disabled={t.stock === 0}>
                  {t.title}
                  {t.subject ? ` (${SUBJECT_LABELS[t.subject] ?? t.subject})` : ""}
                  {" — "}
                  {t.price.toLocaleString()}원 / 재고 {t.stock}개
                  {t.stock === 0 ? " [품절]" : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Selected textbook info */}
          {selectedTextbook && (
            <div className="rounded-2xl bg-mist px-4 py-3 text-sm">
              <div className="flex justify-between">
                <span className="text-slate">단가</span>
                <span className="font-medium">{selectedTextbook.price.toLocaleString()}원</span>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-slate">현재 재고</span>
                <span
                  className={
                    selectedTextbook.stock === 0
                      ? "font-medium text-red-600"
                      : selectedTextbook.stock <= 5
                      ? "font-medium text-amber-600"
                      : "font-medium"
                  }
                >
                  {selectedTextbook.stock}개
                </span>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-slate">예상 합계</span>
                <span className="font-semibold text-forest">
                  {(selectedTextbook.price * (Number(form.quantity) || 0)).toLocaleString()}원
                </span>
              </div>
            </div>
          )}

          {/* Quantity */}
          <div>
            <label className={labelCls}>수량</label>
            <input
              type="number"
              min={1}
              max={selectedTextbook?.stock ?? 99}
              value={form.quantity}
              onChange={(e) => setForm((p) => ({ ...p, quantity: e.target.value }))}
              className={inputCls}
            />
          </div>

          {/* Exam number (optional) */}
          <div>
            <label className={labelCls}>수험번호 (선택)</label>
            <input
              type="text"
              value={form.examNumber}
              onChange={(e) => setForm((p) => ({ ...p, examNumber: e.target.value }))}
              placeholder="학생 수험번호 (외부 구매자는 비워도 됩니다)"
              className={inputCls}
            />
          </div>

          {/* Note */}
          <div>
            <label className={labelCls}>메모 (선택)</label>
            <input
              type="text"
              value={form.note}
              onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))}
              placeholder="특이사항 메모"
              className={inputCls}
            />
          </div>

          {error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>
      </ActionModal>
    </div>
  );
}
