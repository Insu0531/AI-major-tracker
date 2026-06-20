import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "경북대 AI전공 개설과목 조회",
  description: "경북대학교 인공지능전공 개설과목 및 시간표 마법사",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
