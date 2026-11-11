"use client";

import type { ResultView } from "./ResultPanel";

/** Planner.tsx에서 떼어 낸 창 내용: 분반 고르기(저장·공유 전) / 수강신청 코드 */
type Items = ResultView["items"];

export function PickBody({ items, pickFor, onClose, onPick, onDone }: {
  items: Items;
  pickFor: "image" | "kakao";
  onClose: () => void;
  onPick: (code: string, sectionId: string) => void;
  onDone: () => void;
}) {
  const verb = pickFor === "kakao" ? "공유" : "저장";
  return (
    <>
      <div className="pl-modal-head"><h3>분반 고르고 {verb}</h3><button className="pl-x" aria-label="닫기" onClick={onClose}>×</button></div>
      <div className="pl-modal-body">
        <div className="pl-hint">같은 시간에 교수님이 다른 분반이 있어요. 고르면 이미지에 교수님·강의실이 들어가요.</div>
        {items.filter((i) => i.options.length > 1).map((it) => (
          <div key={it.code} className="pl-pick-group">
            <div style={{ fontWeight: 700 }}>{it.name}</div>
            <div className="pl-chips">
              {it.options.map((o) => (
                <button key={o.id} className="pl-chip" aria-pressed={it.decided && it.chosen === o.id} onClick={() => onPick(it.code, o.id)}>
                  {o.id.split("-").pop()}분반 {o.prof}
                </button>
              ))}
            </div>
          </div>
        ))}
        <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
          <button className="pl-btn" style={{ flex: 1 }} onClick={onDone}>고르지 않고 {verb}</button>
          <button className="pl-btn primary" style={{ flex: 1 }} onClick={onDone}>{pickFor === "kakao" ? "카톡 공유" : "이미지 저장"}</button>
        </div>
      </div>
    </>
  );
}

export function CodesBody({ items, onClose, onCopy, onPick }: {
  items: Items;
  onClose: () => void;
  onCopy: (text: string) => void;
  onPick: (code: string, sectionId: string) => void;
}) {
  return (
    <>
      <div className="pl-modal-head"><h3>수강신청 코드</h3><button className="pl-x" aria-label="닫기" onClick={onClose}>×</button></div>
      <div className="pl-modal-body">
        {items.map((it) => (
          <div key={it.code} className="pl-code-row">
            <div>
              <div style={{ fontWeight: 600 }}>{it.name} <span className="pl-muted pl-small">{it.credit}학점</span></div>
              {it.options.length > 1 ? (
                <select className="pl-select" style={{ marginTop: 6, height: 28 }} value={it.chosen}
                  onChange={(e) => onPick(it.code, e.target.value)} aria-label={`${it.name} 분반 선택`}>
                  {it.options.map((o) => <option key={o.id} value={o.id}>{o.id.split("-")[1]}분반 {o.prof}</option>)}
                </select>
              ) : <div className="pl-muted pl-small">{it.prof}</div>}
              <code>{it.chosen}</code>
            </div>
            <button className="pl-btn sm" onClick={() => onCopy(it.chosen)}>복사</button>
          </div>
        ))}
        <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
          <button className="pl-btn" style={{ flex: 1 }} onClick={() => onCopy(items.map((i) => i.chosen).join("\n"))}>전체 복사</button>
          <a className="pl-btn primary" style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }} href="https://sugang.knu.ac.kr" target="_blank" rel="noopener noreferrer">수강신청 사이트</a>
        </div>
      </div>
    </>
  );
}
