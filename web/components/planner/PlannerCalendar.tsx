"use client";

import { useState } from "react";
import { EVENTS, type CalEvent, type EvColor } from "@/lib/planner/calendarEvents";

/** 학사일정. 일정 데이터는 lib/planner/calendarEvents.ts */
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const KIND: Record<EvColor, string> = { indigo: "etc", red: "holiday", green: "reg", amber: "term", purple: "exam" };
const LEGEND: [string, string][] = [["reg", "수강"], ["term", "학기 운영"], ["exam", "시험"], ["holiday", "공휴일"], ["etc", "행정"]];

const pad = (n: number) => String(n).padStart(2, "0");
const isGrad = (ev: CalEvent) => ev.label.startsWith("[대학원]");
const fmtRange = (ev: CalEvent) => {
  const md = (s: string) => `${+s.slice(5, 7)}/${+s.slice(8, 10)}`;
  return ev.endDate ? `${md(ev.date)} ~ ${md(ev.endDate)}` : md(ev.date);
};

export default function PlannerCalendar() {
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  const [ym, setYm] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const [sel, setSel] = useState<string | null>(null);
  const [grad, setGrad] = useState(false);

  const { y, m } = ym;
  const prefix = `${y}-${pad(m + 1)}`;
  const days = new Date(y, m + 1, 0).getDate();
  const first = new Date(y, m, 1).getDay();
  const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);

  const visible = EVENTS.filter((ev) => grad || !isGrad(ev));
  const on = (d: string) => visible.filter((ev) => d >= ev.date && d <= (ev.endDate ?? ev.date));
  const monthList = visible
    .filter((ev) => ev.date <= `${prefix}-${pad(days)}` && (ev.endDate ?? ev.date) >= `${prefix}-01`)
    .sort((a, b) => a.date.localeCompare(b.date));
  const list = sel ? on(sel) : monthList;
  const move = (dm: number) => { const d = new Date(y, m + dm, 1); setYm({ y: d.getFullYear(), m: d.getMonth() }); setSel(null); };

  return (
    <div className="pl-cal">
      <div className="pl-cal-head">
        <button className="pl-btn sm" aria-label="이전 달" onClick={() => move(-1)}>‹</button>
        <h4>{y}년 {m + 1}월</h4>
        <button className="pl-btn sm" aria-label="다음 달" onClick={() => move(1)}>›</button>
        <button className="pl-chip" onClick={() => { setYm({ y: today.getFullYear(), m: today.getMonth() }); setSel(null); }}>오늘</button>
        <button className="pl-chip" aria-pressed={grad} onClick={() => setGrad((v) => !v)}>대학원 일정</button>
      </div>
      <div className="pl-cal-body">
        <div className="pl-cal-grid" role="grid" aria-label={`${y}년 ${m + 1}월`}>
          {WEEKDAYS.map((w, i) => <div key={w} className={`pl-cal-wd${i === 0 ? " sun" : i === 6 ? " sat" : ""}`}>{w}</div>)}
          {cells.map((d, i) => {
            if (!d) return <div key={i} className="pl-cal-cell empty" />;
            const ds = `${prefix}-${pad(d)}`;
            const evs = on(ds);
            return (
              <button key={i} className={`pl-cal-cell${ds === todayStr ? " today" : ""}${ds === sel ? " sel" : ""}${i % 7 === 0 ? " sun" : i % 7 === 6 ? " sat" : ""}`}
                aria-label={`${m + 1}월 ${d}일${evs.length ? `, 일정 ${evs.length}개` : ""}`}
                onClick={() => setSel(ds === sel ? null : ds)}>
                <span className="pl-cal-day">{d}</span>
                {evs.slice(0, 2).map((ev, k) => <span key={k} className="pl-cal-ev" data-kind={KIND[ev.color ?? "indigo"]}>{ev.label.replace(/^\[대학원\] /, "")}</span>)}
                {evs.length > 2 && <span className="pl-cal-more">+{evs.length - 2}</span>}
              </button>
            );
          })}
        </div>
        <div className="pl-cal-list">
          <div className="pl-label">{sel ? `${+sel.slice(5, 7)}월 ${+sel.slice(8, 10)}일 일정` : `${m + 1}월 일정`} <span className="pl-muted" style={{ fontWeight: 500 }}>{list.length}개</span></div>
          {list.length === 0 && <div className="pl-hint">일정이 없어요.</div>}
          {list.map((ev, i) => (
            <div key={i} className="pl-cal-row">
              <span className="pl-cal-dot" data-kind={KIND[ev.color ?? "indigo"]} />
              <span className="pl-cal-date">{fmtRange(ev)}</span>
              <span>{ev.label}</span>
            </div>
          ))}
          <div className="pl-cal-legend">
            {LEGEND.map(([k, l]) => <span key={k}><span className="pl-cal-dot" data-kind={k} />{l}</span>)}
          </div>
        </div>
      </div>
    </div>
  );
}
