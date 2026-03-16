import { AdminRole } from "@prisma/client";
import { NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

/* ── 색상 상수 ── */
const FOREST = "FF1F4D3A";
const EMBER = "FFC55A11";
const MIST = "FFF7F4EF";
const LIGHT_GRAY = "FFF2F2F2";
const WHITE = "FFFFFFFF";
const RED = "FFDC2626";

function parseMonthParam(param: string | null): { year: number; month: number } {
  if (param && /^\d{4}-\d{2}$/.test(param)) {
    const [y, m] = param.split("-").map(Number);
    if (m >= 1 && m <= 12) return { year: y, month: m };
  }
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

/* 카테고리 한글 레이블 */
const CATEGORY_LABEL: Record<string, string> = {
  TUITION: "수강료",
  FACILITY: "시설비",
  TEXTBOOK: "교재",
  MATERIAL: "교구·소모품",
  SINGLE_COURSE: "단과 POS",
  PENALTY: "위약금",
  ETC: "기타",
};

/* 결제 수단 한글 레이블 */
const METHOD_LABEL: Record<string, string> = {
  CASH: "현금",
  CARD: "카드",
  TRANSFER: "계좌이체",
  ONLINE: "온라인",
};

/* 헤더 행 스타일 helper */
function applyHeaderRow(row: ExcelJS.Row) {
  row.height = 22;
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: WHITE } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: FOREST } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = { bottom: { style: "thin", color: { argb: "FFCCCCCC" } } };
  });
}

/* 합계 행 스타일 helper */
function applyTotalRow(row: ExcelJS.Row) {
  row.height = 24;
  row.eachCell((cell) => {
    cell.font = { bold: true, size: 11, color: { argb: WHITE } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: FOREST } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = { top: { style: "medium", color: { argb: "FF000000" } } };
  });
}

