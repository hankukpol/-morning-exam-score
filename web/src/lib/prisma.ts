import { Prisma, PrismaClient } from "@/generated/prisma";

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient | undefined;
}

export function getPrisma() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured.");
  }

  if (!globalThis.prismaGlobal) {
    globalThis.prismaGlobal = new PrismaClient({
      log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    });
  }

  return globalThis.prismaGlobal;
}

const PRISMA_READ_RETRY_DELAY_MS = 75;
const PRISMA_READ_RETRY_COUNT = 2;

export function isRetryablePrismaReadError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P1017"
  );
}

export async function withPrismaReadRetry<T>(operation: () => Promise<T>) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= PRISMA_READ_RETRY_COUNT || !isRetryablePrismaReadError(error)) {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, PRISMA_READ_RETRY_DELAY_MS * (attempt + 1)));
    }
  }
}
