"use client";

import { useEffect, useMemo, useState } from "react";
import { track } from "@/lib/analytics";
import { sectionAllowed, type SectionFilter } from "@/lib/planner/data";
import { courseMatches, normQuery } from "@/lib/planner/recommend";
import type { CartItem, CartMode, Course } from "@/lib/planner/types";
import { CourseRow, isMyDept } from "./CourseBrowser";

/**
 * 3단계 "빈 시간 채우기"의 검색 결과 (검색창은 ResultPanel 위쪽에 있고 q만 받는다).
 * 결과는 2단계 과목 표와 같은 행(CourseRow)을 미니 표로 보여 줘서, 담기·분반 펼치기·고정/제외가 똑같이 된다.
 */
export default function QuickAdd({
  q,
  list,
  courses,
  cart,
  sectionFilter,
  includeGrad,
  myLabels,
  onSetMode,
  onSection,
}: {
  q: string;
  /** 검색 대신 정해진 과목 목록을 그대로 보여 줄 때 (전공 추천 탭의 "다른 전공 과목") */
  list?: Course[];
  courses: Course[];
  cart: CartItem[];
  sectionFilter: SectionFilter;
  includeGrad: boolean;
  myLabels: string[];
  onSetMode: (code: string, mode: CartMode | null) => void;
  onSection: (code: string, sectionId: string, action: "pin" | "exclude") => void;
}) {
  const [open, setOpen] = useState<{ q: string; code: string } | null>(null);
  const openCode = open?.q === q ? open.code : null; // 검색어가 바뀌면 펼친 행은 닫힘
  const cartMap = useMemo(() => new Map(cart.map((c) => [c.code, c])), [cart]);

  const results = useMemo(() => {
    if (list) return list.slice(0, 40);
    const t = normQuery(q);
    if (t.length < 1) return [];
    return courses
      .filter((c) => (includeGrad || !c.isGrad) && c.sections.some((s) => sectionAllowed(s, sectionFilter)))
      .filter((c) => courseMatches(c, t))
      .sort((a, b) => Number(!a.name.replace(/\s/g, "").toLowerCase().startsWith(t)) - Number(!b.name.replace(/\s/g, "").toLowerCase().startsWith(t)) || a.name.localeCompare(b.name, "ko"))
      .slice(0, 15);
  }, [q, list, courses, includeGrad, sectionFilter]);

  useEffect(() => {
    const t = q.trim();
    if (!t || list) return;
    const id = setTimeout(() => track("search", { q: t, where: "quick_add" }), 1200);
    return () => clearTimeout(id);
  }, [q, list]);

  if (!list && !q.trim()) return null;
  return results.length === 0 ? (
    <div className="pl-hint" style={{ padding: "12px 0" }}>{list ? "더 담을 전공 과목이 없어요." : "찾는 과목이 없어요."}</div>
  ) : (
    <div className="pl-quick-results">
      <table className="pl-table pl-table-mini">
        <tbody>
          {results.map((c) => (
            <CourseRow
              key={c.code}
              course={c}
              item={cartMap.get(c.code)}
              open={openCode === c.code}
              showCategory
              otherDept={(c.category === "major" || c.category === "major2") && !isMyDept(c.dept, myLabels)}
              onToggleOpen={() => setOpen(openCode === c.code ? null : { q, code: c.code })}
              sectionFilter={sectionFilter}
              onSetMode={(code, mode) => { onSetMode(code, mode); if (mode) track("quick_added", { code }); }}
              onSection={onSection}
            />
          ))}
        </tbody>
      </table>
      <div className="pl-hint" style={{ padding: "8px 0" }}>담으면 시간표를 다시 계산해요. 담은 과목은 ‘과목 더 담기/빼기’에서도 볼 수 있어요.</div>
    </div>
  );
}
