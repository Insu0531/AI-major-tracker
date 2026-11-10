"use client";

import { DAY_NAMES, fmtMin } from "@/lib/planner/data";
import type { TimetableItem } from "@/lib/planner/exportImage";
import type { EngineResponse } from "@/lib/planner/types";
import Timetable from "./Timetable";

export type ResultView = {
  items: (TimetableItem & { sectionIds: string[]; options: { id: string; prof: string }[]; chosen: string })[];
};

export default function ResultPanel({
  response,
  running,
  cartEmpty,
  selIdx,
  onSelect,
  view,
  names,
  onImage,
  onSave,
  onCodes,
  onBack,
}: {
  response: EngineResponse | null;
  running: boolean;
  cartEmpty: boolean;
  selIdx: number;
  onSelect: (i: number) => void;
  view: ResultView | null;
  names: (i: number) => string[];
  onImage: () => void;
  onSave: () => void;
  onCodes: () => void;
  onBack: () => void;
}) {
  const results = response?.results ?? [];
  const m = results[selIdx]?.metrics;

  if (cartEmpty) {
    return (
      <div className="pl-empty">
        담은 과목이 없어요.<br />
        <button className="pl-btn" style={{ marginTop: 12 }} onClick={onBack}>과목 담으러 가기</button>
      </div>
    );
  }
  if (response?.emptyMust.length) {
    return <div className="pl-empty">조건에 맞는 분반이 없는 필수 과목이 있어요.<br /><b>{response.emptyMust.join(", ")}</b><br />공강·시간·교수 조건이나 분반 제외를 확인해 주세요.</div>;
  }
  if (response && !running && results.length === 0) {
    return <div className="pl-empty">조건을 모두 만족하는 시간표가 없어요.<br />필수 과목끼리 시간이 겹치거나, 학점·공강 조건이 너무 좁을 수 있어요.</div>;
  }
  if (!view || !m) return <div className="pl-empty">시간표를 만드는 중이에요…</div>;

  const offDays = DAY_NAMES.slice(0, 5).filter((_, d) => !view.items.some((it) => it.slots.some(([dd]) => dd === d)));

  return (
    <>
      <div className="pl-result-head">
        <div className="pl-result-bar">
          <div className="pl-nav">
            <button className="pl-btn sm" aria-label="이전 시간표" onClick={() => onSelect((selIdx - 1 + results.length) % results.length)}>‹</button>
            <span>{selIdx + 1} / {results.length}</span>
            <button className="pl-btn sm" aria-label="다음 시간표" onClick={() => onSelect((selIdx + 1) % results.length)}>›</button>
          </div>
          <div className="pl-stats">
            <span><b>{m.credit}</b>학점</span>
            <span>공강 <b>{offDays.length ? offDays.join("·") : "없음"}</b></span>
            <span><b>{fmtMin(m.avgStart)}~{fmtMin(m.avgEnd)}</b> (평균)</span>
            {m.competition > 0 && <span>경쟁률 <b>{m.competition.toFixed(2)}</b></span>}
          </div>
        </div>
        <div className="pl-actions">
          <button className="pl-btn primary" onClick={onImage}>이미지 저장</button>
          <button className="pl-btn" onClick={onSave}>보관함에 저장</button>
          <button className="pl-btn" onClick={onCodes}>수강신청 코드</button>
        </div>
        {response?.truncated && (
          <div className="pl-hint">조합이 너무 많아 일부만 살펴봤어요. 학점 범위를 좁히면 더 정확해져요.</div>
        )}
      </div>
      <div className="pl-scroll">
        <div className="pl-tt-wrap"><Timetable items={view.items} /></div>
        <div className="pl-list">
          <div className="pl-list-title">
            다른 시간표 <span className="pl-muted" style={{ fontWeight: 500 }}>
              {response ? `${response.total.toLocaleString()}${response.truncated ? "+" : ""}개 중 상위 ${results.length}개` : ""}
            </span>
          </div>
          {results.map((r, i) => (
            <button key={i} className="pl-list-row" aria-current={i === selIdx} onClick={() => onSelect(i)}>
              <span className="pl-muted">{i + 1}</span>
              <span className="pl-list-names">{names(i).join(" · ")}</span>
              <span className="pl-muted">{r.metrics.credit}학점 · 공강 {r.metrics.freeDays}일</span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
