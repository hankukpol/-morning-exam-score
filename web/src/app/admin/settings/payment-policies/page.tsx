import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { DiscountCodeManager } from "./discount-code-manager";

export const dynamic = "force-dynamic";

export type DiscountCodeRow = {
  id: number;
  code: string;
  type: "REFERRAL" | "ENROLLMENT" | "CAMPAIGN";
  discountType: "RATE" | "FIXED";
  discountValue: number;
  maxUsage: number | null;
  usageCount: number;
  validFrom: string;
  validUntil: string | null;
  isActive: boolean;
  staffName: string;
  createdAt: string;
};

// 9가지 할인 유형 (확정된 비즈니스 규칙)
const DISCOUNT_TYPES = [
  {
    id: 1,
    name: "동시수강할인",
    description: "동일 기수 2개 이상 강좌 동시 수강 시",
    value: "50만원 한도",
    type: "FIXED" as const,
    category: "재수강·복합",
  },
  {
    id: 2,
    name: "형제할인",
    description: "형제·자매가 동일 학원 수강 중인 경우",
    value: "100만원 한도",
    type: "FIXED" as const,
    category: "가족",
  },
  {
    id: 3,
    name: "경찰행정학과",
    description: "경찰행정학과 재학·졸업생 증빙 제출 시",
    value: "100만원 한도",
    type: "FIXED" as const,
    category: "자격",
  },
  {
    id: 4,
    name: "직계가족",
    description: "직계가족(부모·자녀) 수강 중인 경우",
    value: "100만원 한도",
    type: "FIXED" as const,
    category: "가족",
  },
  {
    id: 5,
    name: "종합반재수강",
    description: "종합반 재수강(동일 과정 재등록)",
    value: "30% 할인",
    type: "RATE" as const,
    category: "재수강·복합",
  },
  {
    id: 6,
    name: "이론반재수강",
    description: "이론반 재수강(동일 과정 재등록)",
    value: "50% 할인",
    type: "RATE" as const,
    category: "재수강·복합",
  },
  {
    id: 7,
    name: "인강생혜택",
    description: "자체 인터넷강의 수강생 대면 등록 시",
    value: "50% 할인",
    type: "RATE" as const,
    category: "제휴",
  },
  {
    id: 8,
    name: "타학원환승",
    description: "타 경찰학원에서 환승 등록 시 (증빙 필요)",
    value: "30% 할인",
    type: "RATE" as const,
    category: "제휴",
  },
  {
    id: 9,
    name: "관리자직접입력",
    description: "원장·교무 재량으로 직접 금액·비율 지정",
    value: "직접 입력",
    type: "MANUAL" as const,
    category: "재량",
  },
];

const CATEGORY_COLORS: Record<string, string> = {
  "재수강·복합": "border-ember/20 bg-ember/10 text-ember",
  "가족": "border-forest/20 bg-forest/10 text-forest",
  "자격": "border-blue-200 bg-blue-50 text-blue-700",
  "제휴": "border-purple-200 bg-purple-50 text-purple-700",
  "재량": "border-ink/10 bg-mist text-slate",
};

const VALUE_TYPE_COLORS: Record<string, string> = {
  FIXED: "text-ember font-semibold",
  RATE: "text-forest font-semibold",
  MANUAL: "text-slate font-semibold",
};

