"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type StudentResult = {
  examNumber: string;
  name: string;
  phone: string | null;
};

type CourseOption = {
  id: number;
  name: string;
  tuitionFee: number;
};

type CohortOption = {
  id: string;
  name: string;
  examCategory: string;
  isActive: boolean;
  startDate: string;
  endDate: string;
  activeCount: number;
  waitlistCount: number;
};

type ProductOption = {
  id: string;
  name: string;
  examCategory: string;
  durationMonths: number;
  salePrice: number;
  isActive: boolean;
};

type SpecialLectureOption = {
  id: string;
  name: string;
  isActive: boolean;
  startDate: string;
  endDate: string;
  _count?: { enrollments: number };
};

type Props = {
  courses: CourseOption[];
  cohorts: CohortOption[];
  products: ProductOption[];
  specialLectures: SpecialLectureOption[];
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EXPIRY_PRESETS = [
  { label: "24시간", hours: 24 },
  { label: "48시간", hours: 48 },
  { label: "72시간", hours: 72 },
  { label: "1주일", hours: 168 },
  { label: "직접 입력", hours: 0 },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function addHoursToNow(hours: number): string {
  const d = new Date();
  d.setHours(d.getHours() + hours);
  return d.toISOString().slice(0, 16); // "YYYY-MM-DDTHH:mm"
}

function defaultExpiresAt(): string {
  return addHoursToNow(168); // 1 week default
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  const data = await res.json();
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  return data as T;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PaymentLinkForm({ courses, cohorts, products, specialLectures }: Props) {
  const router = useRouter();
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isPending, startTransition] = useTransition();

  // Student search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setStudentResults] = useState<StudentResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<StudentResult | null>(null);

  // Form fields
  const [title, setTitle] = useState("");
  const [courseId, setCourseId] = useState("");
  const [amount, setAmount] = useState("");
  const [discountAmount, setDiscountAmount] = useState("0");
  const [allowPoint, setAllowPoint] = useState(true);
  const [expiresAt, setExpiresAt] = useState(defaultExpiresAt());
  const [expiryPreset, setExpiryPreset] = useState("168");
  const [maxUsage, setMaxUsage] = useState("");
  const [note, setNote] = useState("");

  // Auto-enrollment fields
  const [autoEnrollEnabled, setAutoEnrollEnabled] = useState(false);
  const [courseType, setCourseType] = useState<"COMPREHENSIVE" | "SPECIAL_LECTURE" | "">("");
  const [cohortId, setCohortId] = useState("");
  const [productId, setProductId] = useState("");
  const [specialLectureId, setSpecialLectureId] = useState("");

  const [error, setError] = useState("");

  // ---------------------------------------------------------------------------
  // Student search
  // ---------------------------------------------------------------------------

  function handleSearchInput(value: string) {
    setSearchQuery(value);
    if (!value.trim()) {
      setStudentResults([]);
      return;
    }
    if (searchRef.current) clearTimeout(searchRef.current);
    searchRef.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const result = await requestJson<{ students: StudentResult[] }>(
          `/api/students?search=${encodeURIComponent(value.trim())}&pageSize=10`,
        );
        setStudentResults(result.students);
      } catch {
        // ignore
      } finally {
        setSearchLoading(false);
      }
    }, 300);
  }

  function handleSelectStudent(student: StudentResult) {
    setSelectedStudent(student);
    setSearchQuery("");
    setStudentResults([]);
  }

  function handleClearStudent() {
    setSelectedStudent(null);
    setSearchQuery("");
    setStudentResults([]);
  }

  // ---------------------------------------------------------------------------
  // Course selection — auto-fill amount
  // ---------------------------------------------------------------------------

  function handleCourseChange(id: string) {
    setCourseId(id);
    const course = courses.find((c) => String(c.id) === id);
    if (course) {
      setAmount(String(course.tuitionFee));
    }
  }

  // ---------------------------------------------------------------------------
  // Auto-enrollment toggle / courseType change
  // ---------------------------------------------------------------------------

  function handleAutoEnrollToggle(enabled: boolean) {
    setAutoEnrollEnabled(enabled);
    if (!enabled) {
      setCourseType("");
      setCohortId("");
      setProductId("");
      setSpecialLectureId("");
    }
  }

  function handleCourseTypeChange(value: "COMPREHENSIVE" | "SPECIAL_LECTURE" | "") {
    setCourseType(value);
    setCohortId("");
    setProductId("");
    setSpecialLectureId("");
  }

  // ---------------------------------------------------------------------------
  // Expiry preset
  // ---------------------------------------------------------------------------

  function handleExpiryPreset(preset: string) {
    setExpiryPreset(preset);
    const hours = Number(preset);
    if (hours > 0) {
      setExpiresAt(addHoursToNow(hours));
    }
  }

  // ---------------------------------------------------------------------------
  // Auto-enrollment confirmation label
  // ---------------------------------------------------------------------------

  function getAutoEnrollSummary(): string | null {
    if (!autoEnrollEnabled || !courseType) return null;
    if (!selectedStudent) return null;

    if (courseType === "COMPREHENSIVE") {
      const cohort = cohorts.find((c) => c.id === cohortId);
      if (!cohort) return null;
      return `결제 완료 시 ${selectedStudent.name}을(를) ${cohort.name} 기수에 자동 수강등록합니다`;
    }

    if (courseType === "SPECIAL_LECTURE") {
      const lecture = specialLectures.find((l) => l.id === specialLectureId);
      if (!lecture) return null;
      return `결제 완료 시 ${selectedStudent.name}을(를) ${lecture.name}에 자동 수강등록합니다`;
    }

    return null;
  }

  // ---------------------------------------------------------------------------
  // Submit
  // ---------------------------------------------------------------------------

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("링크 제목을 입력해 주세요.");
      return;
    }
    const parsedAmount = Number(amount);
    if (!parsedAmount || parsedAmount <= 0) {
      setError("결제 금액을 입력해 주세요.");
      return;
    }
    if (!expiresAt) {
      setError("만료일시를 입력해 주세요.");
      return;
    }

    // Validate auto-enrollment fields if enabled
    if (autoEnrollEnabled && courseType) {
      if (courseType === "COMPREHENSIVE" && !cohortId) {
        setError("자동 수강등록: 기수를 선택해 주세요.");
        return;
      }
      if (courseType === "SPECIAL_LECTURE" && !specialLectureId) {
        setError("자동 수강등록: 특강을 선택해 주세요.");
        return;
      }
    }

    startTransition(async () => {
      try {
        const payload: Record<string, unknown> = {
          title: trimmedTitle,
          courseId: courseId ? Number(courseId) : undefined,
          examNumber: selectedStudent?.examNumber,
          amount: parsedAmount,
          discountAmount: Number(discountAmount) || 0,
          allowPoint,
          expiresAt: new Date(expiresAt).toISOString(),
          maxUsage: maxUsage ? Number(maxUsage) : undefined,
          note: note.trim() || undefined,
        };

        // Auto-enrollment fields
        if (autoEnrollEnabled && courseType) {
          payload.courseType = courseType;
          if (courseType === "COMPREHENSIVE") {
            if (cohortId) payload.cohortId = cohortId;
            if (productId) payload.productId = productId;
          } else if (courseType === "SPECIAL_LECTURE") {
            if (specialLectureId) payload.specialLectureId = specialLectureId;
          }
        }

        const data = await requestJson<{ link: { id: number } }>("/api/payment-links", {
          method: "POST",
          body: JSON.stringify(payload),
        });

        router.push(`/admin/payment-links/${data.link.id}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "생성에 실패했습니다.");
      }
    });
  }

  const finalAmount = Math.max(0, (Number(amount) || 0) - (Number(discountAmount) || 0));
  const autoEnrollSummary = getAutoEnrollSummary();

  const inputClass =
    "w-full rounded-2xl border border-ink/15 bg-white px-4 py-2.5 text-sm outline-none focus:border-ember/60 focus:ring-1 focus:ring-ember/30";

  const labelClass = "mb-1.5 block text-xs font-medium text-slate";

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ── 학생 검색 (선택) ──────────────────────────────────── */}
      <div className="rounded-[28px] border border-ink/10 bg-white p-6">
        <h2 className="mb-4 text-sm font-semibold text-forest">학생 연결 (선택)</h2>
        <p className="mb-3 text-xs text-slate">
          특정 학생에게 전용 링크를 발송할 경우 선택합니다. 비워두면 누구나 결제 가능한 범용
          링크가 됩니다.
        </p>

        {selectedStudent ? (
          <div className="flex items-center justify-between rounded-2xl border border-forest/20 bg-forest/5 px-4 py-3">
            <div className="text-sm">
              <span className="font-semibold text-ink">{selectedStudent.name}</span>
              <span className="ml-2 text-slate">학번 {selectedStudent.examNumber}</span>
              {selectedStudent.phone && (
                <span className="ml-2 text-slate">{selectedStudent.phone}</span>
              )}
            </div>
            <button
              type="button"
              onClick={handleClearStudent}
              className="ml-4 rounded-full border border-ink/15 px-3 py-1 text-xs font-medium text-ink transition hover:border-ink/30"
            >
              변경
            </button>
          </div>
        ) : (
          <div className="relative">
            <div className="flex gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearchInput(e.target.value)}
                placeholder="이름 또는 학번으로 검색"
                className={inputClass}
                autoComplete="off"
              />
              {searchLoading && (
                <span className="flex items-center px-2 text-xs text-slate">검색 중…</span>
              )}
            </div>

            {searchResults.length > 0 && (
              <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-2xl border border-ink/15 bg-white py-1 shadow-lg">
                {searchResults.map((s) => (
                  <li key={s.examNumber}>
                    <button
                      type="button"
                      onClick={() => handleSelectStudent(s)}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition hover:bg-mist/50"
                    >
                      <span className="font-medium text-ink">{s.name}</span>
                      <span className="text-xs text-slate">#{s.examNumber}</span>
                      {s.phone && <span className="text-xs text-slate">{s.phone}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {searchQuery.trim() && !searchLoading && searchResults.length === 0 && (
              <p className="mt-2 text-xs text-slate">검색 결과가 없습니다.</p>
            )}
          </div>
        )}
      </div>

      {/* ── 링크 기본 정보 ────────────────────────────────────── */}
      <div className="rounded-[28px] border border-ink/10 bg-white p-6">
        <h2 className="mb-4 text-sm font-semibold text-forest">링크 정보</h2>

        {/* Title */}
        <div className="mb-4">
          <label className={labelClass}>
            링크 제목 <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="예: 2026 공채 종합반 3월 등록"
            required
            className={inputClass}
          />
        </div>

        {/* Course */}
        <div className="mb-4">
          <label className={labelClass}>강좌 연결 (선택)</label>
          <select
            value={courseId}
            onChange={(e) => handleCourseChange(e.target.value)}
            className={inputClass}
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
        <div className="mb-4 grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>
              결제 금액 (원) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              min={1}
              placeholder="600000"
              required
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>할인 금액 (원)</label>
            <input
              type="number"
              value={discountAmount}
              onChange={(e) => setDiscountAmount(e.target.value)}
              min={0}
              placeholder="0"
              className={inputClass}
            />
          </div>
        </div>

        {amount && (
          <div className="mb-4 rounded-2xl border border-forest/15 bg-forest/5 px-4 py-2.5">
            <p className="text-sm font-semibold text-forest">
              최종 결제 금액: {finalAmount.toLocaleString()}원
            </p>
          </div>
        )}

        {/* Allow point */}
        <label className="mb-4 flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={allowPoint}
            onChange={(e) => setAllowPoint(e.target.checked)}
            className="h-4 w-4 rounded border-ink/20 text-ember"
          />
          <span className="text-sm text-ink">포인트 사용 허용</span>
        </label>
      </div>

      {/* ── 만료 설정 ─────────────────────────────────────────── */}
      <div className="rounded-[28px] border border-ink/10 bg-white p-6">
        <h2 className="mb-4 text-sm font-semibold text-forest">만료 설정</h2>

        {/* Expiry presets */}
        <div className="mb-3">
          <label className={labelClass}>
            만료 시간 <span className="text-red-500">*</span>
          </label>
          <div className="mb-3 flex flex-wrap gap-2">
            {EXPIRY_PRESETS.map((preset) => (
              <button
                key={preset.hours}
                type="button"
                onClick={() => handleExpiryPreset(String(preset.hours))}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                  expiryPreset === String(preset.hours)
                    ? "border-ember/40 bg-ember/10 text-ember"
                    : "border-ink/15 text-ink hover:border-ink/30"
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <input
            type="datetime-local"
            value={expiresAt}
            onChange={(e) => {
              setExpiresAt(e.target.value);
              setExpiryPreset("0");
            }}
            required
            className={inputClass}
          />
        </div>

        {/* Max usage */}
        <div>
          <label className={labelClass}>최대 사용 횟수 (비워두면 무제한)</label>
          <input
            type="number"
            value={maxUsage}
            onChange={(e) => setMaxUsage(e.target.value)}
            min={1}
            placeholder="무제한"
            className={inputClass}
          />
        </div>
      </div>

      {/* ── 자동 수강등록 설정 (선택) ─────────────────────────── */}
      <div className="rounded-[28px] border border-ink/10 bg-white p-6">
        {/* Section header with toggle */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-forest">자동 수강등록 설정</h2>
            <p className="mt-0.5 text-xs text-slate">선택 사항 — 결제 완료 시 수강등록을 자동으로 처리합니다</p>
          </div>
          <button
            type="button"
            onClick={() => handleAutoEnrollToggle(!autoEnrollEnabled)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
              autoEnrollEnabled ? "bg-ember" : "bg-ink/20"
            }`}
            aria-pressed={autoEnrollEnabled}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                autoEnrollEnabled ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>

        {autoEnrollEnabled && (
          <div className="mt-5 space-y-4">
            {/* CourseType select */}
            <div>
              <label className={labelClass}>수강 유형</label>
              <select
                value={courseType}
                onChange={(e) =>
                  handleCourseTypeChange(e.target.value as "COMPREHENSIVE" | "SPECIAL_LECTURE" | "")
                }
                className={inputClass}
              >
                <option value="">유형 선택</option>
                <option value="COMPREHENSIVE">종합반</option>
                <option value="SPECIAL_LECTURE">특강 단과</option>
              </select>
            </div>

            {/* COMPREHENSIVE fields */}
            {courseType === "COMPREHENSIVE" && (
              <>
                <div>
                  <label className={labelClass}>
                    기수 <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={cohortId}
                    onChange={(e) => setCohortId(e.target.value)}
                    className={inputClass}
                  >
                    <option value="">기수 선택</option>
                    {cohorts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                        {c.isActive ? "" : " (비활성)"}
                        {" — "}
                        {new Date(c.startDate).toLocaleDateString("ko-KR")}~
                        {new Date(c.endDate).toLocaleDateString("ko-KR")}
                        {" ("}수강 {c.activeCount}명{c.waitlistCount > 0 ? `, 대기 ${c.waitlistCount}명` : ""}{")"}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className={labelClass}>상품 (선택)</label>
                  <select
                    value={productId}
                    onChange={(e) => setProductId(e.target.value)}
                    className={inputClass}
                  >
                    <option value="">상품 선택 없음</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                        {" — "}
                        {p.durationMonths}개월 ({p.salePrice.toLocaleString()}원)
                        {p.isActive ? "" : " (비활성)"}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {/* SPECIAL_LECTURE fields */}
            {courseType === "SPECIAL_LECTURE" && (
              <div>
                <label className={labelClass}>
                  특강 <span className="text-red-500">*</span>
                </label>
                <select
                  value={specialLectureId}
                  onChange={(e) => setSpecialLectureId(e.target.value)}
                  className={inputClass}
                >
                  <option value="">특강 선택</option>
                  {specialLectures.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                      {l.isActive ? "" : " (비활성)"}
                      {" — "}
                      {new Date(l.startDate).toLocaleDateString("ko-KR")}~
                      {new Date(l.endDate).toLocaleDateString("ko-KR")}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Confirmation info card */}
            {autoEnrollSummary && (
              <div className="flex items-start gap-2.5 rounded-2xl border border-forest/20 bg-forest/5 px-4 py-3">
                <span className="mt-0.5 text-base leading-none text-forest" aria-hidden="true">
                  ✓
                </span>
                <p className="text-sm text-forest">{autoEnrollSummary}</p>
              </div>
            )}

            {/* Info note when no student is selected */}
            {!selectedStudent && courseType && (
              <p className="text-xs text-slate">
                학생을 선택하면 자동 수강등록 대상을 미리 확인할 수 있습니다.
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── 메모 ─────────────────────────────────────────────── */}
      <div className="rounded-[28px] border border-ink/10 bg-white p-6">
        <h2 className="mb-4 text-sm font-semibold text-forest">메모 (내부용, 선택)</h2>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="예: 3월 특별 이벤트 링크"
          className={inputClass}
        />
      </div>

      {/* ── 버튼 ─────────────────────────────────────────────── */}
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-full bg-ember px-8 py-2.5 text-sm font-semibold text-white transition hover:bg-ember/90 disabled:opacity-50"
        >
          {isPending ? "생성 중…" : "결제 링크 생성"}
        </button>
        <a
          href="/admin/payments/links"
          className="rounded-full border border-ink/15 px-8 py-2.5 text-sm font-semibold text-ink transition hover:border-ink/30"
        >
          취소
        </a>
      </div>
    </form>
  );
}
