"use client";

import dynamic from "next/dynamic";

// 저장된 선택(localStorage)을 첫 렌더부터 쓰기 위해 브라우저에서만 렌더링
const Planner = dynamic(() => import("@/components/planner/Planner"), {
  ssr: false,
  loading: () => <div className="pl"><div className="pl-loading">불러오는 중…</div></div>,
});

export default function PlannerClient() {
  return <Planner />;
}
