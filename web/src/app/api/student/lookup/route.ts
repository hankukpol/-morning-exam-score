import { NextResponse } from "next/server";
import { getClientIpAddress } from "@/lib/security";
import {
  clearStudentLookupFailures,
  getStudentLookupRateLimitStatus,
  registerStudentLookupFailure,
} from "@/lib/student-portal/rate-limit";
import { lookupStudentPortalStudent } from "@/lib/student-portal/service";
import {
  clearStudentPortalSession,
  writeStudentPortalSession,
} from "@/lib/student-portal/session";

type RequestBody = {
  examNumber?: string;
  name?: string;
};

const LOOKUP_FAILURE_DELAY_MS = 800;
const LOOKUP_FAILURE_MESSAGE =
  "수험번호와 이름을 다시 확인한 뒤 잠시 후 다시 시도해 주세요.";

function createRateLimitResponse(retryAfterSeconds: number) {
  return NextResponse.json(
    {
      error: "조회 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.",
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSeconds),
      },
    },
  );
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(request: Request) {
  const ipAddress = getClientIpAddress(request);
  let identifier: string | null = null;

  try {
    const body = (await request.json()) as RequestBody;
    identifier = String(body.examNumber ?? "").trim() || null;
    const rateLimit = getStudentLookupRateLimitStatus({ ipAddress, identifier });

    if (!rateLimit.ok) {
      return createRateLimitResponse(rateLimit.retryAfterSeconds ?? 60);
    }

    const student = await lookupStudentPortalStudent({
      examNumber: identifier ?? "",
      name: String(body.name ?? ""),
    });

    clearStudentLookupFailures({ ipAddress, identifier });
    writeStudentPortalSession({
      examNumber: student.examNumber,
      name: student.name,
    });

    return NextResponse.json({ student });
  } catch {
    await delay(LOOKUP_FAILURE_DELAY_MS);
    const rateLimit = registerStudentLookupFailure({ ipAddress, identifier });

    if (!rateLimit.ok) {
      return createRateLimitResponse(rateLimit.retryAfterSeconds ?? 60);
    }

    return NextResponse.json(
      {
        error: LOOKUP_FAILURE_MESSAGE,
      },
      { status: 400 },
    );
  }
}

export async function DELETE() {
  clearStudentPortalSession();
  return NextResponse.json({ success: true });
}
