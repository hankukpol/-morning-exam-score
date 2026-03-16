import { AdminRole, CourseType, EnrollmentStatus } from "@prisma/client";
import { NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

/* ── 색상 상수 ── */
const FOREST = "FF1F4D3A";
const WHITE = "FFFFFFFF";
const MIST = "FFF7F4EF";
const LIGHT_GRAY = "FFF2F2F2";

/* 수강 상태 레이블 */
const STATUS_LABEL: Record<EnrollmentStatus, string> = {
  PENDING: "신청",
  ACTIVE: "수강 중",
  WAITING: "대기",
  SUSPENDED: "휴원",
  COMPLETED: "수강 완료",
  WITHDRAWN: "퇴원",
  CANCELLED: "취소",
};

/* 수강 유형 레이블 */
const COURSE_TYPE_LABEL: Record<CourseType, string> = {
  COMPREHENSIVE: "종합반",
  SPECIAL_LECTURE: "특강 단과",
};

function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "-";
  const dt = new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

function applyHeaderRow(row: ExcelJS.Row) {
  row.height = 22;
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: WHITE } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: FOREST } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: false };
    cell.border = { bottom: { style: "thin", color: { argb: "FFCCCCCC" } } };
  });
}

export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) {
    return new Response(JSON.stringify({ error: auth.error }), {
      status: auth.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  const sp = request.nextUrl.searchParams;

  // 필터 파싱
  const startDate = sp.get("startDate") ?? "";
  const endDate = sp.get("endDate") ?? "";
  const cohortId = sp.get("cohortId") ?? "";
  const status = sp.get("status") as EnrollmentStatus | null;
  const courseType = sp.get("courseType") as CourseType | null;

  const fromDate = startDate ? new Date(startDate + "T00:00:00") : undefined;
  const toDate = endDate ? new Date(endDate + "T23:59:59") : undefined;

  const where = {
    ...(cohortId ? { cohortId } : {}),
    ...(status ? { status } : {}),
    ...(courseType ? { courseType } : {}),
    ...((fromDate || toDate)
      ? {
          createdAt: {
            ...(fromDate ? { gte: fromDate } : {}),
            ...(toDate ? { lte: toDate } : {}),
          },
        }
      : {}),
  };

  const enrollments = await getPrisma().courseEnrollment.findMany({
    where,
    include: {
      student: { select: { name: true, examNumber: true, phone: true } },
      cohort: { select: { name: true, startDate: true, endDate: true } },
      product: { select: { name: true } },
      specialLecture: { select: { name: true } },
      staff: { select: { name: true } },
    },
    orderBy: { student: { examNumber: "asc" } },
    take: 5000,
  });

  /* ── 워크북 생성 ── */
  const wb = new ExcelJS.Workbook();
  wb.creator = "한국경찰학원";
  wb.created = new Date();

  const ws = wb.addWorksheet("수강대장");

  // 열 너비 설정
  ws.columns = [
    { key: "no", width: 6 },
    { key: "examNumber", width: 14 },
    { key: "name", width: 12 },
    { key: "phone", width: 16 },
    { key: "courseName", width: 30 },
    { key: "courseType", width: 14 },
    { key: "startDate", width: 14 },
    { key: "endDate", width: 14 },
    { key: "finalFee", width: 14 },
    { key: "status", width: 12 },
    { key: "createdAt", width: 14 },
    { key: "staff", width: 12 },
  ];

  // 제목 행
  const today = new Date();
  const todayStr = formatDate(today);
  ws.mergeCells("A1:L1");
  const titleCell = ws.getCell("A1");
  titleCell.value = `한국경찰학원 수강대장 (출력일: ${todayStr})`;
  titleCell.font = { bold: true, size: 14, color: { argb: FOREST } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: MIST } };
  ws.getRow(1).height = 32;

  // 필터 정보 행
  const filterParts: string[] = [];
  if (startDate || endDate) filterParts.push(`등록일: ${startDate || "~"} ~ ${endDate || "현재"}`);
  if (courseType) filterParts.push(`유형: ${COURSE_TYPE_LABEL[courseType]}`);
  if (status) filterParts.push(`상태: ${STATUS_LABEL[status]}`);
  filterParts.push(`총 ${enrollments.length}건`);

  ws.mergeCells("A2:L2");
  const filterCell = ws.getCell("A2");
  filterCell.value = filterParts.join("  |  ");
  filterCell.font = { size: 10, color: { argb: "FF6B7280" } };
  filterCell.alignment = { horizontal: "center", vertical: "middle" };
  filterCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFAFAFA" } };
  ws.getRow(2).height = 18;

  ws.addRow([]); // 빈 행

  // 헤더 행
  const headerRow = ws.addRow([
    "번호", "학번", "성명", "연락처",
    "강좌명", "수강유형", "수강시작일", "수강종료일",
    "수강료", "상태", "등록일", "담당직원",
  ]);
  applyHeaderRow(headerRow);

  // 데이터 행
  enrollments.forEach((enr, idx) => {
    const courseName =
      enr.cohort?.name ??
      enr.specialLecture?.name ??
      enr.product?.name ??
      "-";

    const row = ws.addRow([
      idx + 1,
      enr.student.examNumber,
      enr.student.name,
      enr.student.phone ?? "-",
      courseName,
      COURSE_TYPE_LABEL[enr.courseType],
      formatDate(enr.startDate),
      enr.endDate ? formatDate(enr.endDate) : "-",
      enr.finalFee,
      STATUS_LABEL[enr.status],
      formatDate(enr.createdAt),
      enr.staff?.name ?? "-",
    ]);

    row.height = 18;
    const isEven = idx % 2 === 0;

    row.eachCell((cell) => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: isEven ? WHITE : LIGHT_GRAY },
      };
      cell.border = { bottom: { style: "hair", color: { argb: "FFDDDDDD" } } };
      cell.alignment = { vertical: "middle" };
    });

    // 숫자 포맷
    row.getCell(1).alignment = { horizontal: "center", vertical: "middle" }; // 번호
    row.getCell(2).alignment = { horizontal: "center", vertical: "middle" }; // 학번
    row.getCell(3).alignment = { horizontal: "center", vertical: "middle" }; // 성명
    row.getCell(4).alignment = { horizontal: "center", vertical: "middle" }; // 연락처
    row.getCell(6).alignment = { horizontal: "center", vertical: "middle" }; // 유형
    row.getCell(7).alignment = { horizontal: "center", vertical: "middle" }; // 수강시작
    row.getCell(8).alignment = { horizontal: "center", vertical: "middle" }; // 수강종료
    row.getCell(9).numFmt = '#,##0"원"';
    row.getCell(9).alignment = { horizontal: "right", vertical: "middle" };
    row.getCell(10).alignment = { horizontal: "center", vertical: "middle" }; // 상태
    row.getCell(11).alignment = { horizontal: "center", vertical: "middle" }; // 등록일
    row.getCell(12).alignment = { horizontal: "center", vertical: "middle" }; // 담당
  });

  // 합계 행
  if (enrollments.length > 0) {
    const totalFee = enrollments.reduce((s, e) => s + e.finalFee, 0);
    const totalRow = ws.addRow([
      "", "합  계", `${enrollments.length}명`, "",
      "", "", "", "",
      totalFee, "", "", "",
    ]);
    totalRow.height = 22;
    totalRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: WHITE } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: FOREST } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
    });
    totalRow.getCell(9).numFmt = '#,##0"원"';
  }

  ws.views = [{ state: "frozen", ySplit: 4 }];

  /* ── 응답 ── */
  const buffer = await wb.xlsx.writeBuffer();
  const fileName = `수강대장_${todayStr}.xlsx`;
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
