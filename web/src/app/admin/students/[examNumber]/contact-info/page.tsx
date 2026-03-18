import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { ContactInfoForm } from "./contact-info-form";
import { EmergencyContactForm } from "./emergency-contact-form";

export const dynamic = "force-dynamic";

function formatKorDate(date: Date): string {
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
}

export default async function StudentContactInfoPage({
  params,
}: {
  params: { examNumber: string };
}) {
  const { examNumber } = await Promise.resolve(params);
  await requireAdminContext(AdminRole.COUNSELOR);

  const prisma = getPrisma();
  const student = await prisma.student.findUnique({
    where: { examNumber },
    select: {
      examNumber: true,
      name: true,
      phone: true,
      birthDate: true,
      examType: true,
      studentType: true,
      generation: true,
      className: true,
      onlineId: true,
      registeredAt: true,
      note: true,
      emergencyContactName: true,
      emergencyContactPhone: true,
      emergencyContactRelation: true,
      address: true,
      zipCode: true,
    },
  });

  if (!student) notFound();

  const birthDateStr = student.birthDate
    ? student.birthDate.toISOString().split("T")[0]
    : null;
  const registeredAtStr = student.registeredAt
    ? student.registeredAt.toISOString().split("T")[0]
    : null;

  return (
    <div
      className="min-h-screen bg-[#F7F4EF]"
      style={{ fontFamily: "'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif" }}
    >
      {/* 상단 네비게이션 */}
      <div className="border-b border-ink/10 bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <Link
            href={`/admin/students/${examNumber}`}
            className="inline-flex items-center gap-2 rounded-full border border-ink/10 px-4 py-2 text-sm text-slate transition hover:border-ink/30"
          >
            ← {student.name}
          </Link>
          <span className="text-base font-semibold text-ink">연락처 정보</span>
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-6 py-10 space-y-6">

        {/* 학생 헤더 */}
        <div className="rounded-[28px] border border-ink/10 bg-white p-6">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-forest/10 text-lg font-bold text-forest">
              {student.name.charAt(0)}
            </div>
            <div>
              <p className="text-xl font-semibold text-ink">{student.name}</p>
              <p className="text-sm text-slate">학번 {student.examNumber}</p>
            </div>
          </div>
        </div>

        {/* 현재 연락처 정보 (읽기 전용 요약) */}
        <div className="rounded-[28px] border border-ink/10 bg-white p-6">
          <h2 className="mb-4 text-base font-semibold text-ink">현재 등록된 정보</h2>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate">연락처</dt>
              <dd className="mt-1 text-ink">{student.phone ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate">생년월일</dt>
              <dd className="mt-1 text-ink">
                {student.birthDate ? formatKorDate(student.birthDate) : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate">개인정보 동의일</dt>
              <dd className="mt-1 text-ink">
                {student.registeredAt ? formatKorDate(student.registeredAt) : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate">수험 종류</dt>
              <dd className="mt-1 text-ink">{student.examType}</dd>
            </div>
          </dl>
        </div>

        {/* 연락처 편집 폼 */}
        <div className="rounded-[28px] border border-ink/10 bg-white p-6">
          <h2 className="mb-1 text-base font-semibold text-ink">연락처 수정</h2>
          <p className="mb-5 text-sm text-slate">연락처와 생년월일을 수정할 수 있습니다.</p>
          <ContactInfoForm
            examNumber={student.examNumber}
            initialPhone={student.phone}
            initialBirthDate={birthDateStr}
            name={student.name}
            examType={student.examType}
            studentType={student.studentType}
            generation={student.generation}
            className={student.className}
            onlineId={student.onlineId}
            registeredAt={registeredAtStr}
            note={student.note}
          />
        </div>

        {/* 비상연락처 / 주소 */}
        <div className="rounded-[28px] border border-ink/10 bg-white p-6">
          <h2 className="mb-1 text-base font-semibold text-ink">비상연락처 / 주소</h2>
          <p className="mb-5 text-sm text-slate">비상시 연락 가능한 보호자 정보와 주소를 입력합니다.</p>
          <EmergencyContactForm
            examNumber={student.examNumber}
            initialEmergencyContactName={student.emergencyContactName}
            initialEmergencyContactPhone={student.emergencyContactPhone}
            initialEmergencyContactRelation={student.emergencyContactRelation}
            initialAddress={student.address}
            initialZipCode={student.zipCode}
          />
        </div>
      </div>
    </div>
  );
}
