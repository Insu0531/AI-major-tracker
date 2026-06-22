"use client";

import { useState } from "react";

type EvColor = "indigo" | "red" | "green" | "amber" | "purple";
type CalEvent = { date: string; endDate?: string; label: string; color?: EvColor };

// ── 학사일정 데이터 ──────────────────────────────────────────
// 단일 일정:  { date: "2026-03-03", label: "개강", color: "amber" }
// 기간 일정:  { date: "2026-04-16", endDate: "2026-04-22", label: "중간고사 기간", color: "purple" }
// 색상: indigo(행정/대학원·기본) | red(공휴일) | green(수강) | amber(학기운영) | purple(시험)
const EVENTS: CalEvent[] = [
  // 1월
  { date: "2026-01-01", label: "신정", color: "red" },
  { date: "2026-01-02", label: "시무식" },
  { date: "2026-01-02", label: "복학원 접수시작" },
  { date: "2026-01-07", endDate: "2026-01-08", label: "[대학원] 완성논문 접수" },
  { date: "2026-01-20", endDate: "2026-01-22", label: "1학기 수강꾸러미 신청", color: "green" },

  // 2월
  { date: "2026-02-03", endDate: "2026-02-05", label: "2026학년도 신입생 등록" },
  { date: "2026-02-10", endDate: "2026-02-12", label: "1학기 수강신청", color: "green" },
  { date: "2026-02-13", label: "휴학원 접수시작" },
  { date: "2026-02-16", endDate: "2026-02-18", label: "설날연휴", color: "red" },
  { date: "2026-02-20", label: "2025학년도 전기학위수여식" },
  { date: "2026-02-23", endDate: "2026-02-26", label: "2026학년도 1학기 재학생 등록" },
  { date: "2026-02-23", endDate: "2026-02-25", label: "[대학원] 수료생 등록 신청" },
  { date: "2026-02-25", endDate: "2026-02-27", label: "[대학원] 종합시험 원서 접수" },

  // 3월
  { date: "2026-03-01", label: "삼일절", color: "red" },
  { date: "2026-03-01", label: "1학기 개시일", color: "amber" },
  { date: "2026-03-02", label: "대체공휴일", color: "red" },
  { date: "2026-03-02", endDate: "2026-03-03", label: "[대학원] 종합시험 시행계획 보고" },
  { date: "2026-03-02", endDate: "2026-03-06", label: "[대학원] 논문지도교수 위촉 보고" },
  { date: "2026-03-03", label: "개강", color: "amber" },
  { date: "2026-03-04", endDate: "2026-03-09", label: "1학기 수강변경", color: "green" },
  { date: "2026-03-04", endDate: "2026-03-10", label: "[대학원] 종합시험 시행" },
  { date: "2026-03-09", endDate: "2026-03-10", label: "[대학원] 수료생 등록금 납부" },
  { date: "2026-03-12", endDate: "2026-03-13", label: "[대학원] 종합시험 결과 보고" },
  { date: "2026-03-16", endDate: "2026-03-18", label: "[대학원] 학위논문 제출예정자 신청" },
  { date: "2026-03-17", endDate: "2026-03-19", label: "1학기 수강정정", color: "green" },
  { date: "2026-03-23", label: "복학원 접수종료" },
  { date: "2026-03-27", label: "수업일수 1/4", color: "amber" },

  // 4월
  { date: "2026-04-01", endDate: "2026-04-03", label: "[대학원] 논문심사위원 추천" },
  { date: "2026-04-08", endDate: "2026-04-10", label: "[대학원] 심사용 논문 접수" },
  { date: "2026-04-13", endDate: "2026-04-14", label: "[대학원] 논문 접수 결과 보고" },
  { date: "2026-04-15", endDate: "2026-04-16", label: "[대학원] 논문심사료 납부" },
  { date: "2026-04-16", endDate: "2026-04-22", label: "중간고사 기간", color: "purple" },
  { date: "2026-04-23", label: "수업일수 2/4", color: "amber" },
  { date: "2026-04-23", label: "일반휴학원 접수종료" },
  { date: "2026-04-23", label: "[대학원] 논문심사위원 위촉 승인" },
  { date: "2026-04-27", label: "[대학원] 학위논문 심사 시작" },

  // 5월
  { date: "2026-05-01", label: "근로자의 날", color: "red" },
  { date: "2026-05-05", label: "어린이날", color: "red" },
  { date: "2026-05-22", label: "수업일수 3/4", color: "amber" },
  { date: "2026-05-22", label: "육아·질병·창업휴학원 접수종료" },
  { date: "2026-05-25", label: "석가탄신일 대체공휴일", color: "red" },
  { date: "2026-05-28", label: "개교 80주년 기념일", color: "red" },

  // 6월
  { date: "2026-06-01", endDate: "2026-06-05", label: "[대학원] 학위논문 심사 종료" },
  { date: "2026-06-03", label: "제9회 지방선거", color: "red" },
  { date: "2026-06-06", label: "현충일", color: "red" },
  { date: "2026-06-08", endDate: "2026-06-09", label: "[대학원] 논문 심사 결과 보고" },
  { date: "2026-06-09", endDate: "2026-06-15", label: "보강기간", color: "amber" },
  { date: "2026-06-16", endDate: "2026-06-22", label: "기말고사 기간", color: "purple" },
  { date: "2026-06-22", endDate: "2026-06-29", label: "[대학원] 원문파일 접수" },
  { date: "2026-06-23", label: "하계방학", color: "amber" },
  { date: "2026-06-24", label: "여름계절수업 개강", color: "amber" },

  // 7월
  { date: "2026-07-01", label: "복학원 접수시작" },
  { date: "2026-07-17", label: "제헌절", color: "red" },
  { date: "2026-07-22", endDate: "2026-07-24", label: "2학기 수강꾸러미 신청", color: "green" },

  // 8월
  { date: "2026-08-11", endDate: "2026-08-13", label: "2학기 수강신청", color: "green" },
  { date: "2026-08-17", label: "광복절 대체공휴일", color: "red" },
  { date: "2026-08-17", endDate: "2026-08-19", label: "[대학원] 수료생 등록 신청" },
  { date: "2026-08-18", label: "휴학원 접수시작" },
  { date: "2026-08-19", endDate: "2026-08-21", label: "[대학원] 종합시험 원서 접수" },
  { date: "2026-08-21", label: "2025학년도 후기 학위수여식" },
  { date: "2026-08-24", endDate: "2026-08-27", label: "2026학년도 2학기 재학생 등록" },
  { date: "2026-08-24", endDate: "2026-08-25", label: "[대학원] 종합시험 시행계획 보고" },
  { date: "2026-08-26", endDate: "2026-09-01", label: "[대학원] 종합시험 시행" },

  // 9월
  { date: "2026-09-01", label: "2학기 개시일", color: "amber" },
  { date: "2026-09-01", label: "개강", color: "amber" },
  { date: "2026-09-01", endDate: "2026-09-04", label: "[대학원] 논문지도교수 위촉 보고" },
  { date: "2026-09-02", endDate: "2026-09-07", label: "2학기 수강변경", color: "green" },
  { date: "2026-09-02", endDate: "2026-09-03", label: "[대학원] 수료생 등록금 납부" },
  { date: "2026-09-03", endDate: "2026-09-04", label: "[대학원] 종합시험 결과 보고" },
  { date: "2026-09-07", endDate: "2026-09-11", label: "2027학년도 대학 수시모집 원서접수" },
  { date: "2026-09-09", endDate: "2026-09-11", label: "[대학원] 학위논문 제출예정자 신청" },
  { date: "2026-09-15", endDate: "2026-09-17", label: "2학기 수강정정", color: "green" },
  { date: "2026-09-21", label: "복학원 접수종료" },
  { date: "2026-09-21", endDate: "2026-09-23", label: "[대학원] 논문심사위원 추천" },
  { date: "2026-09-24", endDate: "2026-09-27", label: "추석연휴", color: "red" },
  { date: "2026-09-29", label: "수업일수 1/4", color: "amber" },
  { date: "2026-09-30", endDate: "2026-10-02", label: "[대학원] 심사용 논문 접수" },

  // 10월
  { date: "2026-10-05", label: "개천절 대체공휴일", color: "red" },
  { date: "2026-10-06", endDate: "2026-10-07", label: "[대학원] 논문 접수 결과 보고" },
  { date: "2026-10-09", label: "한글날", color: "red" },
  { date: "2026-10-14", endDate: "2026-10-15", label: "[대학원] 논문심사료 납부" },
  { date: "2026-10-15", label: "[대학원] 논문심사위원 위촉 승인" },
  { date: "2026-10-19", label: "[대학원] 학위논문 심사 시작" },
  { date: "2026-10-21", endDate: "2026-10-27", label: "중간고사 기간", color: "purple" },
  { date: "2026-10-28", label: "수업일수 2/4", color: "amber" },
  { date: "2026-10-28", label: "일반휴학원 접수종료" },

  // 11월
  { date: "2026-11-24", label: "수업일수 3/4", color: "amber" },
  { date: "2026-11-24", label: "육아·질병·창업휴학원 접수종료" },

  // 12월
  { date: "2026-12-08", endDate: "2026-12-11", label: "보강기간", color: "amber" },
  { date: "2026-12-11", label: "[대학원] 학위논문 심사 종료" },
  { date: "2026-12-14", endDate: "2026-12-18", label: "기말고사 기간", color: "purple" },
  { date: "2026-12-14", endDate: "2026-12-15", label: "[대학원] 논문 심사 결과 보고" },
  { date: "2026-12-21", label: "동계방학", color: "amber" },
  { date: "2026-12-22", label: "겨울계절 수업개강", color: "amber" },
  { date: "2026-12-25", label: "성탄절", color: "red" },
  { date: "2026-12-28", endDate: "2027-01-05", label: "[대학원] 원문파일 접수" },
  { date: "2026-12-31", label: "종무식" },
];
// ─────────────────────────────────────────────────────────────

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

