import {
  AdminRole,
  PaymentCategory,
  PaymentMethod,
  PaymentStatus,
} from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

type RowError = { row: number; reason: string };

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

const METHOD_MAP: Record<string, PaymentMethod> = {
  CASH: "CASH",
  CARD: "CARD",
  TRANSFER: "TRANSFER",
  현금: "CASH",
  카드: "CARD",
  이체: "TRANSFER",
  계좌이체: "TRANSFER",
};

const CATEGORY_MAP: Record<string, PaymentCategory> = {
  TUITION: "TUITION",
  TEXTBOOK: "TEXTBOOK",
  FACILITY: "FACILITY",
  ETC: "ETC",
  수강료: "TUITION",
  교재: "TEXTBOOK",
  시설: "FACILITY",
  기타: "ETC",
};

export async function POST(request: Request) {
  const auth = await requireApiAdmin(AdminRole.DIRECTOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "CSV 파일이 필요합니다." }, { status: 400 });
    }

    const text = await file.text();
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.replace(/^\uFEFF/, "")) // strip BOM
      .filter((l) => l.trim().length > 0);

    if (lines.length < 2) {
      return NextResponse.json({ error: "데이터 행이 없습니다." }, { status: 400 });
    }

    // Skip header row
    const dataLines = lines.slice(1);
    const errors: RowError[] = [];
    let inserted = 0;
    let skipped = 0;

    const adminId = auth.context.adminUser.id;
    const prisma = getPrisma();

    for (let i = 0; i < dataLines.length; i++) {
      const rowNum = i + 2; // 1-based, accounting for header
      const cols = parseCsvLine(dataLines[i]);

      // Columns: 학번, 납부일(YYYY-MM-DD), 납부방법(CASH/CARD/TRANSFER), 수납금액(원), 분류(TUITION/TEXTBOOK/FACILITY/ETC), 비고
      const [examNumberRaw, paidAtStr, methodStr, amountStr, categoryStr, note] = cols;

      const examNumber = examNumberRaw?.trim();
      if (!examNumber) {
        errors.push({ row: rowNum, reason: "학번이 없습니다." });
        continue;
      }
      if (!paidAtStr?.trim()) {
        errors.push({ row: rowNum, reason: "납부일이 없습니다." });
        continue;
      }

      const paidAt = new Date(paidAtStr.trim());
      if (isNaN(paidAt.getTime())) {
        errors.push({ row: rowNum, reason: `납부일 형식 오류: ${paidAtStr}` });
        continue;
      }

      const method: PaymentMethod | undefined = METHOD_MAP[methodStr?.trim().toUpperCase() ?? ""] ?? METHOD_MAP[methodStr?.trim() ?? ""];
      if (!method) {
        errors.push({ row: rowNum, reason: `납부방법 오류: ${methodStr} (CASH/CARD/TRANSFER 중 하나)` });
        continue;
      }

      const amount = Number(amountStr?.replace(/,/g, "") ?? "");
      if (isNaN(amount) || amount <= 0) {
        errors.push({ row: rowNum, reason: `수납금액 오류: ${amountStr}` });
        continue;
      }

      const category: PaymentCategory =
        CATEGORY_MAP[categoryStr?.trim().toUpperCase() ?? ""] ??
        CATEGORY_MAP[categoryStr?.trim() ?? ""] ??
        "TUITION";

      // Lookup student
      const student = await prisma.student.findUnique({
        where: { examNumber },
        select: { examNumber: true },
      });
      if (!student) {
        errors.push({ row: rowNum, reason: `학번 ${examNumber} 학생 없음` });
        skipped++;
        continue;
      }

      // Find most recent ACTIVE enrollment for this student
      const enrollment = await prisma.courseEnrollment.findFirst({
        where: {
          examNumber,
          status: "ACTIVE",
        },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });

      // Create Payment + PaymentItem in a transaction
      await prisma.$transaction(async (tx) => {
        const payment = await tx.payment.create({
          data: {
            examNumber,
            enrollmentId: enrollment?.id ?? null,
            category,
            method,
            status: PaymentStatus.APPROVED,
            grossAmount: amount,
            discountAmount: 0,
            couponAmount: 0,
            pointAmount: 0,
            netAmount: amount,
            note: note?.trim() || null,
            processedBy: adminId,
            processedAt: paidAt,
          },
        });

        await tx.paymentItem.create({
          data: {
            paymentId: payment.id,
            itemType: category,
            itemName:
              category === "TUITION"
                ? "수강료 (마이그레이션)"
                : category === "TEXTBOOK"
                  ? "교재비 (마이그레이션)"
                  : category === "FACILITY"
                    ? "시설비 (마이그레이션)"
                    : "기타 (마이그레이션)",
            unitPrice: amount,
            quantity: 1,
            amount,
          },
        });
      });

      inserted++;
    }

    // Log migration action
    try {
      await getPrisma().auditLog.create({
        data: {
          adminId,
          action: "MIGRATION_PAYMENT_EXECUTE",
          targetType: "Payment",
          targetId: "migration",
          after: {
            fileName: file.name,
            importedCount: inserted,
            skippedCount: skipped,
            errorCount: errors.length,
          },
        },
      });
    } catch {
      // Non-fatal
    }

    return NextResponse.json({ data: { inserted, skipped, errors } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "수납 마이그레이션 실패" },
      { status: 400 },
    );
  }
}
