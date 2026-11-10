import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import KakaoInit from "@/components/KakaoInit";
import "./globals.css";

export const metadata: Metadata = {
  title: "KNU 시간표 마법사",
  description: "경북대학교 학생을 위한 시간표 자동 생성 서비스, KNU 시간표 마법사",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full">
      <head>
        <script dangerouslySetInnerHTML={{ __html: `
          try {
            if (localStorage.getItem('theme') === 'dark') {
              document.documentElement.classList.add('dark');
            }
          } catch(e) {}
        ` }} />
      </head>
      <body className="min-h-full flex flex-col">{children}<Analytics /><KakaoInit /></body>
    </html>
  );
}