const COLOR_CLASS: Record<EvColor, string> = {
  indigo: "bg-indigo-100 text-indigo-700",
  red:    "bg-red-100 text-red-700",
  green:  "bg-green-100 text-green-700",
  amber:  "bg-amber-100 text-amber-700",
  purple: "bg-purple-100 text-purple-700",
};

const DOT_CLASS: Record<EvColor, string> = {
  indigo: "bg-indigo-400",
  red:    "bg-red-400",
  green:  "bg-green-400",
  amber:  "bg-amber-400",
  purple: "bg-purple-400",
};

const MONTHS = ["1월","2월","3월","4월","5월","6월","7월","8월","9월","10월","11월","12월"];

const isGrad = (ev: CalEvent) => ev.label.startsWith("[대학원]");

// 해당 날짜에 걸치는 일정(단일 + 기간) — 기간이 먼저, 시작일 빠른 순
function eventsOnDate(dateStr: string, showGrad: boolean): CalEvent[] {
  return EVENTS
    .filter((ev) => {
      if (!showGrad && isGrad(ev)) return false;
      const end = ev.endDate ?? ev.date;
      return dateStr >= ev.date && dateStr <= end;
    })
    .sort((a, b) => {
      const ar = a.endDate ? 0 : 1;
      const br = b.endDate ? 0 : 1;
      if (ar !== br) return ar - br;
      return a.date.localeCompare(b.date);
    });
}

