"use client";

import { useEffect, useRef, useState } from "react";
import { DAY_NAMES } from "@/lib/planner/data";
import { useDialogKeys } from "@/lib/planner/useDialogKeys";
import type { Slot } from "@/lib/planner/types";

/**
 * 시간대 고르기 창: 빈 주간 격자(월~토, 8~22시, 1시간 칸)를 클릭·드래그로 칠한다. 칠하면 바로 조건에 반영(적용 버튼 없음).
 *  - "빼고 싶은 시간"(block): 칠한 칸에 걸리는 분반은 시간표에 넣지 않음
 *  - "꼭 넣을 시간"(need): 이어 칠한 시간대마다 그 안에 수업이 하나라도 있는 시간표만
 * 마우스·터치 모두 pointer 이벤트로 처리 (터치는 elementFromPoint로 지나간 칸을 찾음)
 */
export type TimeMode = "block" | "need";
type Cells = Map<string, TimeMode>; // "요일-시작분" → 모드

const H0 = 8, H1 = 22, STEP = 60;
const ROWS = Array.from({ length: ((H1 - H0) * 60) / STEP }, (_, i) => H0 * 60 + i * STEP);
const DAYS = 6;
const key = (d: number, m: number) => `${d}-${m}`;

export const cellsToSlots = (cells: Cells, mode: TimeMode): Slot[] =>
  [...cells].filter(([, v]) => v === mode).map(([k]) => {
    const [d, m] = k.split("-").map(Number);
    return [d, m, m + STEP] as Slot;
  });

function slotsToCells(block: Slot[], need: Slot[]): Cells {
  const c: Cells = new Map();
  for (const [mode, list] of [["block", block], ["need", need]] as const)
    // 예전에 30분 칸으로 저장된 조건도 그 시간이 들어간 1시간 칸으로
    for (const [d, s, e] of list) for (let m = Math.floor(s / STEP) * STEP; m < e; m += STEP) c.set(key(d, m), mode);
  return c;
}

/** 요약: 다 칠한 요일은 "금 공강", 월~금 12시 칸은 "점심 12~13시", 나머지는 "월 9:00~10:30" (이어진 칸은 합침) */
export function describeSlots(slots: Slot[], max = 3): string {
  const byDay = new Map<number, Set<number>>();
  for (const [d, s] of slots) { if (!byDay.has(d)) byDay.set(d, new Set()); byDay.get(d)!.add(Math.floor(s / STEP) * STEP); }
  const hm = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
  const off: number[] = [];
  for (const [d, ms] of byDay) if (ROWS.every((m) => ms.has(m))) off.push(d);
  const LUNCH = 12 * 60;
  const lunch = [0, 1, 2, 3, 4].every((d) => off.includes(d) || byDay.get(d)?.has(LUNCH)) && [0, 1, 2, 3, 4].some((d) => !off.includes(d));
  const parts: string[] = [];
  if (off.length) parts.push(`${off.sort().map((d) => DAY_NAMES[d]).join("")} 공강`);
  if (lunch) parts.push("점심 12~13시");
  for (const d of [...byDay.keys()].sort()) {
    if (off.includes(d)) continue;
    const ms = [...byDay.get(d)!].filter((m) => !(lunch && m === LUNCH)).sort((a, b) => a - b);
    if (!ms.length) continue;
    let a = ms[0], b = ms[0] + STEP;
    for (let i = 1; i <= ms.length; i++) {
      if (ms[i] === b) { b += STEP; continue; }
      parts.push(`${DAY_NAMES[d]} ${hm(a)}~${hm(b)}`);
      if (i < ms.length) { a = ms[i]; b = ms[i] + STEP; }
    }
  }
  return parts.length > max ? `${parts.slice(0, max).join(" | ")} 외 ${parts.length - max}곳` : parts.join(" | ");
}

