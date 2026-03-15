import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "\uC544\uCE68\uBAA8\uC758\uACE0\uC0AC \uC131\uC801\u00B7\uCD9C\uACB0\uAD00\uB9AC",
  description: "\uC544\uCE68\uBAA8\uC758\uACE0\uC0AC \uC6B4\uC601, \uD559\uC0DD \uD3EC\uD138, \uC131\uC801\u00B7\uCD9C\uACB0 \uAD00\uB9AC\uB97C \uC704\uD55C \uC6F9 \uC571",
  manifest: "/manifest.json",
  applicationName: "\uC544\uCE68\uBAA8\uC758\uACE0\uC0AC",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "\uC544\uCE68\uBAA8\uC758\uACE0\uC0AC",
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