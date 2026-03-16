import { notFound } from "next/navigation";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { ContractEditor, type ContractData, type ContractItem } from "./contract-editor";

export const dynamic = "force-dynamic";

const COURSE_TYPE_LABEL: Record<string, string> = {
  COMPREHENSIVE: "종합반",
  SPECIAL_LECTURE: "단과 특강",
};

function formatKorDate(iso: Date | string) {
  const d = new Date(iso);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

function formatShortDate(iso: Date | string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function calcDurationMonths(start: Date, end: Date | null): string {
  if (!end) return "-";
  const months =
    (end.getFullYear() - start.getFullYear()) * 12 +
    (end.getMonth() - start.getMonth());
  return months > 0 ? `${months}개월` : "1개월 미만";
}

export default async function EnrollmentContractPage({
  params,
}: {
  params: { id: string };
}) {
  const { adminUser } = await requireAdminContext(AdminRole.COUNSELOR);

  const prisma = getPrisma();
  const enrollment = await prisma.courseEnrollment.findUnique({
    where: { id: params.id },
    include: {
      student: true,
      cohort: { select: { name: true } },
      product: { select: { name: true } },
      specialLecture: { select: { name: true } },
      staff: { select: { name: true } },
      installments: { orderBy: { dueDate: "asc" } },
    },
  });

  if (!enrollment) notFound();

  // 계약서 DB 레코드 조회 — 없으면 자동 생성
  let contractRecord = await prisma.courseContract.findUnique({
    where: { enrollmentId: params.id },
  });

  if (!contractRecord) {
    const courseName =
      enrollment.cohort?.name ??
      enrollment.specialLecture?.name ??
      enrollment.product?.name ??
      "강좌";
    contractRecord = await prisma.courseContract.create({
      data: {
        enrollmentId: params.id,
        items: [{ label: courseName, amount: enrollment.finalFee }],
        staffId: adminUser.id,
      },
    });
  }

  const contractData: ContractData = {
    id: contractRecord.id,
    enrollmentId: contractRecord.enrollmentId,
    items: contractRecord.items as ContractItem[],
    note: contractRecord.note,
    issuedAt: contractRecord.issuedAt.toISOString(),
    printedAt: contractRecord.printedAt ? contractRecord.printedAt.toISOString() : null,
  };

  // Fetch academy settings for director name
  const settings = await prisma.academySettings.findUnique({ where: { id: 1 } });

  const student = enrollment.student;
  const courseName =
    enrollment.cohort?.name ??
    enrollment.specialLecture?.name ??
    enrollment.product?.name ??
    "강좌 미지정";

  const today = new Date();
  const contractDate = formatKorDate(today);
  const courseTypeLabel = COURSE_TYPE_LABEL[enrollment.courseType] ?? enrollment.courseType;
  const enrollNumber = enrollment.id.slice(-8).toUpperCase();

  // 계약서 인쇄용 항목 (DB 저장 데이터 우선)
  const printItems = contractData.items;
  const printTotal = printItems.reduce((sum, item) => sum + item.amount, 0);

  return (
    <div className="min-h-screen bg-gray-100">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; margin: 0; padding: 0; }
          .contract-page {
            width: 182mm !important;
            min-height: 257mm !important;
            margin: 0 !important;
            padding: 12mm !important;
            box-shadow: none !important;
            border-radius: 0 !important;
          }
          @page { size: B5; margin: 0; }
        }
      `}</style>

      {/* Toolbar */}
      <div className="no-print flex items-center justify-between gap-4 border-b bg-white px-6 py-4">
        <a
          href={`/admin/enrollments/${params.id}`}
          className="inline-flex items-center gap-2 rounded-full border border-gray-200 px-4 py-2 text-sm text-gray-600 transition hover:border-gray-400"
        >
          ← 수강 상세
        </a>
        <span className="text-sm text-gray-500">
          {student.name} · {courseName}
        </span>
      </div>

      {/* 편집 패널 */}
      <ContractEditor enrollmentId={params.id} initial={contractData} />

      {/* Contract */}
      <div className="flex justify-center p-8">
        <div
          className="contract-page w-[700px] bg-white p-12 shadow-xl"
          style={{ fontFamily: "'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif" }}
        >
          {/* Header */}
          <div className="mb-8 text-center">
            <div className="mb-2 text-lg font-bold">한국경찰학원</div>
            <div
              className="border-y border-gray-900 py-3 text-2xl font-bold tracking-[0.3em]"
              style={{ letterSpacing: "0.4em" }}
            >
              수 강 계 약 서
            </div>
            <div className="mt-2 text-sm text-gray-500">
              학원의 설립·운영 및 과외교습에 관한 법률 제14조에 따라 아래와 같이 수강계약을
              체결합니다.
            </div>
          </div>

          {/* 원생 정보 */}
          <Section title="원생 정보">
            <TwoCol
              rows={[
                ["성명", student.name, "학번(수험번호)", student.examNumber],
                ["수강번호", enrollNumber, "연락처", student.phone ?? "-"],
                ["수강 유형", courseTypeLabel, "", ""],
              ]}
            />
          </Section>

          {/* 수강 정보 */}
          <Section title="수강 정보">
            <TwoCol
              rows={[
                ["강좌명", courseName, "수강 유형", courseTypeLabel],
                [
                  "수강 시작",
                  formatShortDate(enrollment.startDate),
                  "수강 종료",
                  enrollment.endDate ? formatShortDate(enrollment.endDate) : "미정",
                ],
                [
                  "수강 기간",
                  calcDurationMonths(enrollment.startDate, enrollment.endDate),
                  "등록일",
                  formatShortDate(enrollment.createdAt),
                ],
              ]}
            />
          </Section>

          {/* 수강료 — items 기반 */}
          <Section title="수강료">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-50">
                  <th className="border border-gray-200 px-3 py-1.5 text-left">항목</th>
                  <th className="border border-gray-200 px-3 py-1.5 text-right w-36">금액</th>
                </tr>
              </thead>
              <tbody>
                {printItems.map((item, i) => (
                  <tr key={i}>
                    <td className="border border-gray-200 px-3 py-1.5">{item.label}</td>
                    <td className="border border-gray-200 px-3 py-1.5 text-right tabular-nums">
                      {item.amount.toLocaleString()}원
                    </td>
                  </tr>
                ))}
                <tr className="bg-gray-50 font-semibold">
                  <td className="border border-gray-200 px-3 py-1.5">합계</td>
                  <td className="border border-gray-200 px-3 py-1.5 text-right tabular-nums">
                    {printTotal.toLocaleString()}원
                  </td>
                </tr>
              </tbody>
            </table>

            {enrollment.installments.length > 1 && (
              <div className="mt-3">
                <p className="mb-1.5 text-xs font-semibold text-gray-600">납부 일정</p>
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="border border-gray-200 px-3 py-1.5 text-left">회차</th>
                      <th className="border border-gray-200 px-3 py-1.5 text-left">납부일</th>
                      <th className="border border-gray-200 px-3 py-1.5 text-right">금액</th>
                    </tr>
                  </thead>
                  <tbody>
                    {enrollment.installments.map((inst, i) => (
                      <tr key={inst.id}>
                        <td className="border border-gray-200 px-3 py-1.5">{i + 1}회</td>
                        <td className="border border-gray-200 px-3 py-1.5">
                          {formatShortDate(inst.dueDate)}
                        </td>
                        <td className="border border-gray-200 px-3 py-1.5 text-right tabular-nums">
                          {inst.amount.toLocaleString()}원
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          {/* 특약사항 */}
          {contractData.note && (
            <Section title="특약사항">
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{contractData.note}</p>
            </Section>
          )}

          {/* 환불 규정 */}
          <Section title="환불 규정 (학원의 설립·운영 및 과외교습에 관한 법률 제18조)">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-50">
                  <th className="border border-gray-200 px-3 py-1.5 text-left">구분</th>
                  <th className="border border-gray-200 px-3 py-1.5 text-left">환불 금액</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["수강 시작 전", "납부한 수강료 전액"],
                  [
                    "수강 시작 후 1개월 이내 (총 수강기간이 1개월 미만인 경우)",
                    "이미 경과한 수업 일수에 해당하는 금액을 공제 후 환불",
                  ],
                  ["수강 기간의 1/3 경과 전", "납부한 수강료의 2/3에 해당하는 금액 환불"],
                  ["수강 기간의 1/2 경과 전", "납부한 수강료의 1/2에 해당하는 금액 환불"],
                  ["수강 기간의 1/2 이후", "환불 불가"],
                ].map(([period, amount]) => (
                  <tr key={period}>
                    <td className="border border-gray-200 px-3 py-1.5">{period}</td>
                    <td className="border border-gray-200 px-3 py-1.5">{amount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>

          {/* 개인정보 동의 */}
          <Section title="개인정보 수집·이용 동의">
            <p className="text-sm text-gray-700 leading-6">
              학원은 수강 관리 및 학원법에 따른 의무 이행을 위해 아래와 같이 개인정보를 수집·이용합니다.
              <br />
              <span className="font-semibold">수집 항목:</span> 성명, 연락처, 생년월일, 수강 내역, 수납 내역
              <br />
              <span className="font-semibold">보유 기간:</span> 수강 종료 후 5년
            </p>
            <div className="mt-3 flex items-center gap-6 text-sm">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="h-4 w-4" />
                <span>동의</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="h-4 w-4" />
                <span>미동의</span>
              </label>
            </div>
          </Section>

          {/* 서명란 */}
          <div className="mt-8 border-t border-gray-900 pt-6">
            <p className="mb-6 text-center text-sm">위 계약 내용을 확인하고 동의합니다.</p>
            <div className="mb-1 text-center text-sm font-semibold">{contractDate}</div>
            <div className="mt-6 grid grid-cols-2 gap-8">
              <div className="text-center">
                <p className="mb-1 text-sm text-gray-600">원생(보호자) 서명</p>
                <div className="h-12 border-b border-gray-400" />
                <p className="mt-1 text-xs text-gray-500">{student.name}</p>
              </div>
              <div className="text-center">
                <p className="mb-1 text-sm text-gray-600">학원 원장 서명</p>
                <div className="h-12 border-b border-gray-400" />
                <p className="mt-1 text-xs text-gray-500">
                  {settings?.directorName ? `원장 ${settings.directorName}` : "한국경찰학원"}
                </p>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-6 border-t border-gray-200 pt-3 text-center text-xs text-gray-400">
            한국경찰학원 · 대구광역시 중구 중앙대로 390 센트럴엠빌딩 · Tel: 053-241-0112
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h3 className="mb-2 border-l-4 border-gray-900 pl-3 text-sm font-bold">{title}</h3>
      <div className="rounded border border-gray-200 p-3">{children}</div>
    </div>
  );
}

function TwoCol({ rows }: { rows: [string, string, string, string][] }) {
  return (
    <table className="w-full text-sm border-collapse">
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            <td className="border border-gray-200 bg-gray-50 px-3 py-1.5 font-semibold text-gray-600 w-[18%] whitespace-nowrap">
              {row[0]}
            </td>
            <td className={`border border-gray-200 px-3 py-1.5 ${row[2] ? "w-[32%]" : "w-[82%]"}`}>
              {row[1]}
            </td>
            {row[2] ? (
              <>
                <td className="border border-gray-200 bg-gray-50 px-3 py-1.5 font-semibold text-gray-600 w-[18%] whitespace-nowrap">
                  {row[2]}
                </td>
                <td className="border border-gray-200 px-3 py-1.5">{row[3]}</td>
              </>
            ) : null}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