export default function TimeRangePicker({
  blocked,
  required,
  initialMode,
  onChange,
  onClose,
}: {
  blocked: Slot[];
  required: Slot[];
  initialMode: TimeMode;
  /** 칠할 때마다(드래그는 끝난 뒤) 바로 저장 */
  onChange: (blocked: Slot[], required: Slot[]) => void;
  onClose: () => void;
}) {
  const [cells, setCells] = useState<Cells>(() => slotsToCells(blocked, required));
  // 바뀌면 잠깐 뒤(드래그 중 매번 다시 계산하지 않게) 바로 조건에 반영
  const first = useRef(true);
  const changeRef = useRef(onChange);
  useEffect(() => { changeRef.current = onChange; }, [onChange]);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const id = setTimeout(() => changeRef.current(cellsToSlots(cells, "block"), cellsToSlots(cells, "need")), 250);
    return () => clearTimeout(id);
  }, [cells]);
  const [mode, setMode] = useState<TimeMode>(initialMode);
  // 드래그 중: 첫 칸이 이미 지금 모드면 지우기, 아니면 칠하기
  const drag = useRef<{ erase: boolean } | null>(null);

  useEffect(() => {
    const up = () => { drag.current = null; };
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => { window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", up); };
  }, []);

  const paint = (k: string, erase: boolean) =>
    setCells((prev) => {
      if (erase ? prev.get(k) !== mode : prev.get(k) === mode) return prev;
      const next = new Map(prev);
      if (erase) next.delete(k); else next.set(k, mode);
      return next;
    });

  // 요일 머리를 누르면 그 요일 전체(8~22시)를 지금 모드로 칠하기 / 이미 다 칠해져 있으면 지우기
  const allOf = (d: number) => ROWS.every((m) => cells.get(key(d, m)) === mode);
  const toggleDay = (d: number) =>
    setCells((prev) => {
      const next = new Map(prev);
      const erase = ROWS.every((m) => prev.get(key(d, m)) === mode);
      for (const m of ROWS) if (erase) next.delete(key(d, m)); else next.set(key(d, m), mode);
      return next;
    });

  // 점심(월~금 12~13시) 빼기 — 예전 "점심시간 비우기" 조건을 여기로 합침
  const LUNCH = 12 * 60;
  const lunchOn = [0, 1, 2, 3, 4].every((d) => cells.get(key(d, LUNCH)) === "block");
  const toggleLunch = () =>
    setCells((prev) => {
      const next = new Map(prev);
      for (let d = 0; d < 5; d++) if (lunchOn) next.delete(key(d, LUNCH)); else next.set(key(d, LUNCH), "block");
      return next;
    });

  const cellAt = (x: number, y: number) => (document.elementFromPoint(x, y) as HTMLElement | null)?.closest<HTMLElement>("[data-cell]")?.dataset.cell;

  // 어떤 방법으로 닫든(완료·×·바깥) 마지막으로 칠한 것까지 저장하고 닫기
  const close = () => { changeRef.current(cellsToSlots(cells, "block"), cellsToSlots(cells, "need")); onClose(); };

  useDialogKeys(true, close);

  const count = (m: TimeMode) => [...cells.values()].filter((v) => v === m).length;
  const hours = (n: number) => `${n / 2}시간`;

  return (
    <div className="pl-modal-bg" onClick={close}>
      <div className="pl-modal pl-trp" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="시간대 고르기">
        <div className="pl-modal-head">
          <h3>시간대 고르기</h3>
          <button className="pl-x" aria-label="닫기" onClick={close}>×</button>
        </div>
        <div className="pl-modal-body">
          <div className="pl-trp-modes" role="radiogroup" aria-label="칠할 종류">
            <button role="radio" aria-checked={mode === "block"} className="pl-trp-mode block" onClick={() => setMode("block")}>
              <span className="pl-trp-swatch" /> 빼고 싶은 시간 <b>{count("block") ? hours(count("block")) : ""}</b>
            </button>
            <button role="radio" aria-checked={mode === "need"} className="pl-trp-mode need" onClick={() => setMode("need")}>
              <span className="pl-trp-swatch" /> 꼭 넣을 시간 <b>{count("need") ? hours(count("need")) : ""}</b>
            </button>
          </div>
          {mode === "block" && (
            <div className="pl-trp-quick">
              <span className="pl-muted">빠른 선택</span>
              {DAY_NAMES.slice(0, 5).map((dn, d) => (
                <button key={dn} type="button" className="pl-chip" aria-pressed={allOf(d)} onClick={() => toggleDay(d)}>{dn} 공강</button>
              ))}
              <button type="button" className="pl-chip" aria-pressed={lunchOn} onClick={toggleLunch}>점심 12~13시</button>
            </div>
          )}
          <div className="pl-hint">
            {mode === "block" ? "칠한 시간에 걸리는 분반은 시간표에 넣지 않아요." : "칠한 시간대마다 그 안에 수업이 하나라도 있는 시간표만 보여 줘요. (다 채울 필요는 없어요)"} 칸을 누르거나 끌어서 칠하고, 칠한 칸을 다시 누르면 지워져요. 요일(또는 ○ 공강)을 누르면 그 요일 전체를 칠해요. 칠하면 바로 반영돼요.
          </div>
          <div
            className="pl-trp-grid"
            style={{ gridTemplateColumns: `36px repeat(${DAYS}, 1fr)`, gridTemplateRows: "24px" }}
            onPointerDown={(e) => {
              const k = cellAt(e.clientX, e.clientY);
              if (!k) return;
              e.preventDefault();
              drag.current = { erase: cells.get(k) === mode };
              paint(k, drag.current.erase);
            }}
            onPointerMove={(e) => {
              if (!drag.current) return;
              const k = cellAt(e.clientX, e.clientY);
              if (k) paint(k, drag.current.erase);
            }}
          >
            <div />
            {Array.from({ length: DAYS }, (_, d) => (
              <button key={d} type="button" className="pl-trp-day" title={`${DAY_NAMES[d]}요일 전체 ${allOf(d) ? "지우기" : "칠하기"}`}
                onPointerDown={(e) => e.stopPropagation()} onClick={() => toggleDay(d)}>{DAY_NAMES[d]}</button>
            ))}
            {ROWS.map((m) => (
              <div key={m} style={{ display: "contents" }}>
                <div className="pl-trp-hour">{m / 60}</div>
                {Array.from({ length: DAYS }, (_, d) => {
                  const v = cells.get(key(d, m));
                  return <div key={d} data-cell={key(d, m)} className={`pl-trp-cell hour${v ? ` ${v}` : ""}`} />;
                })}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="pl-btn" onClick={() => setCells(new Map())}>모두 지우기</button>
            <button className="pl-btn primary" style={{ flex: 1 }} onClick={close}>완료</button>
          </div>
        </div>
      </div>
    </div>
  );
}
