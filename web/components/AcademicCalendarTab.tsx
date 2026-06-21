"use client";

import { useState } from "react";

// ── 학사일정 데이터 ──────────────────────────────────────────
// 날짜: "YYYY-MM-DD" 형식, 색상: "indigo"(기본) | "red" | "green" | "amber" | "purple"
const EVENTS: { date: string; label: string; color?: "indigo" | "red" | "green" | "amber" | "purple" }[] = [
  // 여기에 일정을 추가하세요
  // { date: "2026-03-02", label: "1학기 개강", color: "green" },
  // { date: "2026-04-13", label: "중간고사 시작", color: "red" },
  // { date: "2026-06-26", label: "1학기 종강", color: "amber" },
];
// ─────────────────────────────────────────────────────────────

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

const COLOR_CLASS = {
  indigo: "bg-indigo-100 text-indigo-700",
  red:    "bg-red-100 text-red-700",
  green:  "bg-green-100 text-green-700",
  amber:  "bg-amber-100 text-amber-700",
  purple: "bg-purple-100 text-purple-700",
};

export default function AcademicCalendarTab() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();

  const eventMap = new Map<string, { label: string; color: "indigo" | "red" | "green" | "amber" | "purple" }[]>();
  for (const ev of EVENTS) {
    if (!eventMap.has(ev.date)) eventMap.set(ev.date, []);
    eventMap.get(ev.date)!.push({ label: ev.label, color: ev.color ?? "indigo" });
  }

  const prevMonth = () => {
    if (month === 0) { setYear((y) => y - 1); setMonth(11); }
    else setMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setYear((y) => y + 1); setMonth(0); }
    else setMonth((m) => m + 1);
  };
  const goToday = () => { setYear(today.getFullYear()); setMonth(today.getMonth()); };

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  return (
    <div className="flex-1 overflow-auto p-4">
      <div className="max-w-3xl mx-auto bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <button onClick={prevMonth} className="p-1.5 rounded hover:bg-gray-100 text-gray-500 text-sm">◀</button>
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold text-gray-800">{year}년 {month + 1}월</h2>
            <button
              onClick={goToday}
              className="text-xs px-2 py-1 border border-gray-300 rounded hover:bg-gray-50 text-gray-500"
            >
              오늘
            </button>
          </div>
          <button onClick={nextMonth} className="p-1.5 rounded hover:bg-gray-100 text-gray-500 text-sm">▶</button>
        </div>

        {/* Weekday labels */}
        <div className="grid grid-cols-7 border-b border-gray-100 bg-gray-50">
          {WEEKDAYS.map((d, i) => (
            <div
              key={d}
              className={`py-2 text-center text-xs font-medium ${
                i === 0 ? "text-red-400" : i === 6 ? "text-blue-400" : "text-gray-500"
              }`}
            >
              {d}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7">
          {cells.map((day, idx) => {
            const dateStr = day
              ? `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
              : null;
            const events = dateStr ? (eventMap.get(dateStr) ?? []) : [];
            const isToday = dateStr === todayStr;
            const col = idx % 7;
            return (
              <div
                key={idx}
                className={`min-h-20 border-b border-r border-gray-100 p-1.5 ${
                  !day ? "bg-gray-50/40" : ""
                }`}
              >
                {day && (
                  <>
                    <span
                      className={`inline-flex items-center justify-center w-6 h-6 text-sm rounded-full mb-0.5 ${
                        isToday
                          ? "bg-indigo-600 text-white font-semibold"
                          : col === 0
                          ? "text-red-400"
                          : col === 6
                          ? "text-blue-400"
                          : "text-gray-700"
                      }`}
                    >
                      {day}
                    </span>
                    <div className="flex flex-col gap-0.5 mt-0.5">
                      {events.map((ev, i) => (
                        <span
                          key={i}
                          className={`text-[10px] leading-tight rounded px-1 py-0.5 truncate block ${COLOR_CLASS[ev.color]}`}
                          title={ev.label}
                        >
                          {ev.label}
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
}
