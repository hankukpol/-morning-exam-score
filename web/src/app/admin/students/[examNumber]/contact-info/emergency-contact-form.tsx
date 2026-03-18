"use client";

import { useState, useTransition } from "react";

type Props = {
  examNumber: string;
  initialEmergencyContactName: string | null;
  initialEmergencyContactPhone: string | null;
  initialEmergencyContactRelation: string | null;
  initialAddress: string | null;
  initialZipCode: string | null;
};

export function EmergencyContactForm({
  examNumber,
  initialEmergencyContactName,
  initialEmergencyContactPhone,
  initialEmergencyContactRelation,
  initialAddress,
  initialZipCode,
}: Props) {
  const [emergencyContactName, setEmergencyContactName] = useState(
    initialEmergencyContactName ?? "",
  );
  const [emergencyContactRelation, setEmergencyContactRelation] = useState(
    initialEmergencyContactRelation ?? "",
  );
  const [emergencyContactPhone, setEmergencyContactPhone] = useState(
    initialEmergencyContactPhone ?? "",
  );
  const [address, setAddress] = useState(initialAddress ?? "");
  const [zipCode, setZipCode] = useState(initialZipCode ?? "");

  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    startTransition(async () => {
      try {
        const res = await fetch(`/api/students/${examNumber}/contact`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            emergencyContactName: emergencyContactName.trim() || null,
            emergencyContactRelation: emergencyContactRelation.trim() || null,
            emergencyContactPhone: emergencyContactPhone.trim() || null,
            address: address.trim() || null,
            zipCode: zipCode.trim() || null,
          }),
        });

        const data = (await res.json()) as { error?: string };

        if (!res.ok) {
          setError(data.error ?? "저장에 실패했습니다.");
          return;
        }

        setSuccess(true);
      } catch {
        setError("네트워크 오류가 발생했습니다.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {success && (
        <div className="rounded-2xl border border-forest/20 bg-forest/10 px-4 py-3 text-sm text-forest">
          비상연락처 및 주소가 저장되었습니다.
        </div>
      )}
      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* 비상연락처 이름 */}
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-slate">
          비상연락처 이름
        </label>
        <input
          type="text"
          value={emergencyContactName}
          onChange={(e) => setEmergencyContactName(e.target.value)}
          placeholder="홍길동"
          className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest/30"
        />
      </div>

      {/* 관계 */}
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-slate">
          관계
        </label>
        <select
          value={emergencyContactRelation}
          onChange={(e) => setEmergencyContactRelation(e.target.value)}
          className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest/30"
        >
          <option value="">선택</option>
          <option value="어머니">어머니</option>
          <option value="아버지">아버지</option>
          <option value="배우자">배우자</option>
          <option value="형제/자매">형제/자매</option>
          <option value="기타">기타</option>
        </select>
      </div>

      {/* 전화번호 */}
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-slate">
          비상연락처 전화번호
        </label>
        <input
          type="tel"
          value={emergencyContactPhone}
          onChange={(e) => setEmergencyContactPhone(e.target.value)}
          placeholder="010-0000-0000"
          className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest/30"
        />
      </div>

      <hr className="border-ink/10" />

      {/* 우편번호 */}
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-slate">
          우편번호
        </label>
        <input
          type="text"
          value={zipCode}
          onChange={(e) => setZipCode(e.target.value)}
          placeholder="12345"
          maxLength={6}
          className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest/30"
        />
      </div>

      {/* 주소 */}
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-slate">
          주소
        </label>
        <input
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="대구광역시 중구 중앙대로 390"
          className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest/30"
        />
      </div>

      <div className="pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center rounded-full bg-forest px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-forest/90 disabled:opacity-50"
        >
          {isPending ? "저장 중..." : "저장"}
        </button>
      </div>
    </form>
  );
}
