"use client";

import { useState } from "react";

type PanelType = "enrollment" | "payment";

const ENROLLMENT_CSV_HEADERS = [
  "학번",
  "수강반명",
  "등록일(YYYY-MM-DD)",
  "시작일(YYYY-MM-DD)",
  "종료일(YYYY-MM-DD)",
  "수강료(원)",
  "할인금액(원)",
  "최종수강료(원)",
  "상태(ACTIVE/COMPLETED/WITHDRAWN)",
  "비고",
].join(",");

const PAYMENT_CSV_HEADERS = [
  "학번",
  "납부일(YYYY-MM-DD)",
  "납부방법(CASH/CARD/TRANSFER)",
  "수납금액(원)",
  "분류(TUITION/TEXTBOOK/FACILITY/ETC)",
  "비고",
].join(",");

function downloadCSV(filename: string, content: string) {
  const BOM = "\uFEFF";
  const blob = new Blob([BOM + content + "\n"], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function EnrollmentPaymentMigrationPanels() {
  const [enrollmentNotice, setEnrollmentNotice] = useState<string | null>(null);
  const [paymentNotice, setPaymentNotice] = useState<string | null>(null);

  function handleEnrollmentDownload() {
    downloadCSV("수강등록_마이그레이션_양식.csv", ENROLLMENT_CSV_HEADERS);
    setEnrollmentNotice("CSV 양식 파일이 다운로드되었습니다. 에듀그램 데이터를 이 양식에 맞게 변환하여 지원팀에 제공하세요.");
  }

  function handlePaymentDownload() {
    downloadCSV("수납내역_마이그레이션_양식.csv", PAYMENT_CSV_HEADERS);
    setPaymentNotice("CSV 양식 파일이 다운로드되었습니다. 에듀그램 데이터를 이 양식에 맞게 변환하여 지원팀에 제공하세요.");
  }

  return (
    <>
      {/* Enrollment migration panel */}
      <section className="rounded-[28px] border border-ink/10 bg-white p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-sky-200 bg-sky-50 text-base font-bold text-sky-700">
            2
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-semibold">수강 등록 내역 가져오기</h2>
            <p className="mt-2 text-sm leading-7 text-slate">
              에듀그램에서 내보낸 수강 등록 내역을 CSV 양식에 맞춰 변환합니다.
              지원 형식: <code className="rounded bg-mist px-1.5 py-0.5 text-xs">CSV</code>{" "}
              (학번, 수강반, 등록일, 수강료, 상태)
            </p>

            <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-7 text-amber-800">
              수강 등록 마이그레이션은 초기 데이터 이관 시 지원팀이 직접 처리합니다.
              아래에서 CSV 양식을 내려받아 데이터를 변환한 뒤 지원팀에 제공해 주세요.
            </div>

            <div className="mt-5">
              <p className="mb-2 text-xs font-medium text-slate uppercase tracking-wide">CSV 컬럼 구조</p>
              <div className="overflow-x-auto rounded-2xl border border-ink/10 bg-mist">
                <table className="min-w-full text-xs">
                  <thead className="border-b border-ink/10 bg-mist/80">
                    <tr>
                      {["학번", "수강반명", "등록일", "시작일", "종료일", "수강료", "할인금액", "최종수강료", "상태", "비고"].map((col) => (
                        <th key={col} className="px-3 py-2 text-left font-semibold text-slate whitespace-nowrap">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="text-slate/70">
                      <td className="px-3 py-2 font-mono whitespace-nowrap">2024001</td>
                      <td className="px-3 py-2 whitespace-nowrap">공채 1기 A반</td>
                      <td className="px-3 py-2 font-mono whitespace-nowrap">2024-03-01</td>
                      <td className="px-3 py-2 font-mono whitespace-nowrap">2024-03-04</td>
                      <td className="px-3 py-2 font-mono whitespace-nowrap">2024-03-29</td>
                      <td className="px-3 py-2 whitespace-nowrap">800000</td>
                      <td className="px-3 py-2 whitespace-nowrap">0</td>
                      <td className="px-3 py-2 whitespace-nowrap">800000</td>
                      <td className="px-3 py-2 whitespace-nowrap">ACTIVE</td>
                      <td className="px-3 py-2 whitespace-nowrap">—</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleEnrollmentDownload}
                className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest"
              >
                CSV 양식 다운로드
              </button>
              <button
                type="button"
                disabled
                className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-mist px-5 py-3 text-sm font-semibold text-slate cursor-not-allowed"
                title="지원팀 직접 처리"
              >
                파일 선택 (준비 중)
              </button>
            </div>

            {enrollmentNotice && (
              <div className="mt-4 rounded-2xl border border-forest/20 bg-forest/10 px-4 py-3 text-sm text-forest">
                {enrollmentNotice}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Payment migration panel */}
      <section className="rounded-[28px] border border-ink/10 bg-white p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-purple-200 bg-purple-50 text-base font-bold text-purple-700">
            3
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-semibold">수납 내역 가져오기</h2>
            <p className="mt-2 text-sm leading-7 text-slate">
              에듀그램에서 내보낸 수납 내역을 CSV 양식에 맞춰 변환합니다.
              지원 형식: <code className="rounded bg-mist px-1.5 py-0.5 text-xs">CSV</code>{" "}
              (학번, 납부일, 금액, 납부방법)
            </p>

            <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-7 text-amber-800">
              수납 내역 마이그레이션은 초기 데이터 이관 시 지원팀이 직접 처리합니다.
              아래에서 CSV 양식을 내려받아 데이터를 변환한 뒤 지원팀에 제공해 주세요.
            </div>

            <div className="mt-5">
              <p className="mb-2 text-xs font-medium text-slate uppercase tracking-wide">CSV 컬럼 구조</p>
              <div className="overflow-x-auto rounded-2xl border border-ink/10 bg-mist">
                <table className="min-w-full text-xs">
                  <thead className="border-b border-ink/10 bg-mist/80">
                    <tr>
                      {["학번", "납부일", "납부방법", "수납금액(원)", "분류", "비고"].map((col) => (
                        <th key={col} className="px-3 py-2 text-left font-semibold text-slate whitespace-nowrap">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="text-slate/70">
                      <td className="px-3 py-2 font-mono whitespace-nowrap">2024001</td>
                      <td className="px-3 py-2 font-mono whitespace-nowrap">2024-03-04</td>
                      <td className="px-3 py-2 whitespace-nowrap">CASH</td>
                      <td className="px-3 py-2 whitespace-nowrap">800000</td>
                      <td className="px-3 py-2 whitespace-nowrap">TUITION</td>
                      <td className="px-3 py-2 whitespace-nowrap">—</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handlePaymentDownload}
                className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest"
              >
                CSV 양식 다운로드
              </button>
              <button
                type="button"
                disabled
                className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-mist px-5 py-3 text-sm font-semibold text-slate cursor-not-allowed"
                title="지원팀 직접 처리"
              >
                파일 선택 (준비 중)
              </button>
            </div>

            {paymentNotice && (
              <div className="mt-4 rounded-2xl border border-forest/20 bg-forest/10 px-4 py-3 text-sm text-forest">
                {paymentNotice}
              </div>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
