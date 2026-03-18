import { AdminRole, PaymentCategory, PaymentMethod, PaymentStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import {
  createCsvBuffer,
  createDownloadResponse,
  createXlsxBuffer,
  type ExportColumn,
  type ExportFormat,
} from "@/lib/export";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";
import {
  PAYMENT_CATEGORY_LABEL,
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUS_LABEL,
} from "@/lib/constants";
import { formatDate, formatDateTime, formatFileDate } from "@/lib/format";

type PaymentExportRow = {
  processedAt: string;
  examNumber: string;
  studentName: string;
  itemNames: string;
  netAmount: number;
  method: string;
  category: string;
  status: string;
  processedBy: string;
};

const columns: ExportColumn<PaymentExportRow>[] = [
  { header: "수납일", value: (row) => row.processedAt },
  { header: "학번", value: (row) => row.examNumber },
  { header: "이름", value: (row) => row.studentName },
  { header: "과목/과정", value: (row) => row.itemNames },
  { header: "금액", value: (row) => row.netAmount },
  { header: "결제수단", value: (row) => row.method },
  { header: "카테고리", value: (row) => row.category },
  { header: "상태", value: (row) => row.status },
  { header: "처리자", value: (row) => row.processedBy },
];

export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const searchParams = request.nextUrl.searchParams;
  const format = (searchParams.get("format") as ExportFormat | null) ?? "xlsx";
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const method = searchParams.get("method") as PaymentMethod | null;
  const category = searchParams.get("category") as PaymentCategory | null;
  const status = searchParams.get("status") as PaymentStatus | null;

  const fromDate = from ? new Date(from) : undefined;
  const toDate = to ? new Date(`${to}T23:59:59`) : undefined;

  const prisma = getPrisma();

  const payments = await prisma.payment.findMany({
    where: {
      ...(fromDate || toDate
        ? {
            processedAt: {
              ...(fromDate ? { gte: fromDate } : {}),
              ...(toDate ? { lte: toDate } : {}),
            },
          }
        : {}),
      ...(method ? { method } : {}),
      ...(category ? { category } : {}),
      ...(status ? { status } : {}),
    },
    orderBy: { processedAt: "desc" },
    select: {
      id: true,
      processedAt: true,
      examNumber: true,
      category: true,
      method: true,
      status: true,
      netAmount: true,
      student: {
        select: { name: true },
      },
      items: {
        select: { itemName: true },
      },
      processor: {
        select: { email: true },
      },
    },
  });

  const rows: PaymentExportRow[] = payments.map((payment) => ({
    processedAt: formatDateTime(payment.processedAt),
    examNumber: payment.examNumber ?? "",
    studentName: payment.student?.name ?? "",
    itemNames: payment.items.map((item) => item.itemName).join(", "),
    netAmount: payment.netAmount,
    method: PAYMENT_METHOD_LABEL[payment.method],
    category: PAYMENT_CATEGORY_LABEL[payment.category],
    status: PAYMENT_STATUS_LABEL[payment.status],
    processedBy: payment.processor.email,
  }));

  const fileName = `수납내역_${formatFileDate()}.${format}`;
  const buffer =
    format === "csv"
      ? createCsvBuffer(rows, columns)
      : createXlsxBuffer(rows, columns, "Payments");

  return createDownloadResponse(buffer, fileName, format);
}