export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);
  if (!auth.ok) {
    return new Response(JSON.stringify({ error: auth.error }), {
      status: auth.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  const sp = request.nextUrl.searchParams;
  const { year, month } = parseMonthParam(sp.get("month"));
  const monthStr = `${year}-${String(month).padStart(2, "0")}`;

  const startOfMonth = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);

  const paidStatuses = ["APPROVED", "PARTIAL_REFUNDED"] as const;

  /* ── DB 조회 ── */
  const [allPayments, allRefunds] = await getPrisma().$transaction([
    getPrisma().payment.findMany({
      where: {
        status: { in: [...paidStatuses] },
        processedAt: { gte: startOfMonth, lte: endOfMonth },
      },
      select: {
        category: true,
        method: true,
        grossAmount: true,
        netAmount: true,
        processedAt: true,
      },
    }),
    getPrisma().refund.findMany({
      where: {
        processedAt: { gte: startOfMonth, lte: endOfMonth },
      },
      select: {
        amount: true,
        processedAt: true,
      },
    }),
  ]);

  /* ── 집계 ── */
  const refundTotal = allRefunds.reduce((s, r) => s + r.amount, 0);
  const grossTotal = allPayments.reduce((s, p) => s + p.grossAmount, 0);
  const netTotal = grossTotal - refundTotal;
  const totalCount = allPayments.length;

  // 카테고리별
  const categoryMap: Record<string, { count: number; gross: number; refund: number }> = {};
  for (const p of allPayments) {
    if (!categoryMap[p.category]) categoryMap[p.category] = { count: 0, gross: 0, refund: 0 };
    categoryMap[p.category].count += 1;
    categoryMap[p.category].gross += p.grossAmount;
  }

  // 결제수단별
  const methodMap: Record<string, { count: number; gross: number }> = {};
  for (const p of allPayments) {
    if (!methodMap[p.method]) methodMap[p.method] = { count: 0, gross: 0 };
    methodMap[p.method].count += 1;
    methodMap[p.method].gross += p.grossAmount;
  }

  // 일별
  const daysInMonth = new Date(year, month, 0).getDate();
  type DailyRow = { day: number; date: string; count: number; gross: number; refund: number; net: number };
  const dailyRows: DailyRow[] = [];

  for (let day = 1; day <= daysInMonth; day++) {
    const dayStart = new Date(year, month - 1, day, 0, 0, 0, 0).getTime();
    const dayEnd = new Date(year, month - 1, day, 23, 59, 59, 999).getTime();

    const dayPayments = allPayments.filter((p) => {
      const t = new Date(p.processedAt).getTime();
      return t >= dayStart && t <= dayEnd;
    });
    const dayRefunds = allRefunds.filter((r) => {
      const t = new Date(r.processedAt).getTime();
      return t >= dayStart && t <= dayEnd;
    });

    if (dayPayments.length > 0 || dayRefunds.length > 0) {
      const dayGross = dayPayments.reduce((s, p) => s + p.grossAmount, 0);
      const dayRefund = dayRefunds.reduce((s, r) => s + r.amount, 0);
      dailyRows.push({
        day,
        date: `${monthStr}-${String(day).padStart(2, "0")}`,
        count: dayPayments.length,
        gross: dayGross,
        refund: dayRefund,
        net: dayGross - dayRefund,
      });
    }
  }

  /* ── 워크북 생성 ── */
  const wb = new ExcelJS.Workbook();
  wb.creator = "한국경찰학원";
  wb.created = new Date();

  const korMonth = `${year}년 ${month}월`;

  /* ════════════════════════════════════════════════════
     Sheet 1: 월 요약 (카테고리별)
  ════════════════════════════════════════════════════ */
  const ws1 = wb.addWorksheet("월 요약");
  ws1.columns = [
    { key: "label", width: 20 },
    { key: "count", width: 10 },
    { key: "gross", width: 18 },
    { key: "refund", width: 18 },
    { key: "net", width: 18 },
  ];

  // 제목
  ws1.mergeCells("A1:E1");
  const t1 = ws1.getCell("A1");
  t1.value = `${korMonth} 월계표 — 유형별 수납 집계`;
  t1.font = { bold: true, size: 14, color: { argb: FOREST } };
  t1.alignment = { horizontal: "center", vertical: "middle" };
  t1.fill = { type: "pattern", pattern: "solid", fgColor: { argb: MIST } };
  ws1.getRow(1).height = 32;
  ws1.addRow([]);

  // 헤더
  const h1 = ws1.addRow(["유형", "건수", "수납액", "환불액", "실수입"]);
  applyHeaderRow(h1);

  // 데이터
  const categoryKeys = ["TUITION", "FACILITY", "TEXTBOOK", "MATERIAL", "SINGLE_COURSE", "PENALTY", "ETC"];
  for (const key of categoryKeys) {
    const stat = categoryMap[key];
    if (!stat) continue;
    const net = stat.gross - stat.refund;
    const row = ws1.addRow([
      CATEGORY_LABEL[key] ?? key,
      stat.count,
      stat.gross,
      stat.refund > 0 ? -stat.refund : 0,
      net,
    ]);
    row.height = 18;
    row.getCell(2).alignment = { horizontal: "right" };
    row.getCell(3).numFmt = '#,##0"원"';
    row.getCell(4).numFmt = '#,##0"원"';
    row.getCell(5).numFmt = '#,##0"원"';
    row.getCell(5).font = { color: { argb: FOREST } };
    if (stat.refund > 0) row.getCell(4).font = { color: { argb: RED } };
    row.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: WHITE } };
      cell.border = { bottom: { style: "hair", color: { argb: "FFDDDDDD" } } };
    });
  }

  // 합계 행
  const tot1 = ws1.addRow(["합 계", totalCount, grossTotal, refundTotal > 0 ? -refundTotal : 0, netTotal]);
  applyTotalRow(tot1);
  tot1.getCell(3).numFmt = '#,##0"원"';
  tot1.getCell(4).numFmt = '#,##0"원"';
  tot1.getCell(5).numFmt = '#,##0"원"';
  ws1.views = [{ state: "frozen", ySplit: 3 }];

  /* ════════════════════════════════════════════════════
     Sheet 2: 일별 수납 내역
  ════════════════════════════════════════════════════ */
  const ws2 = wb.addWorksheet("일별 수납");
  ws2.columns = [
    { key: "date", width: 16 },
    { key: "count", width: 10 },
    { key: "gross", width: 18 },
    { key: "refund", width: 18 },
    { key: "net", width: 18 },
  ];

  // 제목
  ws2.mergeCells("A1:E1");
  const t2 = ws2.getCell("A1");
  t2.value = `${korMonth} 일별 수납 내역`;
  t2.font = { bold: true, size: 14, color: { argb: FOREST } };
  t2.alignment = { horizontal: "center", vertical: "middle" };
  t2.fill = { type: "pattern", pattern: "solid", fgColor: { argb: MIST } };
  ws2.getRow(1).height = 32;
  ws2.addRow([]);

  // 헤더
  const h2 = ws2.addRow(["날짜", "건수", "수납액", "환불액", "실수입"]);
  applyHeaderRow(h2);

  // 데이터
  for (const entry of dailyRows) {
    // 요일 계산
    const dt = new Date(entry.date + "T00:00:00");
    const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
    const dateLabel = `${month}/${entry.day}(${weekdays[dt.getDay()]})`;

    const row = ws2.addRow([
      dateLabel,
      entry.count,
      entry.gross,
      entry.refund > 0 ? -entry.refund : 0,
      entry.net,
    ]);
    row.height = 18;
    row.getCell(1).alignment = { horizontal: "center" };
    row.getCell(2).alignment = { horizontal: "right" };
    row.getCell(3).numFmt = '#,##0"원"';
    row.getCell(4).numFmt = '#,##0"원"';
    row.getCell(5).numFmt = '#,##0"원"';
    row.getCell(5).font = { color: { argb: FOREST } };
    if (entry.refund > 0) row.getCell(4).font = { color: { argb: RED } };
    row.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: WHITE } };
      cell.border = { bottom: { style: "hair", color: { argb: "FFDDDDDD" } } };
    });
  }

  if (dailyRows.length === 0) {
    const emptyRow = ws2.addRow(["수납 내역 없음", "", "", "", ""]);
    ws2.mergeCells(`A${emptyRow.number}:E${emptyRow.number}`);
    emptyRow.getCell(1).alignment = { horizontal: "center" };
    emptyRow.getCell(1).font = { color: { argb: "FF9CA3AF" } };
  } else {
    // 합계 행
    const tot2 = ws2.addRow(["합 계", totalCount, grossTotal, refundTotal > 0 ? -refundTotal : 0, netTotal]);
    applyTotalRow(tot2);
    tot2.getCell(3).numFmt = '#,##0"원"';
    tot2.getCell(4).numFmt = '#,##0"원"';
    tot2.getCell(5).numFmt = '#,##0"원"';
  }
  ws2.views = [{ state: "frozen", ySplit: 3 }];

  /* ════════════════════════════════════════════════════
     Sheet 3: 결제 수단별 합계
  ════════════════════════════════════════════════════ */
  const ws3 = wb.addWorksheet("결제수단별");
  ws3.columns = [
    { key: "method", width: 18 },
    { key: "count", width: 10 },
    { key: "gross", width: 18 },
    { key: "ratio", width: 12 },
  ];

  // 제목
  ws3.mergeCells("A1:D1");
  const t3 = ws3.getCell("A1");
  t3.value = `${korMonth} 결제 수단별 합계`;
  t3.font = { bold: true, size: 14, color: { argb: FOREST } };
  t3.alignment = { horizontal: "center", vertical: "middle" };
  t3.fill = { type: "pattern", pattern: "solid", fgColor: { argb: MIST } };
  ws3.getRow(1).height = 32;
  ws3.addRow([]);

  // 헤더
  const h3 = ws3.addRow(["결제 수단", "건수", "수납액", "비율"]);
  applyHeaderRow(h3);

  // 데이터
  const methodKeys = ["CASH", "CARD", "TRANSFER", "ONLINE"];
  for (const key of methodKeys) {
    const stat = methodMap[key];
    if (!stat) continue;
    const ratio = grossTotal > 0 ? stat.gross / grossTotal : 0;
    const row = ws3.addRow([
      METHOD_LABEL[key] ?? key,
      stat.count,
      stat.gross,
      ratio,
    ]);
    row.height = 18;
    row.getCell(2).alignment = { horizontal: "right" };
    row.getCell(3).numFmt = '#,##0"원"';
    row.getCell(3).font = { color: { argb: EMBER } };
    row.getCell(4).numFmt = "0.0%";
    row.getCell(4).alignment = { horizontal: "right" };
    row.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: WHITE } };
      cell.border = { bottom: { style: "hair", color: { argb: "FFDDDDDD" } } };
    });
  }

  // 합계 행
  const tot3 = ws3.addRow(["합 계", totalCount, grossTotal, 1]);
  applyTotalRow(tot3);
  tot3.getCell(3).numFmt = '#,##0"원"';
  tot3.getCell(4).numFmt = "0.0%";
  ws3.views = [{ state: "frozen", ySplit: 3 }];

  /* ── 응답 ── */
  const buffer = await wb.xlsx.writeBuffer();
  const fileName = `월계표_${monthStr}.xlsx`;
  const encodedName = encodeURIComponent(fileName);

  return new Response(buffer as ArrayBuffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${encodedName}"; filename*=UTF-8''${encodedName}`,
      "Cache-Control": "no-store",
    },
  });
}
