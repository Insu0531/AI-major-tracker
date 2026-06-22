"use client";

import { Section } from "@/lib/timetable";
import { useRef, useState, forwardRef } from "react";

const DAY_LABELS = ["월", "화", "수", "목", "금"];
const START_H = 9;
const END_H = 22;
const BLOCK_COLORS = [
  "#3d6087", "#c47222", "#c04045", "#5a9090", "#44803b",
  "#c9a830", "#8d5f85", "#e07d8a", "#7a5a47", "#908c88",
];

type Block = {
  day: number;
  start: number;
  end: number;
  name: string;
  prof: string;
  timeStr: string;
  location: string;
  color: string;
};

function comboToBlocks(combo: Section[]): Block[] {
  // (name, day) → merged slot, then dedupe by (name, day, start, end) + merge profs
  const merged = new Map<string, { start: number; end: number }>();
  for (const sec of combo) {
    for (const t of sec.times) {
      const key = `${sec.name}|${t.day}`;
      const prev = merged.get(key);
      if (!prev) merged.set(key, { start: t.start, end: t.end });
      else merged.set(key, { start: Math.min(prev.start, t.start), end: Math.max(prev.end, t.end) });
    }
  }

  // slot_key → block (merge profs for same slot)
  const slotMap = new Map<string, Block>();
  for (let si = 0; si < combo.length; si++) {
    const sec = combo[si];
    for (const t of sec.times) {
      const { start, end } = merged.get(`${sec.name}|${t.day}`)!;
      const slotKey = `${sec.name}|${t.day}|${start}|${end}`;
      if (!slotMap.has(slotKey)) {
        slotMap.set(slotKey, {
          day: t.day,
          start,
          end,
          name: sec.name,
          prof: sec.profs.join(" / "),
          timeStr: sec.timeStr,
          location: sec.location,
          color: BLOCK_COLORS[si % BLOCK_COLORS.length],
        });
      }
    }
  }
  return [...slotMap.values()];
}

// 모바일 세로에서도 읽을 수 있는 최소 열 너비
const MIN_COL_W = 52;
const LABEL_W = 36;
const MIN_GRID_W = LABEL_W + DAY_LABELS.length * MIN_COL_W;

const TimetableGrid = forwardRef<HTMLDivElement, { combo: Section[] }>(function TimetableGrid({ combo }, ref) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const totalHours = END_H - START_H;
  const rowH = 52;
  const blocks = comboToBlocks(combo);

  return (
    <div ref={(el) => { containerRef.current = el; if (typeof ref === "function") ref(el); else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = el; }} className="relative overflow-auto border border-gray-200 rounded bg-white select-none h-full">
      {/* 최소 너비 래퍼 — 세로 모드에서 가로 스크롤 */}
      <div style={{ minWidth: MIN_GRID_W }}>
        {/* Header row */}
        <div className="flex sticky top-0 z-10 bg-white border-b border-gray-200">
          <div style={{ minWidth: LABEL_W }} className="text-xs text-gray-400 flex items-center justify-center py-1 shrink-0" />
          {DAY_LABELS.map((d) => (
            <div key={d} className="flex-1 text-center text-xs font-bold py-1.5 text-gray-700 border-l border-gray-100">
              {d}
            </div>
          ))}
        </div>

        {/* Grid body */}
        <div className="relative flex" style={{ height: totalHours * rowH }}>
          {/* Time labels */}
          <div style={{ minWidth: LABEL_W }} className="relative shrink-0">
            {Array.from({ length: totalHours + 1 }, (_, i) => (
              <div
                key={i}
                className="absolute right-1 text-[11px] text-gray-400 font-medium"
                style={{ top: i * rowH - 7 }}
              >
                {START_H + i}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {DAY_LABELS.map((_, dayIdx) => (
            <div key={dayIdx} className="flex-1 relative border-l border-gray-100">
              {Array.from({ length: totalHours }, (_, i) => (
                <div key={i} className="absolute w-full border-t border-gray-100" style={{ top: i * rowH }} />
              ))}
              {Array.from({ length: totalHours }, (_, i) => (
                <div key={`h${i}`} className="absolute w-full border-t border-gray-100 opacity-50" style={{ top: i * rowH + rowH / 2 }} />
              ))}
            </div>
          ))}

          {/* Blocks overlay */}
          {blocks.map((b, i) => {
            const colW = `calc((100% - ${LABEL_W}px) / ${DAY_LABELS.length})`;
            const top = (b.start - START_H) * rowH;
            const height = (b.end - b.start) * rowH;
            const left = `calc(${LABEL_W}px + ${b.day} * (100% - ${LABEL_W}px) / ${DAY_LABELS.length} + 2px)`;
            const shortName = b.name.replace(/\s*\(.*?\)\s*$/, "").trim();
            const profs = b.prof.split(" / ");

            return (
              <div
                key={i}
                className="absolute rounded overflow-hidden cursor-pointer"
                style={{ top: top + 1, height: height - 2, left, width: `calc(${colW} - 4px)`, backgroundColor: b.color }}
                onMouseEnter={(e) => {
                  const rect = containerRef.current?.getBoundingClientRect();
                  if (!rect) return;
                  const profLine = profs.length > 1
                    ? profs.join(" / ") + "\n※ 교수별 분반 선택 가능"
                    : profs[0];
                  setTooltip({ x: e.clientX - rect.left + 12, y: e.clientY - rect.top + 8, text: `${b.name}\n${profLine}\n${b.timeStr}` });
                }}
                onMouseMove={(e) => {
                  const rect = containerRef.current?.getBoundingClientRect();
                  if (!rect) return;
                  setTooltip((prev) => prev ? { ...prev, x: e.clientX - rect.left + 12, y: e.clientY - rect.top + 8 } : prev);
                }}
                onMouseLeave={() => setTooltip(null)}
              >
                <p className="text-white text-xs font-semibold leading-tight px-1 pt-0.5 break-keep" style={{ WebkitFontSmoothing: "antialiased" }}>
                  {shortName}
                </p>
                <p className="text-white text-[11px] font-semibold px-1 break-keep opacity-90" style={{ WebkitFontSmoothing: "antialiased" }}>
                  {profs.length > 1 ? `(${profs.length}개 분반)` : profs[0]}
                </p>
                {b.location && b.location.split("\n").map((line, i) => (
                  <p key={i} className="text-white text-[10px] font-semibold px-1 break-keep opacity-75 leading-tight" style={{ WebkitFontSmoothing: "antialiased" }}>
                    {line.replace(/^(산격동 캠퍼스|상주캠퍼스|동인동 캠퍼스)\s*/, "")}
                  </p>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="absolute z-50 bg-yellow-50 border border-gray-300 rounded shadow-md px-2.5 py-2 text-sm pointer-events-none whitespace-pre leading-relaxed text-gray-800"
          style={{ left: tooltip.x, top: tooltip.y, maxWidth: "calc(100% - 16px)" }}
        >
          {tooltip.text}
        </div>
      )}
    </div>
  );
});

export default TimetableGrid;
