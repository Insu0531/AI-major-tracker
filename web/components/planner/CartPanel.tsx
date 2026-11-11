"use client";

import { useMemo, useState } from "react";
import { colorFor } from "@/lib/planner/data";
import { SORT_LABEL, SORT_OPTIONS, type CartItem, type CartMode, type Conditions, type Course } from "@/lib/planner/types";
import TimeRangePicker, { describeSlots, type TimeMode } from "./TimeRangePicker";

export function cartCredit(items: CartItem[], courseByCode: Map<string, Course>) {
  return items.reduce((s, i) => s + (courseByCode.get(i.code)?.credit ?? 0), 0);
}

/** 담은 과목 목록 (빼기만. "꼭 넣기"는 3단계 조건에서) */
export function CartList({
  cart,
  courseByCode,
  onSetMode,
  onClear,
  colorOf = colorFor,
}: {
  cart: CartItem[];
  courseByCode: Map<string, Course>;
  onSetMode: (code: string, mode: CartMode | null) => void;
  onClear?: () => void;
  colorOf?: (code: string) => string;
}) {
  if (cart.length === 0) {
    return <div className="pl-empty">아직 담은 과목이 없어요.<br />목록에서 <b>담기</b>를 눌러 보세요.</div>;
  }
  return (
    <div className="pl-cart-group">
      <div className="pl-label">{cart.length}과목 | 최대 {cartCredit(cart, courseByCode)}학점</div>
      {cart.map((i) => {
        const course = courseByCode.get(i.code);
        if (!course) return null;
        const notes = [i.mode === "must" ? "꼭 넣기" : "", i.pinned ? "분반 고정" : "", i.excluded.length ? `${i.excluded.length}개 분반 제외` : ""].filter(Boolean);
        return (
          <div key={i.code} className="pl-cart-item">
            <span className="pl-swatch" style={{ background: colorOf(i.code) }} />
            <div className="pl-cart-name">
              <div title={course.name}>{course.name}</div>
              <div className="pl-hint">{[`${course.credit}학점`, ...notes].join(" | ")}</div>
            </div>
            <button className="pl-x" aria-label={`${course.name} 빼기`} onClick={() => onSetMode(i.code, null)}>×</button>
          </div>
        );
      })}
      {onClear && <button className="pl-link" style={{ marginTop: 8 }} onClick={onClear}>모두 비우기</button>}
    </div>
  );
}

