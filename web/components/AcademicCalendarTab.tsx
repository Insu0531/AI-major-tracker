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

const DOT_CLASS = {
  indigo: "bg-indigo-400",
  red:    "bg-red-400",
  green:  "bg-green-400",
  amber:  "bg-amber-400",
  purple: "bg-purple-400",
};

const MONTHS = ["1월","2월","3월","4월","5월","6월","7월","8월","9월","10월","11월","12월"];

export default function AcademicCalendarTab() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

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
    setSelectedDate(null);
  };
  const nextMonth = () => {
    if (month === 11) { setYear((y) => y + 1); setMonth(0); }
    else setMonth((m) => m + 1);
    setSelectedDate(null);
  };
  const goToday = () => {
    setYear(today.getFullYear());
    setMonth(today.getMonth());
    setSelectedDate(null);
  };

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const monthPrefix = `${year}-${String(month + 1).padStart(2, "0")}`;

  // 이번 달 전체 일정 (날짜순)
  const monthEvents = EVENTS
    .filter((ev) => ev.date.startsWith(monthPrefix))
    .sort((a, b) => a.date.localeCompare(b.date));

  // 선택된 날짜의 일정
  const selectedEvents = selectedDate ? (eventMap.get(selectedDate) ?? []) : null;

  return (
    <div className="flex-1 flex overflow-hidden p-4 gap-4">
      {/* ── 왼쪽: 달력 (65%) ── */}
      <div className="flex flex-col bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden" style={{ flex: "0 0 65%" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 shrink-0">
          <button onClick={prevMonth} className="p-1.5 rounded hover:bg-gray-100 text-gray-500">◀</button>
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold text-gray-800">{year}년 {MONTHS[month]}</h2>
            <button
              onClick={goToday}
              className="text-xs px-2 py-1 border border-gray-300 rounded hover:bg-gray-50 text-gray-500"
            >
              오늘
            </button>
          </div>
          <button onClick={nextMonth} className="p-1.5 rounded hover:bg-gray-100 text-gray-500">▶</button>
        </div>

        {/* Weekday labels */}
        <div className="grid grid-cols-7 border-b border-gray-100 bg-gray-50 shrink-0">
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
        <div className="grid grid-cols-7 flex-1">
          {cells.map((day, idx) => {
            const dateStr = day ? `${monthPrefix}-${String(day).padStart(2, "0")}` : null;
            const events = dateStr ? (eventMap.get(dateStr) ?? []) : [];
            const isToday = dateStr === todayStr;
            const isSelected = dateStr === selectedDate;
            const col = idx % 7;
            return (
              <div
                key={idx}
                onClick={() => day && setSelectedDate(isSelected ? null : dateStr)}
                className={`border-b border-r border-gray-100 p-1.5 flex flex-col transition-colors ${
                  !day ? "bg-gray-50/40" : isSelected ? "bg-indigo-50 cursor-pointer" : "hover:bg-gray-50 cursor-pointer"
                }`}
              >
                {day && (
                  <>
                    <span
                      className={`inline-flex items-center justify-center w-7 h-7 text-sm rounded-full mb-1 font-medium ${
                        isToday
                          ? "bg-indigo-600 text-white"
                          : isSelected
                          ? "bg-indigo-200 text-indigo-800"
                          : col === 0
                          ? "text-red-400"
                          : col === 6
                          ? "text-blue-400"
                          : "text-gray-700"
                      }`}
                    >
                      {day}
                    </span>
                    <div className="flex flex-col gap-0.5 flex-1">
                      {events.map((ev, i) => (
                        <span
                          key={i}
                          className={`text-[10px] leading-tight rounded px-1 py-0.5 truncate ${COLOR_CLASS[ev.color]}`}
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

      {/* ── 오른쪽: 일정 목록 (35%) ── */}
      <div className="flex flex-col bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex-1">
        <div className="px-4 py-3 border-b border-gray-100 shrink-0">
          <h3 className="text-sm font-semibold text-gray-700">
            {selectedDate
              ? `${parseInt(selectedDate.split("-")[1])}월 ${parseInt(selectedDate.split("-")[2])}일`
              : `${MONTHS[month]} 일정`}
          </h3>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-2">
          {(() => {
            const list = selectedDate
              ? (selectedEvents ?? []).map((ev) => ({ date: selectedDate, ...ev }))
              : monthEvents.map((ev) => ({ date: ev.date, label: ev.label, color: ev.color ?? "indigo" as const }));

            if (list.length === 0) {
              return (
                <div className="flex flex-col items-center justify-center h-full text-gray-300 text-sm gap-2 pb-8">
                  <span className="text-3xl">📅</span>
                  <span>{selectedDate ? "일정 없음" : "이번 달 일정 없음"}</span>
                </div>
              );
            }

            return (
              <div className="flex flex-col gap-2 py-1">
                {list.map((ev, i) => {
                  const d = new Date(ev.date + "T00:00:00");
                  const dayOfWeek = WEEKDAYS[d.getDay()];
                  const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                  return (
                    <div key={i} className="flex items-start gap-3 px-2 py-2 rounded-lg hover:bg-gray-50">
                      <div className="shrink-0 w-10 text-center">
                        {!selectedDate && (
                          <>
                            <div className="text-xs text-gray-400">{parseInt(ev.date.split("-")[1])}월</div>
                            <div className="text-lg font-bold text-gray-700 leading-none">{parseInt(ev.date.split("-")[2])}</div>
                            <div className={`text-xs ${isWeekend ? "text-red-400" : "text-gray-400"}`}>{dayOfWeek}</div>
                          </>
                        )}
                        {selectedDate && (
                          <div className={`text-xs ${isWeekend ? "text-red-400" : "text-gray-400"}`}>{dayOfWeek}</div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${DOT_CLASS[ev.color]}`} />
                        <span className="text-sm text-gray-700 leading-snug">{ev.label}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
