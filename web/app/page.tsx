import type { Metadata } from "next";
import PlannerClient from "@/components/planner/PlannerClient";
import "./planner.css";

export const metadata: Metadata = {
  title: "경북대학교 시간표 마법사",
  description: "전공·교양·교직을 한 번에 담으면 겹치지 않는 시간표를 모두 찾아 정리해 드려요. 전공으로 인정되는 다른 학과 개설 과목까지 함께 찾아요.",
};

// 새 시간표 검색 화면 (구버전은 /old)
export default function Home() {
  return (
    <>
      <link
        rel="stylesheet"
        href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        precedence="default"
      />
      <PlannerClient />
    </>
  );
}
