import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "아침모의고사 성적·출결관리",
  description: "Next.js 14 + Supabase + Prisma 기반 운영 전환 프로젝트",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
