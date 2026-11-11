"use client";

import { useEffect, useRef, useState } from "react";
import { dayCount, hourRange, type TimetableItem } from "@/lib/planner/exportImage";
import { DAY_NAMES, mergeSlots } from "@/lib/planner/data";

const LABEL_W = 34;

/** 같은 시간에 여러 분반이 있는 과목의 선택지 (결과 화면에서만 넘김) */
export type SectionChoice = { options: { id: string; prof: string; room: string }[]; chosen: string; decided: boolean };

export default function Timetable({
  items,
  choices,
  onChoose,
}: {
  items: TimetableItem[];
  choices?: Record<string, SectionChoice>;
  onChoose?: (code: string, sectionId: string) => void;
}) {
  const [h0, h1] = hourRange(items);
  const days = dayCount(items);
  const cols = `${LABEL_W}px repeat(${days}, minmax(56px, 1fr))`;
  const hours = Array.from({ length: h1 - h0 }, (_, i) => h0 + i);
  const noTime = items.filter((i) => i.slots.length === 0);

  // 블록에 마우스를 올리거나 누르면 분반(교수님) 고르기 창
  const [open, setOpen] = useState<{ code: string; key: string } | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keep = () => { if (closeTimer.current) clearTimeout(closeTimer.current); };
  const closeSoon = () => { keep(); closeTimer.current = setTimeout(() => setOpen(null), 250); };
  useEffect(() => () => keep(), []);

  return (
    <div>
      <div className="pl-tt">
        <div className="pl-tt-head" style={{ gridTemplateColumns: cols }}>
          <div />
          {Array.from({ length: days }, (_, d) => <div key={d}>{DAY_NAMES[d]}</div>)}
        </div>
        <div className="pl-tt-body" style={{ gridTemplateColumns: cols, height: `calc(var(--hour) * ${h1 - h0})` }}>
          <div className="pl-tt-hour-col" style={{ position: "relative" }}>
            {hours.map((h, i) => (
              <div key={h} className="pl-tt-hour" style={{ position: "absolute", right: 0, top: `calc(var(--hour) * ${i})` }}>{h}</div>
            ))}
          </div>
          {Array.from({ length: days }, (_, d) => (
            <div key={d} className="pl-tt-col">
              {hours.map((h, i) => <div key={h} className="pl-tt-line" style={{ top: `calc(var(--hour) * ${i})` }} />)}
              {items.flatMap((it, ii) =>
                mergeSlots(it.slots)
                  .filter(([day]) => day === d)
                  .map(([, s, e]) => {
                    const choice = choices?.[it.code];
                    const pickable = !!(choice && onChoose && choice.options.length > 1);
                    const key = `${it.code}-${d}-${s}`;
                    const isOpen = open?.key === key;
                    return (
                      <div
                        key={key}
                        className={`pl-tt-block${pickable ? " pickable" : ""}${isOpen ? " open" : ""}`}
                        title={pickable ? undefined : `${it.name}\n${it.prof}\n${it.room}`}
                        style={{
                          // 결과를 바꿀 때 과목 순서대로 살짝 차례로 나타남 (planner.css .pl-tt-block)
                          ["--i" as string]: ii,
                          background: it.color,
                          top: `calc(var(--hour) * ${(s - h0 * 60) / 60} + 1px)`,
                          height: `calc(var(--hour) * ${(e - s) / 60} - 2px)`,
                          left: 2,
                          right: 2,
                        }}
                        onMouseEnter={pickable ? () => { keep(); setOpen({ code: it.code, key }); } : undefined}
                        onMouseLeave={pickable ? closeSoon : undefined}
                        onClick={pickable ? () => setOpen(isOpen ? null : { code: it.code, key }) : undefined}
                        role={pickable ? "button" : undefined}
                        tabIndex={pickable ? 0 : undefined}
                        aria-expanded={pickable ? isOpen : undefined}
                        onKeyDown={pickable ? (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); setOpen(isOpen ? null : { code: it.code, key }); } else if (ev.key === "Escape") setOpen(null); } : undefined}
                        aria-label={pickable ? `${it.name} 분반 고르기` : undefined}
                      >
                        <strong>{it.name}</strong>
                        {it.prof && <span>{it.prof}</span>}
                        {it.room && <span>{it.room}</span>}
                        {pickable && !choice!.decided && <em className="pl-tt-pick">교수님 선택 ▾</em>}
                      </div>
                    );
                  }),
              )}
              {/* 고르기 창: 블록과 같은 칸 안, 블록 바로 아래 */}
              {open && choices?.[open.code] && open.key.startsWith(`${open.code}-${d}-`) && (() => {
                const it = items.find((x) => x.code === open.code)!;
                const s = Number(open.key.split("-").pop());
                const e = mergeSlots(it.slots).find(([dd, ss]) => dd === d && ss === s)?.[2] ?? s + 60;
                const c = choices[open.code];
                return (
                  <div
                    className="pl-tt-picker"
                    style={{
                      // 아래쪽 블록은 위로 열어서 시간표 밖으로 넘치지 않게
                      ...(e > (h1 - 3) * 60
                        ? { top: `calc(var(--hour) * ${(s - h0 * 60) / 60} - 4px)`, transform: "translateY(-100%)" }
                        : { top: `calc(var(--hour) * ${(e - h0 * 60) / 60} + 4px)` }),
                      ...(d >= days - 2 ? { right: 2 } : { left: 2 }),
                    }}
                    onMouseEnter={keep}
                    onMouseLeave={closeSoon}
                    role="listbox"
                    aria-label={`${it.name} 분반`}
                  >
                    <div className="pl-tt-picker-title">{it.name} 분반 고르기</div>
                    {c.options.map((o) => (
                      <button
                        key={o.id}
                        role="option"
                        aria-selected={c.decided && o.id === c.chosen}
                        onClick={(ev) => { ev.stopPropagation(); onChoose!(open.code, o.id); setOpen(null); }}
                      >
                        <b>{o.id.split("-").pop()}</b> {o.prof}
                        {o.room && <span>{o.room}</span>}
                      </button>
                    ))}
                  </div>
                );
              })()}
            </div>
          ))}
        </div>
      </div>
      {noTime.length > 0 && (
        <div className="pl-notime">
          시간 미정 | {noTime.map((i) => `${i.name}(${i.credit})`).join(", ")}
        </div>
      )}
    </div>
  );
}
