"use client";

import { useMemo, useState } from "react";
import { track } from "@/lib/analytics";
import { DAY_NAMES, formatSlots } from "@/lib/planner/data";
import type { Recommendation } from "@/lib/planner/recommend";
import type { Relaxation } from "@/lib/planner/relax";
import type { TimetableItem } from "@/lib/planner/exportImage";
import type { Course, EngineResponse } from "@/lib/planner/types";
import Timetable from "./Timetable";

export type ResultView = {
  items: (TimetableItem & { sectionIds: string[]; options: { id: string; prof: string; room: string }[]; chosen: string; decided: boolean })[];
};

type RecTab = "gyoyang" | "major";

/** 추천 이유 칩 색 구분 (recommend.ts의 reasons 문구 기준) */
const reasonKind = (x: string) =>
  x.startsWith("공강") ? "free" : x.startsWith("앞뒤") ? "near" : x.startsWith("정원") ? "seat" : x === "SDG" ? "sdg" : x === "인문교양" ? "hum" : x.startsWith("원격") ? "remote" : "etc";
const REC_TABS: { key: RecTab; label: string; hint: string }[] = [
  { key: "major", label: "전공 추천", hint: "내 전공·복수전공" },
  { key: "gyoyang", label: "교양 추천", hint: "교양·일반선택" },
];