export default async function PaymentPoliciesPage() {
  await requireAdminContext(AdminRole.DIRECTOR);

  const codes = await getPrisma().discountCode.findMany({
    orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
    include: { staff: { select: { name: true } } },
  });

  const rows: DiscountCodeRow[] = codes.map((c) => ({
    id: c.id,
    code: c.code,
    type: c.type as "REFERRAL" | "ENROLLMENT" | "CAMPAIGN",
    discountType: c.discountType as "RATE" | "FIXED",
    discountValue: c.discountValue,
    maxUsage: c.maxUsage,
    usageCount: c.usageCount,
    validFrom: c.validFrom.toISOString().split("T")[0],
    validUntil: c.validUntil ? c.validUntil.toISOString().split("T")[0] : null,
    isActive: c.isActive,
    staffName: c.staff.name,
    createdAt: c.createdAt.toISOString(),
  }));

  return (
    <div className="p-8 sm:p-10">
      {/* 헤더 */}
      <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        수납 설정
      </div>
      <h1 className="mt-5 text-3xl font-semibold">수납 정책 관리</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        한국경찰학원 확정 할인 유형 9가지와 할인 코드를 관리합니다.
        최대 2개 중복 적용, 합산 상한 50만 원 규칙이 적용됩니다.
      </p>

      {/* 섹션 1: 할인 유형 참조표 */}
      <div className="mt-10">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-ink">할인 유형 참조표</h2>
            <p className="mt-1 text-sm text-slate">
              수납 등록 시 적용 가능한 9가지 할인 유형입니다. 실제 적용은 수납 등록 화면에서
              수행합니다.
            </p>
          </div>
          <div className="shrink-0 rounded-[20px] border border-amber-200 bg-amber-50 px-5 py-3.5 text-right">
            <p className="text-xs font-semibold text-amber-800">중복 적용 규칙</p>
            <p className="mt-0.5 text-sm font-bold text-amber-900">최대 2개 중복</p>
            <p className="mt-0.5 text-xs text-amber-700">합산 상한 50만 원</p>
          </div>
        </div>

        <div className="mt-5 overflow-hidden rounded-[28px] border border-ink/10 shadow-panel">
          <table className="min-w-full divide-y divide-ink/10 text-sm">
            <thead className="bg-mist/80 text-left">
              <tr>
                <th className="w-8 px-5 py-3.5 text-xs font-semibold text-slate">#</th>
                <th className="px-5 py-3.5 font-semibold">할인 유형</th>
                <th className="px-5 py-3.5 font-semibold">적용 조건</th>
                <th className="px-5 py-3.5 font-semibold">카테고리</th>
                <th className="px-5 py-3.5 text-right font-semibold">할인 기준</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/10 bg-white">
              {DISCOUNT_TYPES.map((dt) => (
                <tr key={dt.id} className="transition hover:bg-mist/40">
                  <td className="px-5 py-3.5 text-xs text-slate/60">{dt.id}</td>
                  <td className="px-5 py-3.5 font-semibold text-ink">{dt.name}</td>
                  <td className="px-5 py-3.5 text-slate">{dt.description}</td>
                  <td className="px-5 py-3.5">
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${CATEGORY_COLORS[dt.category] ?? ""}`}
                    >
                      {dt.category}
                    </span>
                  </td>
                  <td className={`px-5 py-3.5 text-right ${VALUE_TYPE_COLORS[dt.type]}`}>
                    {dt.value}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 중복 규칙 상세 안내 */}
        <div className="mt-4 rounded-[20px] border border-ink/5 bg-mist/60 px-6 py-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate">
            할인 중복 적용 규칙
          </p>
          <ul className="mt-3 space-y-1.5 text-sm text-slate">
            <li className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0 text-ember">·</span>
              <span>
                동일 수납 건에 최대 <strong className="text-ink">2개</strong> 할인 유형을 중복
                적용할 수 있습니다.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0 text-ember">·</span>
              <span>
                중복 적용 시 합산 할인 금액은 <strong className="text-ink">50만 원 상한</strong>이
                적용됩니다.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0 text-ember">·</span>
              <span>
                <strong className="text-ink">관리자직접입력</strong>은 원장·교무 권한(DIRECTOR↑)이
                있어야 입력 가능합니다.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0 text-ember">·</span>
              <span>
                할인 유형 기준 금액 변경이 필요한 경우 원장 또는 개발팀에 문의하세요.
              </span>
            </li>
          </ul>
        </div>
      </div>

      {/* 섹션 2: 할인 코드 관리 */}
      <div className="mt-12">
        <h2 className="text-xl font-semibold text-ink">할인 코드 관리</h2>
        <p className="mt-1 text-sm text-slate">
          추천인 코드, 입소 코드, 캠페인 코드를 발급하고 관리합니다. 코드는 수납 등록 시 적용할 수
          있습니다.
        </p>
        <div className="mt-5">
          <DiscountCodeManager initialCodes={rows} />
        </div>
      </div>
    </div>
  );
}
