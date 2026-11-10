"use client";

import { useEffect, useMemo, useState } from "react";
import { track } from "@/lib/analytics";
import { sectionAllowed, type SectionFilter } from "@/lib/planner/data";
import type { CartItem, CartMode, Course } from "@/lib/planner/types";
import { CourseRow, isMyDept } from "./CourseBrowser";

/**
 * 3단계에서 과목 검색해서 바로 넣기.
 * 결과는 2단계 과목 표와 같은 행(CourseRow)을 미니 표로 보여 줘서, 담기·분반 펼치기·고정/제외가 똑같이 된다.
 */
export default function QuickAdd({
  courses,
  cart,
  sectionFilter,
  includeGrad,
  myLabels,
  onSetMode,
  onSection,
}: {
  courses: Course[];
  cart: CartItem[];
  sectionFilter: SectionFilter;
  includeGrad: boolean;
  myLabels: string[];
  onSetMode: (code: string, mode: CartMode | null) => void;
  onSection: (code: string, sectionId: string, action: "pin" | "exclude") => void;
}) {
  const [q, setQ] = useState("");
  const [openCode, setOpenCode] = useState<string | null>(null);
  const cartMap = useMemo(() => new Map(cart.map((c) => [c.code, c])), [cart]);

  const results = useMemo(() => {
    const t = q.trim().replace(/\s/g, "").toLowerCase();
    if (t.length < 1) return [];
    return courses
      .filter((c) => (includeGrad || !c.isGrad) && c.sections.some((s) => sectionAllowed(s, sectionFilter)))
      .filter((c) => `${c.name}${c.code}${c.dept}${c.sections.map((s) => s.profs.join("")).join("")}`.replace(/\s/g, "").toLowerCase().includes(t))
      .sort((a, b) => Number(!a.name.replace(/\s/g, "").toLowerCase().startsWith(t)) - Number(!b.name.replace(/\s/g, "").toLowerCase().startsWith(t)) || a.name.localeCompare(b.name, "ko"))
      .slice(0, 15);
  }, [q, courses, includeGrad, sectionFilter]);

  useEffect(() => {
    const t = q.trim();
    if (!t) return;
    const id = setTimeout(() => track("search", { q: t, where: "quick_add" }), 1200);
    return () => clearTimeout(id);
  }, [q]);

  return (
    <div className="pl-quick" id="pl-quick">
      <div className="pl-quick-head">
        <div className="pl-label" style={{ marginBottom: 0 }}>다른 과목 검색해서 넣기</div>
        <input
          className="pl-field"
          placeholder="과목명, 코드, 교수, 학과"
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpenCode(null); }}
        />
      </div>
      {q.trim() && (
        results.length === 0 ? (
          <div className="pl-hint" style={{ padding: "8px 0" }}>찾는 과목이 없어요.</div>
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
                    onToggleOpen={() => setOpenCode(openCode === c.code ? null : c.code)}
                    sectionFilter={sectionFilter}
                    onSetMode={(code, mode) => { onSetMode(code, mode); if (mode) track("quick_added", { code }); }}
                    onSection={onSection}
                  />
                ))}
              </tbody>
            </table>
            <div className="pl-hint" style={{ padding: "8px 0" }}>담으면 시간표를 다시 계산해요. 담은 과목은 ‘과목 더 담기 · 빼기’에서도 볼 수 있어요.</div>
          </div>
        )
      )}
    </div>
  );
}
