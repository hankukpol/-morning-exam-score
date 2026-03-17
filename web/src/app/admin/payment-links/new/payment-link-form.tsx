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

type Props = {
  courses: CourseOption[];
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

export function PaymentLinkForm({ courses }: Props) {
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

    startTransition(async () => {
      try {
        const payload = {
          title: trimmedTitle,
          courseId: courseId ? Number(courseId) : undefined,
          amount: parsedAmount,
          discountAmount: Number(discountAmount) || 0,
          allowPoint,
          expiresAt: new Date(expiresAt).toISOString(),
          maxUsage: maxUsage ? Number(maxUsage) : undefined,
          note: note.trim() || undefined,
        };

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
