"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PaymentCategory, PaymentMethod } from "@prisma/client";
import { PAYMENT_CATEGORY_LABEL, PAYMENT_METHOD_LABEL } from "@/lib/constants";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type StudentResult = {
  examNumber: string;
  name: string;
  phone: string | null;
};

type EnrollmentOption = {
  id: string;
  courseType: string;
  finalFee: number;
  cohort: { name: string } | null;
  product: { name: string } | null;
  specialLecture: { name: string } | null;
};

type TextbookOption = {
  id: string;
  title: string;
  price: number;
  stock: number;
  isActive: boolean;
};

type TextbookLineItem = {
  textbookId: string;
  title: string;
  price: number;
  quantity: number;
};

type PaymentItemInput = {
  itemType: PaymentCategory;
  itemId?: string;
  itemName: string;
  unitPrice: number;
  quantity: number;
  amount: number;
};

type Props = {
  initialTextbooks: TextbookOption[];
  initialExamNumber?: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? "요청에 실패했습니다.");
  return payload as T;
}

function generateIdempotencyKey(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function enrollmentLabel(e: EnrollmentOption): string {
  const parts: string[] = [];
  if (e.cohort) parts.push(e.cohort.name);
  if (e.product) parts.push(e.product.name);
  if (e.specialLecture) parts.push(e.specialLecture.name);
  return parts.join(" / ") || e.id.slice(0, 8);
}

const SUPPORTED_CATEGORIES: PaymentCategory[] = [
  "TUITION",
  "SINGLE_COURSE",
  "TEXTBOOK",
  "FACILITY",
  "MATERIAL",
  "ETC",
];

const CATEGORY_LABEL_OVERRIDE: Partial<Record<PaymentCategory, string>> = {
  SINGLE_COURSE: "단과",
};

const SUPPORTED_METHODS: Array<{ value: PaymentMethod; label: string; disabled?: boolean }> = [
  { value: "CASH", label: "현금" },
  { value: "TRANSFER", label: "계좌이체" },
  { value: "CARD", label: "카드 (준비 중)", disabled: true },
];

const CATEGORY_ICONS: Record<PaymentCategory, string> = {
  TUITION: "🎓",
  TEXTBOOK: "📚",
  FACILITY: "🏫",
  MATERIAL: "🖊",
  SINGLE_COURSE: "📋",
  PENALTY: "⚠",
  ETC: "📌",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PaymentForm({ initialTextbooks, initialExamNumber = "" }: Props) {
  const router = useRouter();
  const idempotencyKey = useRef(generateIdempotencyKey());
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const formId = useId();

  // Section 1 - Student
  const [studentSearch, setStudentSearch] = useState(initialExamNumber);
  const [studentResults, setStudentResults] = useState<StudentResult[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<StudentResult | null>(null);
  const [isNonMember, setIsNonMember] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);

  // Section 2 - Category
  const [category, setCategory] = useState<PaymentCategory>("TUITION");
  const [enrollments, setEnrollments] = useState<EnrollmentOption[]>([]);
  const [selectedEnrollmentId, setSelectedEnrollmentId] = useState<string>("");
  const [enrollmentsLoading, setEnrollmentsLoading] = useState(false);

  // Textbook items
  const [textbooks] = useState<TextbookOption[]>(initialTextbooks);
  const [textbookLines, setTextbookLines] = useState<TextbookLineItem[]>([]);

  // Section 3 - Payment
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [grossAmount, setGrossAmount] = useState(0);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [note, setNote] = useState("");

  // Submit
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const netAmount = grossAmount - discountAmount;

  // ------ Student search ------
  useEffect(() => {
    if (isNonMember) {
      setStudentResults([]);
      setSelectedStudent(null);
      return;
    }
    if (!studentSearch.trim()) {
      setStudentResults([]);
      return;
    }
    if (searchRef.current) clearTimeout(searchRef.current);
    searchRef.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const result = await requestJson<{ students: StudentResult[] }>(
          `/api/students?search=${encodeURIComponent(studentSearch.trim())}&limit=10`,
        );
        setStudentResults(result.students);
      } catch {
        // ignore
      } finally {
        setSearchLoading(false);
      }
    }, 300);
    return () => {
      if (searchRef.current) clearTimeout(searchRef.current);
    };
  }, [studentSearch, isNonMember]);

  // ------ Load enrollments when student selected and category is TUITION ------
  useEffect(() => {
    if (category !== "TUITION" || !selectedStudent) {
      setEnrollments([]);
      setSelectedEnrollmentId("");
      return;
    }
    setEnrollmentsLoading(true);
    requestJson<{ enrollments: EnrollmentOption[] }>(
      `/api/enrollments?examNumber=${selectedStudent.examNumber}&status=PENDING&limit=20`,
    )
      .then((r) => {
        setEnrollments(r.enrollments);
        if (r.enrollments.length === 1) {
          setSelectedEnrollmentId(r.enrollments[0].id);
          setGrossAmount(r.enrollments[0].finalFee);
          setDiscountAmount(0);
        }
      })
      .catch(() => {})
      .finally(() => setEnrollmentsLoading(false));
  }, [category, selectedStudent]);

  // ------ Auto-fill amount when enrollment changes ------
  function handleEnrollmentChange(enrollmentId: string) {
    setSelectedEnrollmentId(enrollmentId);
    const found = enrollments.find((e) => e.id === enrollmentId);
    if (found) {
      setGrossAmount(found.finalFee);
      setDiscountAmount(0);
    }
  }

  // ------ Textbook line helpers ------
  function addTextbookLine(textbook: TextbookOption) {
    const existing = textbookLines.find((l) => l.textbookId === textbook.id);
    if (existing) return;
    const newLines = [
      ...textbookLines,
      { textbookId: textbook.id, title: textbook.title, price: textbook.price, quantity: 1 },
    ];
    setTextbookLines(newLines);
    recalcTextbookTotal(newLines);
  }

  function updateTextbookQty(textbookId: string, qty: number) {
    if (qty < 1) return;
    const newLines = textbookLines.map((l) =>
      l.textbookId === textbookId ? { ...l, quantity: qty } : l,
    );
    setTextbookLines(newLines);
    recalcTextbookTotal(newLines);
  }

  function removeTextbookLine(textbookId: string) {
    const newLines = textbookLines.filter((l) => l.textbookId !== textbookId);
    setTextbookLines(newLines);
    recalcTextbookTotal(newLines);
  }

  function recalcTextbookTotal(lines: TextbookLineItem[]) {
    const total = lines.reduce((s, l) => s + l.price * l.quantity, 0);
    setGrossAmount(total);
    setDiscountAmount(0);
  }

  // ------ Category change ------
  function handleCategoryChange(cat: PaymentCategory) {
    setCategory(cat);
    setGrossAmount(0);
    setDiscountAmount(0);
    setTextbookLines([]);
    setSelectedEnrollmentId("");
  }

  // ------ Build items for POST ------
  function buildItems(): PaymentItemInput[] {
    if (category === "TUITION") {
      const found = enrollments.find((e) => e.id === selectedEnrollmentId);
      return [
        {
          itemType: "TUITION",
          itemId: selectedEnrollmentId || undefined,
          itemName: found ? enrollmentLabel(found) : "수강료",
          unitPrice: grossAmount,
          quantity: 1,
          amount: grossAmount,
        },
      ];
    }
    if (category === "TEXTBOOK") {
      return textbookLines.map((l) => ({
        itemType: "TEXTBOOK" as PaymentCategory,
        itemId: l.textbookId,
        itemName: l.title,
        unitPrice: l.price,
        quantity: l.quantity,
        amount: l.price * l.quantity,
      }));
    }
    // SINGLE_COURSE / FACILITY / MATERIAL / ETC: single item
    return [
      {
        itemType: category,
        itemName: PAYMENT_CATEGORY_LABEL[category],
        unitPrice: grossAmount,
        quantity: 1,
        amount: grossAmount,
      },
    ];
  }

  // ------ Submit ------
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);

    if (category === "TUITION" && !selectedStudent && !isNonMember) {
      setErrorMessage("학생을 선택하거나 비회원 판매를 체크하세요.");
      return;
    }
    if (category === "TEXTBOOK" && textbookLines.length === 0) {
      setErrorMessage("교재를 한 권 이상 추가하세요.");
      return;
    }
    if (grossAmount <= 0) {
      setErrorMessage("청구금액은 0원보다 커야 합니다.");
      return;
    }
    if (netAmount < 0) {
      setErrorMessage("할인금액이 청구금액보다 클 수 없습니다.");
      return;
    }

    setSubmitting(true);
    try {
      await requestJson("/api/payments", {
        method: "POST",
        headers: { "X-Idempotency-Key": idempotencyKey.current },
        body: JSON.stringify({
          examNumber: selectedStudent?.examNumber ?? null,
          enrollmentId: selectedEnrollmentId || null,
          category,
          method,
          grossAmount,
          discountAmount,
          netAmount,
          note: note.trim() || null,
          items: buildItems(),
        }),
      });
      router.push("/admin/payments");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "수납 등록 실패");
    } finally {
      setSubmitting(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <form id={formId} onSubmit={handleSubmit} className="space-y-6">
      {/* Section 1: 학생 검색 */}
      <div className="rounded-[28px] border border-ink/10 bg-white p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-ink">학생 검색</h2>
          <label className="flex items-center gap-2 text-sm text-slate cursor-pointer">
            <input
              type="checkbox"
              checked={isNonMember}
              onChange={(e) => {
                setIsNonMember(e.target.checked);
                setSelectedStudent(null);
                setStudentSearch("");
              }}
              className="rounded"
            />
            비회원 판매
          </label>
        </div>

        {!isNonMember && (
          <div className="space-y-3">
            <div className="relative">
              <input
                type="text"
                value={studentSearch}
                onChange={(e) => {
                  setStudentSearch(e.target.value);
                  if (selectedStudent) setSelectedStudent(null);
                }}
                placeholder="이름 또는 수험번호로 검색"
                className="w-full rounded-2xl border border-ink/10 px-4 py-2.5 text-sm outline-none focus:border-ember/40"
              />
              {searchLoading ? (
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-slate">
                  검색 중...
                </span>
              ) : null}
            </div>

            {/* Dropdown results */}
            {studentResults.length > 0 && !selectedStudent ? (
              <div className="rounded-2xl border border-ink/10 bg-white shadow-lg overflow-hidden">
                {studentResults.map((s) => (
                  <button
                    key={s.examNumber}
                    type="button"
                    onClick={() => {
                      setSelectedStudent(s);
                      setStudentSearch(s.name);
                      setStudentResults([]);
                    }}
                    className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-mist/50 transition"
                  >
                    <span className="font-medium text-ink">{s.name}</span>
                    <span className="text-xs text-slate">{s.examNumber}</span>
                  </button>
                ))}
              </div>
            ) : null}

            {/* Selected student card */}
            {selectedStudent ? (
              <div className="flex items-center justify-between rounded-2xl border border-forest/20 bg-forest/5 px-4 py-3">
                <div>
                  <span className="font-medium text-ink">{selectedStudent.name}</span>
                  <span className="ml-2 text-xs text-slate">{selectedStudent.examNumber}</span>
                  {selectedStudent.phone ? (
                    <span className="ml-2 text-xs text-slate">{selectedStudent.phone}</span>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedStudent(null);
                    setStudentSearch("");
                    setEnrollments([]);
                    setSelectedEnrollmentId("");
                  }}
                  className="text-xs text-slate hover:text-ember transition"
                >
                  변경
                </button>
              </div>
            ) : null}
          </div>
        )}

        {isNonMember ? (
          <p className="text-sm text-slate">비회원으로 판매를 진행합니다.</p>
        ) : null}
      </div>

      {/* Section 2: 수납 유형 */}
      <div className="rounded-[28px] border border-ink/10 bg-white p-6 space-y-4">
        <h2 className="text-base font-semibold text-ink">수납 유형</h2>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {SUPPORTED_CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => handleCategoryChange(cat)}
              className={`flex flex-col items-center gap-1.5 rounded-2xl border px-3 py-4 text-sm font-medium transition ${
                category === cat
                  ? "border-ember/40 bg-ember/10 text-ember"
                  : "border-ink/10 bg-white text-slate hover:border-ink/20 hover:text-ink"
              }`}
            >
              <span className="text-xl">{CATEGORY_ICONS[cat]}</span>
              <span>{CATEGORY_LABEL_OVERRIDE[cat] ?? PAYMENT_CATEGORY_LABEL[cat]}</span>
            </button>
          ))}
        </div>

        {/* TUITION: enrollment selector */}
        {category === "TUITION" && selectedStudent && (
          <div className="space-y-2">
            <label className="text-sm font-medium text-ink">수강 신청 내역 연결</label>
            {enrollmentsLoading ? (
              <p className="text-xs text-slate">수강 내역 불러오는 중...</p>
            ) : enrollments.length === 0 ? (
              <p className="text-xs text-slate">신청 중인 수강 내역이 없습니다.</p>
            ) : (
              <select
                value={selectedEnrollmentId}
                onChange={(e) => handleEnrollmentChange(e.target.value)}
                className="w-full rounded-2xl border border-ink/10 px-4 py-2.5 text-sm outline-none focus:border-ember/40"
              >
                <option value="">-- 연결할 수강 내역 선택 (선택사항) --</option>
                {enrollments.map((e) => (
                  <option key={e.id} value={e.id}>
                    {enrollmentLabel(e)} — {e.finalFee.toLocaleString()}원
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        {/* TEXTBOOK: textbook selector */}
        {category === "TEXTBOOK" && (
          <div className="space-y-3">
            <label className="text-sm font-medium text-ink">교재 선택</label>
            <div className="rounded-2xl border border-ink/10 divide-y divide-ink/10 overflow-hidden">
              {textbooks.filter((t) => t.isActive).length === 0 ? (
                <div className="px-4 py-4 text-sm text-slate text-center">
                  등록된 교재가 없습니다.
                </div>
              ) : null}
              {textbooks
                .filter((t) => t.isActive)
                .map((t) => {
                  const line = textbookLines.find((l) => l.textbookId === t.id);
                  return (
                    <div
                      key={t.id}
                      className="flex items-center justify-between px-4 py-3 text-sm"
                    >
                      <div>
                        <span className="font-medium text-ink">{t.title}</span>
                        <span className="ml-2 text-xs text-slate">
                          {t.price.toLocaleString()}원
                        </span>
                        {t.stock <= 0 ? (
                          <span className="ml-2 text-xs text-red-600">재고 없음</span>
                        ) : (
                          <span className="ml-2 text-xs text-slate">재고 {t.stock}</span>
                        )}
                      </div>
                      {line ? (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => updateTextbookQty(t.id, line.quantity - 1)}
                            disabled={line.quantity <= 1}
                            className="h-6 w-6 rounded-full border border-ink/10 text-sm text-slate hover:border-ember/30 hover:text-ember disabled:opacity-30"
                          >
                            -
                          </button>
                          <span className="w-6 text-center tabular-nums">{line.quantity}</span>
                          <button
                            type="button"
                            onClick={() => updateTextbookQty(t.id, line.quantity + 1)}
                            className="h-6 w-6 rounded-full border border-ink/10 text-sm text-slate hover:border-ember/30 hover:text-ember"
                          >
                            +
                          </button>
                          <button
                            type="button"
                            onClick={() => removeTextbookLine(t.id)}
                            className="ml-2 text-xs text-red-600 hover:text-red-700"
                          >
                            제거
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => addTextbookLine(t)}
                          disabled={t.stock <= 0}
                          className="rounded-full border border-ink/10 px-3 py-1 text-xs font-medium text-slate hover:border-ember/30 hover:text-ember disabled:cursor-not-allowed disabled:opacity-40 transition"
                        >
                          추가
                        </button>
                      )}
                    </div>
                  );
                })}
            </div>

            {textbookLines.length > 0 ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
                <div className="font-medium text-amber-800 mb-2">선택된 교재</div>
                {textbookLines.map((l) => (
                  <div key={l.textbookId} className="flex justify-between text-xs text-amber-700">
                    <span>
                      {l.title} ×{l.quantity}
                    </span>
                    <span className="tabular-nums">{(l.price * l.quantity).toLocaleString()}원</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        )}

        {/* SINGLE_COURSE / FACILITY / MATERIAL / ETC: free amount */}
        {(category === "SINGLE_COURSE" || category === "FACILITY" || category === "MATERIAL" || category === "ETC") && (
          <div className="space-y-2">
            <label className="text-sm font-medium text-ink">금액 입력</label>
            <input
              type="number"
              min={0}
              step={1000}
              value={grossAmount || ""}
              onChange={(e) => {
                setGrossAmount(Number(e.target.value));
                setDiscountAmount(0);
              }}
              placeholder="금액 (원)"
              className="w-full rounded-2xl border border-ink/10 px-4 py-2.5 text-sm outline-none focus:border-ember/40"
            />
          </div>
        )}
      </div>

      {/* Section 3: 결제 수단 */}
      <div className="rounded-[28px] border border-ink/10 bg-white p-6 space-y-5">
        <h2 className="text-base font-semibold text-ink">결제 수단</h2>

        {/* Method selector */}
        <div className="flex flex-wrap gap-3">
          {SUPPORTED_METHODS.map((m) => (
            <button
              key={m.value}
              type="button"
              disabled={m.disabled}
              onClick={() => !m.disabled && setMethod(m.value)}
              className={`rounded-2xl border px-5 py-3 text-sm font-medium transition ${
                method === m.value && !m.disabled
                  ? "border-ember/40 bg-ember/10 text-ember"
                  : m.disabled
                    ? "cursor-not-allowed border-ink/10 bg-ink/5 text-slate/50"
                    : "border-ink/10 bg-white text-slate hover:border-ink/20 hover:text-ink"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* Amount fields */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate">청구금액</label>
            <input
              type="number"
              min={0}
              step={1000}
              value={grossAmount || ""}
              onChange={(e) => setGrossAmount(Number(e.target.value))}
              placeholder="0"
              className="w-full rounded-2xl border border-ink/10 px-4 py-2.5 text-sm tabular-nums outline-none focus:border-ember/40"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate">할인금액</label>
            <input
              type="number"
              min={0}
              step={1000}
              max={grossAmount}
              value={discountAmount || ""}
              onChange={(e) => setDiscountAmount(Math.min(Number(e.target.value), grossAmount))}
              placeholder="0"
              className="w-full rounded-2xl border border-ink/10 px-4 py-2.5 text-sm tabular-nums outline-none focus:border-ember/40"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate">실납부금액</label>
            <div className="flex items-center rounded-2xl border border-forest/30 bg-forest/5 px-4 py-2.5">
              <span className="text-lg font-bold text-forest tabular-nums">
                {netAmount.toLocaleString()}원
              </span>
            </div>
          </div>
        </div>

        {/* Note */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate">비고 (선택)</label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="메모 또는 특이사항"
            className="w-full rounded-2xl border border-ink/10 px-4 py-2.5 text-sm outline-none focus:border-ember/40"
          />
        </div>
      </div>

      {/* Error */}
      {errorMessage ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      {/* Submit */}
      <div className="flex items-center justify-between gap-4">
        <a
          href="/admin/payments"
          className="rounded-full border border-ink/10 px-6 py-2.5 text-sm font-medium text-slate transition hover:border-ink/20 hover:text-ink"
        >
          취소
        </a>
        <button
          type="submit"
          form={formId}
          disabled={submitting}
          className="inline-flex items-center gap-2 rounded-full bg-ember px-8 py-2.5 text-sm font-semibold text-white transition hover:bg-ember/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "처리 중..." : `수납 등록 (${PAYMENT_METHOD_LABEL[method]})`}
        </button>
      </div>
    </form>
  );
}
