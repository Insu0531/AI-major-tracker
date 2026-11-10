"use client";

import { DAY_NAMES, formatSlots } from "@/lib/planner/data";
import type { Recommendation } from "@/lib/planner/recommend";
import type { TimetableItem } from "@/lib/planner/exportImage";
import type { EngineResponse } from "@/lib/planner/types";
import Timetable from "./Timetable";

export type ResultView = {
  items: (TimetableItem & { sectionIds: string[]; options: { id: string; prof: string; room: string }[]; chosen: string; decided: boolean })[];
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
  onKakao,
  onSave,
  onCodes,
  onBulk,
  bulkProgress,
  onBack,
  recs,
  addedRecs,
  onAddRec,
  onRemoveRec,
  onShuffleRecs,
  quickAdd,
  onChoose,
}: {
  response: EngineResponse | null;
  running: boolean;
  cartEmpty: boolean;
  selIdx: number;
  onSelect: (i: number) => void;
  view: ResultView | null;
  names: (i: number) => string[];
  onImage: () => void;
  onKakao: () => void;
  onSave: () => void;
  onCodes: () => void;
  onBulk?: () => void;
  bulkProgress: number | null;
  onBack: () => void;
  recs: Recommendation[];
  onAddRec: (r: Recommendation) => void;
  addedRecs: Recommendation[];
  onRemoveRec: (code: string) => void;
  onShuffleRecs?: () => void;
  quickAdd: React.ReactNode;
  onChoose: (code: string, sectionId: string) => void;
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
          </div>
        </div>
        <div className="pl-actions" data-tour="actions">
          <button className="pl-btn primary" onClick={onImage}>이미지 저장</button>
          <button className="pl-btn pl-kakao" onClick={onKakao}>카톡 공유</button>
          <button className="pl-btn" onClick={onSave}>보관함에 저장</button>
          <button className="pl-btn" onClick={onCodes}>수강신청 코드</button>
          {onBulk && (
            <button className="pl-btn ghost pl-hide-mobile" onClick={onBulk} disabled={bulkProgress !== null}>
              {bulkProgress !== null ? `저장 중 ${bulkProgress}/${results.length}` : `전체 이미지 저장 (${results.length})`}
            </button>
          )}
        </div>
        <div className="pl-jumps">
          {recs.length > 0 && (
            <button className="pl-rec-jump" onClick={() => document.getElementById("pl-recs")?.scrollIntoView({ behavior: "smooth", block: "start" })}>
              <span aria-hidden>↓</span> 빈 시간에 넣기 좋은 교양 <b>{recs.length}개</b> 추천이 아래에 있어요
            </button>
          )}
          <button
            className="pl-rec-jump"
            onClick={() => {
              document.getElementById("pl-quick")?.scrollIntoView({ behavior: "smooth", block: "center" });
              // 스크롤이 끝날 즈음 검색창에 커서 (휴대폰은 키보드가 바로 올라옴)
              setTimeout(() => (document.querySelector("#pl-quick input") as HTMLInputElement | null)?.focus({ preventScroll: true }), 450);
            }}
          >
            <span aria-hidden>🔍</span> 다른 과목 검색해서 넣기
          </button>
        </div>
        {response?.truncated && (
          <div className="pl-hint">조합이 너무 많아 일부만 살펴봤어요. 학점 범위를 좁히면 더 정확해져요.</div>
        )}
      </div>
      <div className="pl-scroll">
        <div className="pl-tt-wrap" key={selIdx}>
          <Timetable
            items={view.items}
            choices={Object.fromEntries(view.items.map((i) => [i.code, { options: i.options, chosen: i.chosen, decided: i.decided }]))}
            onChoose={onChoose}
          />
          {view.items.some((i) => i.options.length > 1 && !i.decided) && (
            <div className="pl-hint" style={{ marginTop: 8 }}>‘교수님 선택 ▾’이 붙은 과목은 블록에 마우스를 올리거나 눌러 분반을 고를 수 있어요.</div>
          )}
        </div>
        <div className="pl-recs" id="pl-recs" data-tour="recs">
            <div className="pl-list-title pl-recs-title">
              <span>
                이 시간표 빈 시간에 넣기 좋은 교양
                <span className="pl-muted" style={{ fontWeight: 500 }}> · 공강 유지·빈 시간 채움·정원 여유를 따져 골랐어요</span>
              </span>
              {onShuffleRecs && <button className="pl-btn sm" onClick={onShuffleRecs}>↻ 다른 추천 보기</button>}
            </div>
            {addedRecs.map((r) => (
              <div key={`added-${r.section.id}`} className="pl-rec added">
                <div className="pl-rec-main">
                  <div className="pl-rec-name">{r.course.name} <span className="pl-muted">{r.course.credit}학점</span></div>
                  <div className="pl-rec-meta">{formatSlots(r.section.slots)} · {r.section.profs.join(", ") || "교수 미정"}{r.section.room ? ` · ${r.section.room}` : ""}</div>
                </div>
                <button className="pl-btn sm" aria-pressed="true" onClick={() => onRemoveRec(r.course.code)} title="누르면 시간표에서 빼요">넣음 ✓ · 빼기</button>
              </div>
            ))}
            {recs.length === 0 && addedRecs.length === 0 && <div className="pl-hint" style={{ padding: "0 24px 8px" }}>지금 조건으로 빈 시간에 들어가는 교양이 없어요. 학점 상한이나 공강 조건을 바꿔 보세요.</div>}
            {recs.map((r) => (
              <div key={r.section.id} className="pl-rec">
                <div className="pl-rec-main">
                  <div className="pl-rec-name">{r.course.name} <span className="pl-muted">{r.course.credit}학점</span></div>
                  <div className="pl-rec-meta">{formatSlots(r.section.slots)} · {r.section.profs.join(", ") || "교수 미정"}{r.section.room ? ` · ${r.section.room}` : ""}</div>
                  <div className="pl-rec-reasons">{r.reasons.map((x) => <span key={x} className="pl-rec-reason">{x}</span>)}</div>
                </div>
                <button className="pl-btn sm primary" onClick={() => onAddRec(r)}>이 분반 넣기</button>
              </div>
            ))}
            {quickAdd}
          </div>
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