const fmtMD = (s: string) => `${parseInt(s.split("-")[1])}월 ${parseInt(s.split("-")[2])}일`;

export default function AcademicCalendarTab() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showGrad, setShowGrad] = useState(false);

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();

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

  // 이번 달에 걸치는 전체 일정 (기간이 달 경계를 넘는 경우도 포함, 시작일순)
  const monthStart = `${monthPrefix}-01`;
  const monthEnd = `${monthPrefix}-${String(daysInMonth).padStart(2, "0")}`;
  const monthEvents = EVENTS
    .filter((ev) => {
      if (!showGrad && isGrad(ev)) return false;
      const end = ev.endDate ?? ev.date;
      return ev.date <= monthEnd && end >= monthStart;
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  // 오른쪽 목록에 보여줄 리스트
  const list = selectedDate ? eventsOnDate(selectedDate, showGrad) : monthEvents;

  return (
    <div className="flex-1 flex overflow-hidden p-4 gap-4">
      {/* ── 왼쪽: 달력 (65%) ── */}
      <div className="flex flex-col bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden" style={{ flex: "0 0 65%" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 shrink-0">
          <button onClick={prevMonth} className="p-1.5 rounded hover:bg-gray-100 text-gray-500">◀</button>
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-gray-800">{year}년 {MONTHS[month]}</h2>
            <button
              onClick={goToday}
              className="text-sm px-2 py-1 border border-gray-300 rounded hover:bg-gray-50 text-gray-500"
            >
              오늘
            </button>
            <button
              onClick={() => setShowGrad((v) => !v)}
              className={`text-sm px-2 py-1 border rounded ${
                showGrad
                  ? "border-indigo-300 bg-indigo-50 text-indigo-600"
                  : "border-gray-300 hover:bg-gray-50 text-gray-500"
              }`}
              title="대학원 일정 표시/숨김"
            >
              대학원 {showGrad ? "표시" : "숨김"}
            </button>
          </div>
          <button onClick={nextMonth} className="p-1.5 rounded hover:bg-gray-100 text-gray-500">▶</button>
        </div>

        {/* Weekday labels */}
        <div className="grid grid-cols-7 border-b border-gray-100 bg-gray-50 shrink-0">
          {WEEKDAYS.map((d, i) => (
            <div
              key={d}
              className={`py-2 text-center text-sm font-medium ${
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
            const events = dateStr ? eventsOnDate(dateStr, showGrad) : [];
            const isToday = dateStr === todayStr;
            const isSelected = dateStr === selectedDate;
            const col = idx % 7;
            return (
              <div
                key={idx}
                onClick={() => day && setSelectedDate(isSelected ? null : dateStr)}
                className={`border-b border-r border-gray-100 p-1.5 flex flex-col overflow-hidden transition-colors ${
                  !day ? "bg-gray-50/40" : isSelected ? "bg-indigo-50 cursor-pointer" : "hover:bg-gray-50 cursor-pointer"
                }`}
              >
                {day && (
                  <>
                    <span
                      className={`inline-flex items-center justify-center w-7 h-7 text-base rounded-full mb-1 font-medium ${
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
                    <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                      {events.map((ev, i) => {
                        const color = ev.color ?? "indigo";
                        if (!ev.endDate) {
                          // 단일 일정
                          return (
                            <span
                              key={i}
                              className={`text-xs leading-tight rounded px-1 py-0.5 truncate ${COLOR_CLASS[color]}`}
                              title={ev.label}
                            >
                              {ev.label}
                            </span>
                          );
                        }
                        // 기간 일정 — 연속 띠로 표시
                        const isStart = dateStr === ev.date;
                        const isEnd = dateStr === ev.endDate;
                        // 시작일 / 주의 첫날(일) / 달의 1일에는 라벨 표시
                        const showLabel = isStart || col === 0 || day === 1;
                        return (
                          <span
                            key={i}
                            className={`text-xs leading-tight py-0.5 truncate -mx-1.5 ${COLOR_CLASS[color]} ${
                              isStart ? "rounded-l-sm pl-1.5" : "pl-1"
                            } ${isEnd ? "rounded-r-sm pr-1.5" : "pr-1"}`}
                            title={ev.label}
                          >
                            {showLabel ? ev.label : " "}
                          </span>
                        );
                      })}
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
          <h3 className="text-base font-semibold text-gray-700">
            {selectedDate
              ? `${parseInt(selectedDate.split("-")[1])}월 ${parseInt(selectedDate.split("-")[2])}일`
              : `${MONTHS[month]} 일정`}
          </h3>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-2">
          {list.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-300 text-sm gap-2 pb-8">
              <span className="text-3xl">📅</span>
              <span>{selectedDate ? "일정 없음" : "이번 달 일정 없음"}</span>
            </div>
          ) : (
            <div className="flex flex-col gap-2 py-1">
              {list.map((ev, i) => {
                const color = ev.color ?? "indigo";
                const isRange = !!ev.endDate;
                const d = new Date(ev.date + "T00:00:00");
                const dayOfWeek = WEEKDAYS[d.getDay()];
                const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                return (
                  <div key={i} className="flex items-start gap-3 px-2 py-2 rounded-lg hover:bg-gray-50">
                    <div className="shrink-0 w-10 text-center">
                      {!selectedDate ? (
                        <>
                          <div className="text-sm text-gray-400">{parseInt(ev.date.split("-")[1])}월</div>
                          <div className="text-xl font-bold text-gray-700 leading-none">{parseInt(ev.date.split("-")[2])}</div>
                          <div className={`text-sm ${isWeekend ? "text-red-400" : "text-gray-400"}`}>{dayOfWeek}</div>
                        </>
                      ) : (
                        <div className={`text-sm ${isWeekend ? "text-red-400" : "text-gray-400"}`}>{dayOfWeek}</div>
                      )}
                    </div>
                    <div className="flex items-start gap-2 flex-1 min-w-0">
                      <span className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${DOT_CLASS[color]}`} />
                      <div className="min-w-0">
                        <span className="text-base text-gray-700 leading-snug">{ev.label}</span>
                        {isRange && (
                          <div className="text-sm text-gray-400 mt-0.5">
                            {fmtMD(ev.date)} ~ {fmtMD(ev.endDate!)}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
