"use client";

import { useMemo, useState } from "react";
import { colorFor, DAY_NAMES } from "@/lib/planner/data";
import { SORT_LABEL, type CartItem, type CartMode, type Conditions, type Course, type SortKey } from "@/lib/planner/types";

const HOURS_START = [0, 9, 10, 11, 12, 13];
const HOURS_END = [0, 15, 16, 17, 18, 19, 20];

export function cartCredit(items: CartItem[], courseByCode: Map<string, Course>) {
  return items.reduce((s, i) => s + (courseByCode.get(i.code)?.credit ?? 0), 0);
}

/** 담은 과목 목록 (빼기만. "꼭 넣기"는 3단계 조건에서) */
export function CartList({
  cart,
  courseByCode,
  onSetMode,
  onClear,
}: {
  cart: CartItem[];
  courseByCode: Map<string, Course>;
  onSetMode: (code: string, mode: CartMode | null) => void;
  onClear?: () => void;
}) {
  if (cart.length === 0) {
    return <div className="pl-empty">아직 담은 과목이 없어요.<br />목록에서 <b>담기</b>를 눌러 보세요.</div>;
  }
  return (
    <div className="pl-cart-group">
      <div className="pl-label">{cart.length}과목 · 최대 {cartCredit(cart, courseByCode)}학점</div>
      {cart.map((i) => {
        const course = courseByCode.get(i.code);
        if (!course) return null;
        const notes = [i.mode === "must" ? "꼭 넣기" : "", i.pinned ? "분반 고정" : "", i.excluded.length ? `${i.excluded.length}개 분반 제외` : ""].filter(Boolean);
        return (
          <div key={i.code} className="pl-cart-item">
            <span className="pl-swatch" style={{ background: colorFor(i.code) }} />
            <div className="pl-cart-name">
              <div title={course.name}>{course.name}</div>
              <div className="pl-hint">{[`${course.credit}학점`, ...notes].join(" · ")}</div>
            </div>
            <button className="pl-x" aria-label={`${course.name} 빼기`} onClick={() => onSetMode(i.code, null)}>×</button>
          </div>
        );
      })}
      {onClear && <button className="pl-link" style={{ marginTop: 8 }} onClick={onClear}>모두 비우기</button>}
    </div>
  );
}

/** 3단계 조건 · 정렬 */
export function ConditionsPanel({
  cart,
  courseByCode,
  conditions: c,
  onConditions,
  onSetMode,
}: {
  cart: CartItem[];
  courseByCode: Map<string, Course>;
  conditions: Conditions;
  onConditions: (c: Conditions) => void;
  onSetMode: (code: string, mode: CartMode | null) => void;
}) {
  const [allProfs, setAllProfs] = useState(false);
  const set = (patch: Partial<Conditions>) => onConditions({ ...c, ...patch });

  const profs = useMemo(() => {
    const s = new Set<string>();
    for (const i of cart) for (const sec of courseByCode.get(i.code)?.sections ?? []) sec.profs.forEach((p) => s.add(p));
    return [...s].sort((a, b) => a.localeCompare(b, "ko"));
  }, [cart, courseByCode]);

  return (
    <>
      <div className="pl-cond-block" data-tour="must">
        <div className="pl-label">꼭 넣을 과목</div>
        <div className="pl-hint" style={{ marginBottom: 8 }}>고르면 이 과목이 들어간 시간표만 보여 줘요.</div>
        <div className="pl-chips">
          {cart.map((i) => {
            const course = courseByCode.get(i.code);
            if (!course) return null;
            return (
              <button key={i.code} className="pl-chip" aria-pressed={i.mode === "must"} onClick={() => onSetMode(i.code, i.mode === "must" ? "maybe" : "must")}>
                {course.name.replace(/\s*\(.*?\)\s*$/, "")}
              </button>
            );
          })}
        </div>
      </div>

      <div className="pl-cond-block" data-tour="sort">
        <div className="pl-label">정렬</div>
        <div className="pl-chips">
          {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
            <button key={k} className="pl-chip" aria-pressed={c.sort === k} onClick={() => set({ sort: k })}>{SORT_LABEL[k]}</button>
          ))}
        </div>
      </div>

      <div className="pl-cond-block">
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

      <div className="pl-cond-block">
        <div className="pl-label">공강으로 비울 요일</div>
        <div className="pl-chips">
          {DAY_NAMES.slice(0, 5).map((d, i) => (
            <button key={d} className="pl-chip" aria-pressed={c.daysOff.includes(i)}
              onClick={() => set({ daysOff: c.daysOff.includes(i) ? c.daysOff.filter((x) => x !== i) : [...c.daysOff, i] })}>{d}</button>
          ))}
        </div>
      </div>

      <div className="pl-cond-block">
        <div className="pl-label">수업 시간</div>
        <div className="pl-grid2">
          <select className="pl-select" value={c.startAfter} onChange={(e) => set({ startAfter: +e.target.value })} aria-label="시작 시각">
            {HOURS_START.map((h) => <option key={h} value={h * 60}>{h ? `${h}시 이후 시작` : "시작 제한 없음"}</option>)}
          </select>
          <select className="pl-select" value={c.endBefore} onChange={(e) => set({ endBefore: +e.target.value })} aria-label="종료 시각">
            {HOURS_END.map((h) => <option key={h} value={h * 60}>{h ? `${h}시 전에 끝` : "종료 제한 없음"}</option>)}
          </select>
        </div>
      </div>

      {profs.length > 0 && (
        <div className="pl-cond-block">
          <div className="pl-label">피하고 싶은 교수</div>
          <div className="pl-chips">
            {(allProfs ? profs : profs.filter((p, i) => i < 10 || c.excludeProfs.includes(p))).map((p) => (
              <button key={p} className="pl-chip" aria-pressed={c.excludeProfs.includes(p)}
                onClick={() => set({ excludeProfs: c.excludeProfs.includes(p) ? c.excludeProfs.filter((x) => x !== p) : [...c.excludeProfs, p] })}>{p}</button>
            ))}
          </div>
          {profs.length > 10 && (
            <button className="pl-link" style={{ marginTop: 8 }} onClick={() => setAllProfs((v) => !v)}>{allProfs ? "접기" : `${profs.length - 10}명 더 보기`}</button>
          )}
        </div>
      )}
    </>
  );
}
