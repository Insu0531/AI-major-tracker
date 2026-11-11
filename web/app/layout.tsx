import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import KakaoInit from "@/components/KakaoInit";
import "./globals.css";

export const metadata: Metadata = {
  // 카톡·SNS 링크 미리보기(og:image는 app/opengraph-image.png)가 절대 주소를 쓰도록
  metadataBase: new URL("https://knuclass.vercel.app"),
  title: "KNU 시간표 마법사",
  description: "경북대학교 학생을 위한 시간표 자동 생성 서비스, KNU 시간표 마법사",
  openGraph: {
    title: "KNU 시간표 마법사",
    description: "전공·교양·교직을 담으면 겹치지 않는 시간표를 모두 찾아 드려요.",
    siteName: "KNU 시간표 마법사",
    locale: "ko_KR",
    type: "website",
  },
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
