import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "한국경찰학원 관리시스템",
    template: "%s | 한국경찰학원",
  },
  description: "한국경찰학원 통합 관리 시스템 — 수강·수납·성적·출결 관리",
  manifest: "/manifest.json",
  applicationName: "한국경찰학원",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "한국경찰학원",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    shortcut: ["/icons/icon-192.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#C55A11",
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