/** 3단계 조건과 정렬 — 순서: 꼭 넣을 과목 → 정렬 → 시간대 → 학점 → 공강·하루 일정 → 교수님 */
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
  const [timeMode, setTimeMode] = useState<TimeMode | null>(null);
  const blocked = c.blockedSlots ?? [], required = c.requiredSlots ?? [];
  const set = (patch: Partial<Conditions>) => onConditions({ ...c, ...patch });

  // 교수님 → 담당 과목명 (칩에 마우스를 올리면 어떤 과목인지 보여 줌)
  const profCourses = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const i of cart) {
      const course = courseByCode.get(i.code);
      for (const sec of course?.sections ?? []) for (const p of sec.profs) {
        const list = m.get(p) ?? [];
        if (course && !list.includes(course.name)) list.push(course.name);
        m.set(p, list);
      }
    }
    return m;
  }, [cart, courseByCode]);
  const profs = useMemo(() => [...profCourses.keys()].sort((a, b) => a.localeCompare(b, "ko")), [profCourses]);

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
              <button key={i.code} className="pl-chip" aria-pressed={i.mode === "must" || !!i.pinned}
                title={i.pinned ? "분반을 고정한 과목은 항상 들어가요. 빼려면 과목 담기에서 고정을 해제하세요" : undefined}
                onClick={() => { if (!i.pinned) onSetMode(i.code, i.mode === "must" ? "maybe" : "must"); }}>
                {course.name.replace(/\s*\(.*?\)\s*$/, "")}{i.pinned ? " (고정)" : ""}
              </button>
            );
          })}
        </div>
      </div>

      <div className="pl-cond-block" data-tour="sort">
        <div className="pl-label">정렬</div>
        <div className="pl-chips">
          {SORT_OPTIONS.map((k) => (
            <button key={k} className="pl-chip" aria-pressed={c.sort === k} onClick={() => set({ sort: k })}>{SORT_LABEL[k]}</button>
          ))}
        </div>
      </div>

      <div className="pl-cond-block">
        <div className="pl-label">시간대와 공강</div>
        <div className="pl-time-btns">
          <button className={`pl-time-btn block${blocked.length ? " on" : ""}`} onClick={() => setTimeMode("block")}>
            <span>빼고 싶은 시간</span>
            <small>{blocked.length ? describeSlots(blocked, 2) : "공강 요일·점심·시간 빼기"}</small>
          </button>
          <button className={`pl-time-btn need${required.length ? " on" : ""}`} onClick={() => setTimeMode("need")}>
            <span>꼭 넣을 시간</span>
            <small>{required.length ? describeSlots(required, 2) : "이 시간대엔 수업이 있게"}</small>
          </button>
        </div>
        {(blocked.length > 0 || required.length > 0) && (
          <button className="pl-link" style={{ marginTop: 6 }} onClick={() => set({ blockedSlots: [], requiredSlots: [] })}>시간대 조건 지우기</button>
        )}
      </div>
      {timeMode && (
        <TimeRangePicker
          blocked={blocked}
          required={required}
          initialMode={timeMode}
          onClose={() => setTimeMode(null)}
          onChange={(b, r) => set({ blockedSlots: b, requiredSlots: r })}
        />
      )}

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
        <div className="pl-label">하루 일정</div>
        <div className="pl-chips">
          <button className="pl-chip" aria-pressed={c.maxStreak === 180} onClick={() => set({ maxStreak: c.maxStreak ? 0 : 180 })} title="쉬는 시간 없이 3시간 넘게 이어지는 날이 없는 시간표만">3시간 넘는 연강 없음</button>
          <button className="pl-chip" aria-pressed={c.maxGap === 120} onClick={() => set({ maxGap: c.maxGap ? 0 : 120 })} title="수업 사이 빈 시간이 2시간 넘는 날이 없는 시간표만">2시간 넘는 공강 없음</button>
          <button className="pl-chip" aria-pressed={c.maxPerDay === 3} onClick={() => set({ maxPerDay: c.maxPerDay ? 0 : 3 })} title="하루에 3과목까지만 듣는 시간표만">하루 3과목 이하</button>
          <button className="pl-chip" aria-pressed={c.noRemote} onClick={() => set({ noRemote: !c.noRemote })} title="원격강좌 분반은 빼고 시간표를 만들어요">원격강좌 빼기</button>
        </div>
      </div>

      {profs.length > 0 && (
        <ProfChooser
          profs={profs}
          profCourses={profCourses}
          include={c.includeProfs ?? []}
          exclude={c.excludeProfs}
          onCycle={(p) => {
            // 누를 때마다 기본 → 꼭 → 피함 → 기본
            const inc = c.includeProfs ?? [];
            if (inc.includes(p)) set({ includeProfs: inc.filter((x) => x !== p), excludeProfs: [...c.excludeProfs, p] });
            else if (c.excludeProfs.includes(p)) set({ excludeProfs: c.excludeProfs.filter((x) => x !== p) });
            else set({ includeProfs: [...inc, p] });
          }}
          showAll={allProfs}
          onShowAll={() => setAllProfs((v) => !v)}
        />
      )}
    </>
  );
}

/** 교수님 한 줄: 칩을 누를 때마다 기본 → 꼭 들을 → 피할 → 기본 (2026-11-11 단순화, 예전엔 두 줄) */
function ProfChooser({
  profs,
  profCourses,
  include,
  exclude,
  onCycle,
  showAll,
  onShowAll,
}: {
  profs: string[];
  profCourses: Map<string, string[]>;
  include: string[];
  exclude: string[];
  onCycle: (p: string) => void;
  showAll: boolean;
  onShowAll: () => void;
}) {
  const chosen = (p: string) => include.includes(p) || exclude.includes(p);
  const shown = showAll ? profs : profs.filter((p, i) => i < 8 || chosen(p));
  return (
    <div className="pl-cond-block">
      <div className="pl-label">교수님</div>
      <div className="pl-hint" style={{ marginBottom: 8 }}>한 번 누르면 <b className="pl-prof-legend inc">꼭 듣기</b>, 두 번 누르면 <b className="pl-prof-legend exc">피하기</b>, 세 번이면 해제예요.</div>
      <div className="pl-chips">
        {shown.map((p) => {
          const state = include.includes(p) ? "inc" : exclude.includes(p) ? "exc" : "";
          return (
            <button key={p} className={`pl-chip pl-prof-chip ${state}`} aria-pressed={!!state}
              aria-label={`${p} 교수님${state === "inc" ? ", 꼭 듣기" : state === "exc" ? ", 피하기" : ""}`}
              title={[profCourses.get(p)?.join(", "), state === "inc" ? "꼭 듣기" : state === "exc" ? "피하기" : ""].filter(Boolean).join(" | ")}
              onClick={() => onCycle(p)}>
              {state === "inc" ? "✓ " : state === "exc" ? "✕ " : ""}{p}
            </button>
          );
        })}
      </div>
      {profs.length > 8 && (
        <button className="pl-link" style={{ marginTop: 8 }} onClick={onShowAll}>{showAll ? "접기" : `${profs.length - 8}명 더 보기`}</button>
      )}
    </div>
  );
}
