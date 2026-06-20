"use client";

import { Section } from "@/lib/timetable";
import { useRef, useState } from "react";

const DAY_LABELS = ["월", "화", "수", "목", "금"];
const START_H = 9;
const END_H = 22;
const BLOCK_COLORS = [
  "#4e79a7", "#f28e2b", "#e15759", "#76b7b2", "#59a14f",
  "#edc948", "#b07aa1", "#ff9da7", "#9c755f", "#bab0ac",
];

type Block = {
  day: number;
  start: number;
  end: number;
  name: string;
  prof: string;
  timeStr: string;
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
          color: BLOCK_COLORS[si % BLOCK_COLORS.length],
        });
      }
    }
  }
  return [...slotMap.values()];
}

export default function TimetableGrid({ combo }: { combo: Section[] }) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const totalHours = END_H - START_H;
  const rowH = 48; // px per hour
  const labelW = 48;
  const blocks = comboToBlocks(combo);

  return (
    <div ref={containerRef} className="relative overflow-auto border border-gray-200 rounded bg-white select-none">
      {/* Header row */}
      <div className="flex sticky top-0 z-10 bg-white border-b border-gray-200">
        <div style={{ minWidth: labelW }} className="text-xs text-gray-400 flex items-center justify-center py-1" />
        {DAY_LABELS.map((d) => (
          <div key={d} className="flex-1 text-center text-xs font-bold py-1 text-gray-600 border-l border-gray-100">
            {d}
          </div>
        ))}
      </div>

      {/* Grid body */}
      <div className="relative flex" style={{ height: totalHours * rowH }}>
        {/* Time labels */}
        <div style={{ minWidth: labelW }} className="relative shrink-0">
          {Array.from({ length: totalHours + 1 }, (_, i) => (
            <div
              key={i}
              className="absolute right-1 text-xs text-gray-400"
              style={{ top: i * rowH - 6 }}
            >
              {START_H + i}
            </div>
          ))}
        </div>

        {/* Day columns */}
        {DAY_LABELS.map((_, dayIdx) => (
          <div key={dayIdx} className="flex-1 relative border-l border-gray-100">
            {/* Hour lines */}
            {Array.from({ length: totalHours }, (_, i) => (
              <div
                key={i}
                className="absolute w-full border-t border-gray-100"
                style={{ top: i * rowH }}
              />
            ))}
            {/* Half-hour lines */}
            {Array.from({ length: totalHours }, (_, i) => (
              <div
                key={`h${i}`}
                className="absolute w-full border-t border-gray-50"
                style={{ top: i * rowH + rowH / 2 }}
              />
            ))}
          </div>
        ))}

        {/* Blocks overlay */}
        {blocks.map((b, i) => {
          const colW = `calc((100% - ${labelW}px) / ${DAY_LABELS.length})`;
          const top = (b.start - START_H) * rowH;
          const height = (b.end - b.start) * rowH;
          const left = `calc(${labelW}px + ${b.day} * (100% - ${labelW}px) / ${DAY_LABELS.length} + 2px)`;
          const shortName = b.name.replace(/\s*\(.*?\)\s*$/, "").trim();

          return (
            <div
              key={i}
              className="absolute rounded overflow-hidden cursor-pointer"
              style={{
                top: top + 1,
                height: height - 2,
                left,
                width: `calc(${colW} - 4px)`,
                backgroundColor: b.color,
              }}
              onMouseEnter={(e) => {
                const rect = containerRef.current?.getBoundingClientRect();
                if (!rect) return;
                const profs = b.prof.split(" / ");
                const profLine = profs.length > 1
                  ? profs.join(" / ") + "\n※ 교수별 분반 선택 가능"
                  : profs[0];
                setTooltip({
                  x: e.clientX - rect.left + 12,
                  y: e.clientY - rect.top + 8,
                  text: `${b.name}\n${profLine}\n${b.timeStr}`,
                });
              }}
              onMouseMove={(e) => {
                const rect = containerRef.current?.getBoundingClientRect();
                if (!rect) return;
                setTooltip((prev) =>
                  prev ? { ...prev, x: e.clientX - rect.left + 12, y: e.clientY - rect.top + 8 } : prev
                );
              }}
              onMouseLeave={() => setTooltip(null)}
            >
              <p className="text-white text-xs font-bold leading-tight px-1 pt-0.5 truncate">
                {shortName}
              </p>
              {(() => {
                const profs = b.prof.split(" / ");
                return (
                  <p className="text-white/80 text-[11px] px-1 truncate">
                    {profs.length > 1 ? `(${profs.length}개 분반)` : profs[0]}
                  </p>
                );
              })()}
            </div>
          );
        })}
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="absolute z-50 bg-yellow-50 border border-gray-300 rounded shadow-md px-2 py-1.5 text-xs pointer-events-none whitespace-pre"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          {tooltip.text}
        </div>
      )}
    </div>
  );
}