function RecRow({ r, onAdd, showSection, cont }: { r: Recommendation; onAdd: (r: Recommendation) => void; showSection?: boolean; cont?: boolean }) {
  return (
    <div className={`pl-rec${cont ? " cont" : ""}`}>
      <div className="pl-rec-main">
        {cont ? (
          <div className="pl-rec-name"><span className="pl-rec-sec">{r.section.id.split("-").pop()}분반</span></div>
        ) : (
          <div className="pl-rec-name">{r.course.name} <span className="pl-muted">{r.course.credit}학점</span>{showSection && <span className="pl-rec-sec">{r.section.id.split("-").pop()}분반</span>}</div>
        )}
        <div className="pl-rec-meta">{r.section.type && <span className="pl-rec-type">{r.section.type}</span>}{formatSlots(r.section.slots)} | {r.section.profs.join(", ") || "교수 미정"}{r.section.room ? ` | ${r.section.room}` : ""}</div>
        {r.reasons.length > 0 && <div className="pl-rec-reasons">{r.reasons.map((x) => <span key={x} className="pl-rec-reason" data-kind={reasonKind(x)}>{x}</span>)}</div>}
      </div>
      <button className="pl-btn sm primary" onClick={() => onAdd(r)}>담기</button>
    </div>
  );
}

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
  canShuffle,
  onShuffleRecs,
  hasMajor,
  recommendSearch,
  relaxations,
  onRelax,
  majorMore,
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
  recs: Record<RecTab, Recommendation[]>;
  onAddRec: (r: Recommendation) => void;
  addedRecs: Recommendation[];
  onRemoveRec: (code: string) => void;
  canShuffle: Record<RecTab, boolean>;
  onShuffleRecs: () => void;
  hasMajor: boolean;
  recommendSearch: (q: string) => Recommendation[];
  /** 결과 0개일 때 하나만 풀면 시간표가 생기는 조건 (null = 계산 중) */
  relaxations: Relaxation[] | null;
  onRelax: (r: Relaxation) => void;
  majorMore: Course[];
  quickAdd: (q: string, list?: Course[]) => React.ReactNode;
  onChoose: (code: string, sectionId: string) => void;
}) {
  const results = response?.results ?? [];
  const m = results[selIdx]?.metrics;
  // 빈 시간 채우기: 검색어가 있으면 검색 결과, 없으면 고른 추천 탭
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<RecTab>(hasMajor ? "major" : "gyoyang");
  const curTab: RecTab = hasMajor ? tab : "gyoyang";
  const searchRecs = useMemo(() => recommendSearch(q), [q, recommendSearch]);
  // 3단계 정리: 맞춤 추천 칸은 접을 수 있게(넓은 화면은 펼친 채 시작, 고른 상태는 기억), 전체 시간표 목록은 접어 둠
  const [fillOpen, setFillOpen] = useState(() => {
    try { const v = localStorage.getItem("knu_fill_open"); if (v) return v === "1"; } catch { /* 저장소 막힘 */ }
    return typeof window !== "undefined" && window.innerWidth >= 1100;
  });
  const toggleFill = (open: boolean) => {
    setFillOpen(open);
    try { localStorage.setItem("knu_fill_open", open ? "1" : "0"); } catch { /* 무시 */ }
  };
  const [listOpen, setListOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  if (cartEmpty) {
    return (
      <div className="pl-empty">
        담은 과목이 없어요.<br />
        <button className="pl-btn" style={{ marginTop: 12 }} onClick={onBack}>과목 담으러 가기</button>
      </div>
    );
  }
  // 추천·검색에서 담은 과목 (담음 ✓ 빼기). 결과가 0개가 돼도 여기서 다시 뺄 수 있게 빈 화면에도 보여 준다
  const addedList = addedRecs.map((r) => (
    <div key={`added-${r.section.id}`} className="pl-rec added">
      <div className="pl-rec-main">
        <div className="pl-rec-name">{r.course.name} <span className="pl-muted">{r.course.credit}학점</span></div>
        <div className="pl-rec-meta">{formatSlots(r.section.slots)} | {r.section.profs.join(", ") || "교수 미정"}{r.section.room ? ` | ${r.section.room}` : ""}</div>
      </div>
      <button className="pl-btn sm" aria-pressed="true" onClick={() => onRemoveRec(r.course.code)} title="누르면 담은 과목에서 빼요">담음 ✓ 빼기</button>
    </div>
  ));
  const emptyWithAdded = (msg: React.ReactNode) => (
    <>
      <div className="pl-empty">{msg}</div>
      <div className="pl-relax">
        {relaxations === null ? (
          <div className="pl-hint">어떤 조건을 풀면 되는지 찾는 중…</div>
        ) : relaxations.length > 0 ? (
          <>
            <div className="pl-label">이 조건 하나만 풀면 시간표가 생겨요</div>
            <div className="pl-chips">
              {relaxations.map((r) => (
                <button key={r.key} className="pl-chip pl-relax-btn" onClick={() => onRelax(r)}>
                  {r.label} <b>→ {r.total.toLocaleString()}개</b>
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="pl-hint">조건 하나만 풀어서는 안 돼요. 담은 과목끼리 시간이 겹치는지 확인하거나 조건을 여러 개 풀어 보세요.</div>
        )}
      </div>
      {addedRecs.length > 0 && (
        <div className="pl-recs pl-empty-added">
          <div className="pl-list-title">방금 담은 과목 <span className="pl-muted" style={{ fontWeight: 500 }}>| 빼면 이 과목 없이 다시 짜 드려요</span></div>
          {addedList}
        </div>
      )}
    </>
  );
  if (response?.emptyMust.length) {
    return emptyWithAdded(<>조건에 맞는 분반이 없는 필수 과목이 있어요.<br /><b>{response.emptyMust.join(", ")}</b><br />공강·시간·교수 조건이나 분반 제외를 확인해 주세요.</>);
  }
  if (response && !running && results.length === 0) {
    return emptyWithAdded(<>조건을 모두 만족하는 시간표가 없어요.<br />{addedRecs.length > 0 ? "방금 담은 과목 때문일 수 있어요. 아래에서 빼 보세요." : "필수 과목끼리 시간이 겹치거나, 학점·공강·시간대 조건이 너무 좁을 수 있어요."}</>);
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
            <span>공강 <b>{offDays.length ? offDays.join(", ") : "없음"}</b></span>
          </div>
        </div>
        <div className="pl-actions" data-tour="actions">
          <button className="pl-btn primary" onClick={onImage}>이미지 저장</button>
          <button className="pl-btn pl-kakao" onClick={onKakao}>카톡 공유</button>
          {/* 나머지(보관함·수강신청 코드·전체 이미지)는 더보기 안에 (2026-11-11 단순화) */}
          <div className="pl-pop pl-more">
            <button className="pl-btn" aria-expanded={moreOpen} aria-haspopup="menu" onClick={() => setMoreOpen((v) => !v)}>더보기 ▾</button>
            {moreOpen && (
              <>
                <div style={{ position: "fixed", inset: 0, zIndex: 29 }} onClick={() => setMoreOpen(false)} />
                <div className="pl-pop-panel pl-menu pl-more-panel" role="menu">
                  <div className="pl-pop-list">
                    <button role="menuitem" onClick={() => { setMoreOpen(false); onSave(); }}>보관함에 저장</button>
                    <button role="menuitem" onClick={() => { setMoreOpen(false); onCodes(); }}>수강신청 코드 보기</button>
                    {onBulk && (
                      <button role="menuitem" disabled={bulkProgress !== null} onClick={() => { setMoreOpen(false); onBulk(); }}>
                        {bulkProgress !== null ? `이미지 저장 중 ${bulkProgress}/${results.length}` : `전체 ${results.length}개 이미지 저장`}
                      </button>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
        {results.length > 1 && (
          <div className="pl-strip" role="list" aria-label="다른 시간표">
            {results.slice(0, 30).map((r, i) => (
              <button key={i} role="listitem" className="pl-strip-item" aria-current={i === selIdx} onClick={() => onSelect(i)} title={names(i).join(" | ")}>
                <b>{i + 1}</b> {r.metrics.credit}학점{r.metrics.freeDays ? ` | 공강 ${r.metrics.freeDays}일` : ""}
              </button>
            ))}
            {results.length > 30 && <button className="pl-strip-item more" onClick={() => { setListOpen(true); setTimeout(() => document.querySelector(".pl-list")?.scrollIntoView({ behavior: "smooth", block: "start" }), 30); }}>+{results.length - 30}개</button>}
          </div>
        )}
        <div className="pl-jumps">
          <button className="pl-rec-jump" onClick={() => { toggleFill(true); setTimeout(() => document.getElementById("pl-fill")?.scrollIntoView({ behavior: "smooth", block: "start" }), 30); }}>
            <span aria-hidden>✦</span> 내 시간표 맞춤 추천 받기
            <em>{hasMajor ? <>전공 <b>{recs.major.length}</b> | </> : null}교양 <b>{recs.gyoyang.length}</b>개 | 과목 검색</em>
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
        <div className="pl-recs pl-fill" id="pl-fill" data-tour="recs">
          <button className="pl-list-title pl-recs-title pl-fill-toggle" aria-expanded={fillOpen} onClick={() => toggleFill(!fillOpen)}>
            <span>내 시간표 맞춤 추천 <span className="pl-muted" style={{ fontWeight: 500 }}>| {hasMajor ? `전공 ${recs.major.length} | ` : ""}교양 {recs.gyoyang.length} | 과목 검색</span></span>
            <span className="pl-muted">{fillOpen ? "접기 ▴" : "펼치기 ▾"}</span>
          </button>
          {fillOpen && <>
          <div className="pl-fill-search">
            <input
              className="pl-field"
              type="search"
              placeholder="다른 과목 검색해서 담기 (과목명, 코드, 교수, 학과)"
              aria-label="과목 검색해서 담기"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          {addedList}
          {q.trim() ? (
            <div className="pl-fill-body">
              <div className="pl-fill-sub">빈 시간에 들어가는 분반 <span className="pl-muted">{new Set(searchRecs.map((r) => r.course.code)).size}과목 | {searchRecs.length}개 분반</span></div>
              {searchRecs.length > 0
                ? searchRecs.map((r, i) => <RecRow key={r.section.id} r={r} onAdd={onAddRec} showSection cont={i > 0 && searchRecs[i - 1].course.code === r.course.code} />)
                : <div className="pl-hint pl-fill-none">검색한 과목 중 지금 시간표 빈 시간(공강·시간대·학점 조건 포함)에 들어가는 분반이 없어요. 아래 목록에서 직접 담으면 시간표를 다시 짜 드려요.</div>}
              <div className="pl-fill-sub">전체 검색 결과</div>
              {quickAdd(q)}
            </div>
          ) : (
            <>
              <div className="pl-tabs pl-fill-tabs" role="tablist" aria-label="추천 종류">
                {REC_TABS.filter((t) => t.key === "gyoyang" || hasMajor).map((t) => (
                  <button key={t.key} role="tab" type="button" className="pl-tab" aria-selected={curTab === t.key} title={t.hint}
                    style={{ "--c": "var(--accent)" } as React.CSSProperties}
                    onClick={() => { setTab(t.key); track("rec_tab", { tab: t.key }); }}>
                    {t.label}<span className="pl-tab-count">{recs[t.key].length}</span>
                  </button>
                ))}
                {canShuffle[curTab] && <button className="pl-btn sm pl-fill-shuffle" onClick={onShuffleRecs}>↻ 다른 추천 보기</button>}
              </div>
              <div className="pl-fill-body">
                {curTab === "major" && <div className="pl-fill-sub">지금 시간표 빈 시간에 들어가는 분반</div>}
                {recs[curTab].length === 0 && (
                  <div className="pl-hint pl-fill-none">
                    {curTab === "major" ? "빈 시간에 그대로 들어가는 전공 과목은 없어요. 아래에서 담아 보면 다른 과목 분반을 바꿔 가며 다시 짜 드려요." : "지금 조건으로 빈 시간에 들어가는 교양이 없어요. 학점 상한이나 공강 조건을 바꿔 보세요."}
                  </div>
                )}
                {recs[curTab].map((r) => <RecRow key={r.section.id} r={r} onAdd={onAddRec} />)}
                {curTab === "major" && (
                  <>
                    <div className="pl-fill-sub">다른 전공 과목 <span className="pl-muted">| 시간이 겹쳐도 담으면 시간표를 다시 짜 드려요</span></div>
                    {quickAdd("", majorMore.filter((c) => !recs.major.some((r) => r.course.code === c.code)))}
                  </>
                )}
              </div>
            </>
          )}
          </>}
        </div>
        <div className="pl-list">
          <button className="pl-list-title pl-fill-toggle" aria-expanded={listOpen} onClick={() => setListOpen(!listOpen)}>
            <span>다른 시간표 전체 목록 <span className="pl-muted" style={{ fontWeight: 500 }}>
              {response ? `${response.total.toLocaleString()}${response.truncated ? "+" : ""}개 중 상위 ${results.length}개` : ""}
            </span></span>
            <span className="pl-muted">{listOpen ? "접기 ▴" : "펼치기 ▾"}</span>
          </button>
          {listOpen && results.map((r, i) => (
            <button key={i} className="pl-list-row" aria-current={i === selIdx} onClick={() => onSelect(i)}>
              <span className="pl-muted">{i + 1}</span>
              <span className="pl-list-names">{names(i).join(" | ")}</span>
              <span className="pl-muted">{r.metrics.credit}학점 | 공강 {r.metrics.freeDays}일</span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
