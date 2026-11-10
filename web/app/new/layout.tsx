import type { Metadata } from "next";
import "./planner.css";

export const metadata: Metadata = {
  title: "시간표 검색 · 경북대학교 시간표 마법사",
  description: "전공·교양·교직을 한 번에 담고 조건과 정렬로 경북대 시간표를 찾아보세요.",
};

export default function NewLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <link
        rel="stylesheet"
        href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        precedence="default"
      />
      {children}
    </>
  );
}
