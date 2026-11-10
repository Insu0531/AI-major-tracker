"use client";

import { useMemo, useState } from "react";
import { colorFor, DAY_NAMES } from "@/lib/planner/data";
import { SORT_LABEL, type CartItem, type CartMode, type Conditions, type Course, type SortKey } from "@/lib/planner/types";

const HOURS_START = [0, 9, 10, 11, 12, 13];
const HOURS_END = [0, 15, 16, 17, 18, 19, 20];

export default function CartPanel({
  cart,
  courseByCode,
  conditions: c,
  onConditions,
  onSetMode,
  onClear,
}: {
  cart: CartItem[];
  courseByCode: Map<string, Course>;
  conditions: Conditions;
  onConditions: (c: Conditions) => void;
  onSetMode: (code: string, mode: CartMode | null) => void;
  onClear: () => void;
}) {
  const [allProfs, setAllProfs] = useState(false);
  const set = (patch: Partial<Conditions>) => onConditions({ ...c, ...patch });
  const must = cart.filter((i) => i.mode === "must");
  const maybe = cart.filter((i) => i.mode === "maybe");
  const credit = (items: CartItem[]) => items.reduce((s, i) => s + (courseByCode.get(i.code)?.credit ?? 0), 0);

  const profs = useMemo(() => {
    const set = new Set<string>();
    for (const i of cart) for (const s of courseByCode.get(i.code)?.sections ?? []) s.profs.forEach((p) => set.add(p));
    return [...set].sort((a, b) => a.localeCompare(b, "ko"));
  }, [cart, courseByCode]);

  const renderItem = (i: CartItem) => {
    const course = courseByCode.get(i.code);
    if (!course) return null;
    const note = i.pinned ? "분반 고정" : i.excluded.length ? `${i.excluded.length}개 분반 제외` : "";
    return (
      <div key={i.code} className="pl-cart-item">
        <span className="pl-swatch" style={{ background: colorFor(i.code) }} />
        <div className="pl-cart-name" title={course.name}>
          {course.name} <span className="pl-muted pl-small">{course.credit}학점{note ? ` · ${note}` : ""}</span>
        </div>
        <div className="pl-mode" role="group" aria-label="담기 방식">
          <button aria-pressed={i.mode === "must"} onClick={() => onSetMode(i.code, "must")}>필수</button>
          <button aria-pressed={i.mode === "maybe"} onClick={() => onSetMode(i.code, "maybe")}>후보</button>
        </div>
        <button className="pl-x" aria-label={`${course.name} 빼기`} onClick={() => onSetMode(i.code, null)}>×</button>
      </div>
    );
  };

  return (
    <>
      <div className="pl-pane-head">
        <div className="pl-pane-title">
          <h2>담은 과목</h2>
          {cart.length > 0 && <button className="pl-link" onClick={onClear}>모두 비우기</button>}
        </div>
      </div>
      <div className="pl-scroll">
        <div className="pl-section">
          {cart.length === 0 ? (
            <div className="pl-muted pl-small" style={{ lineHeight: 1.6 }}>
              왼쪽 목록에서 과목을 담으세요.<br />
              <b>필수</b>는 반드시 들어가고, <b>후보</b>는 시간과 학점이 맞을 때만 들어가요.
            </div>
          ) : (
            <>
              <div className="pl-label">필수 {must.length} · {credit(must)}학점</div>
              {must.length ? must.map(renderItem) : <div className="pl-muted pl-small" style={{ padding: "4px 0 8px" }}>없음</div>}
              <div className="pl-label" style={{ marginTop: 12 }}>후보 {maybe.length} · 최대 {credit(maybe)}학점</div>
              {maybe.length ? maybe.map(renderItem) : <div className="pl-muted pl-small" style={{ padding: "4px 0" }}>없음</div>}
            </>
          )}
        </div>

        <div className="pl-section">
          <div className="pl-label">학점</div>
          <div className="pl-grid2">
            <select className="pl-select" value={c.minCredit} onChange={(e) => set({ minCredit: +e.target.value })} aria-label="최소 학점">
              <option value={0}>최소 제한 없음</option>
              {Array.from({ length: 22 }, (_, i) => i + 3).map((n) => <option key={n} value={n}>{n}학점 이상</option>)}
            </select>
            <select className="pl-select" value={c.maxCredit} onChange={(e) => set({ maxCredit: +e.target.value })} aria-label="최대 학점">
              <option value={0}>최대 제한 없음</option>
              {Array.from({ length: 22 }, (_, i) => i + 3).map((n) => <option key={n} value={n}>{n}학점 이하</option>)}
            </select>
          </div>
        </div>

        <div className="pl-section">
          <div className="pl-label">공강 요일</div>
          <div className="pl-chips">
            {DAY_NAMES.slice(0, 5).map((d, i) => (
              <button key={d} className="pl-chip" aria-pressed={c.daysOff.includes(i)}
                onClick={() => set({ daysOff: c.daysOff.includes(i) ? c.daysOff.filter((x) => x !== i) : [...c.daysOff, i] })}>{d}</button>
            ))}
          </div>
          <div className="pl-label" style={{ marginTop: 12 }}>수업 시간</div>
          <div className="pl-grid2">
            <select className="pl-select" value={c.startAfter} onChange={(e) => set({ startAfter: +e.target.value })} aria-label="시작 시각">
              {HOURS_START.map((h) => <option key={h} value={h * 60}>{h ? `${h}시 이후 시작` : "시작 제한 없음"}</option>)}
            </select>
            <select className="pl-select" value={c.endBefore} onChange={(e) => set({ endBefore: +e.target.value })} aria-label="종료 시각">
              {HOURS_END.map((h) => <option key={h} value={h * 60}>{h ? `${h}시 전 끝` : "종료 제한 없음"}</option>)}
            </select>
          </div>
        </div>

        {profs.length > 0 && (
          <div className="pl-section">
            <div className="pl-label">피할 교수</div>
            <div className="pl-chips">
              {(allProfs ? profs : profs.filter((p, i) => i < 12 || c.excludeProfs.includes(p))).map((p) => (
                <button key={p} className="pl-chip" aria-pressed={c.excludeProfs.includes(p)}
                  onClick={() => set({ excludeProfs: c.excludeProfs.includes(p) ? c.excludeProfs.filter((x) => x !== p) : [...c.excludeProfs, p] })}>{p}</button>
              ))}
              {profs.length > 12 && (
                <button className="pl-link" onClick={() => setAllProfs((v) => !v)}>{allProfs ? "접기" : `+${profs.length - 12}명 더 보기`}</button>
              )}
            </div>
          </div>
        )}

        <div className="pl-section">
          <div className="pl-label">정렬</div>
          <div className="pl-chips">
            {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
              <button key={k} className="pl-chip" aria-pressed={c.sort === k} onClick={() => set({ sort: k })}>{SORT_LABEL[k]}</button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
