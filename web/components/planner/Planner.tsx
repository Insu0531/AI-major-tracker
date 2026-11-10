"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { MAJOR_LABELS, ENTRY_YEAR_MIN, type Major } from "@/lib/courses";
import { buildCourses, buildEngineGroups, colorFor, loadCurriculum, loadIndex, loadSnapshot, type SectionFilter } from "@/lib/planner/data";
import { exportTimetable, type TimetableItem } from "@/lib/planner/exportImage";
import { deletePlan, loadPlans, readLocal, savePlan, writeLocal, type SavedPlan } from "@/lib/planner/storage";
import { DEFAULT_CONDITIONS, type CartItem, type CartMode, type Conditions, type EngineGroup, type EngineResponse, type Slot, type Snapshot, type SnapshotIndex } from "@/lib/planner/types";
import MajorPicker from "@/components/planner/MajorPicker";
import CourseBrowser from "@/components/planner/CourseBrowser";
import CartPanel from "@/components/planner/CartPanel";
import ResultPanel, { type ResultView } from "@/components/planner/ResultPanel";
import Timetable from "@/components/planner/Timetable";

const STATE_KEY = "knu_planner_state_v1";
const ENTRY_YEAR_LAST = 2026; // 이수체계 데이터가 있는 마지막 학번
const TERM_LABEL: Record<string, string> = { "1": "1학기", "2": "2학기", s: "여름학기", w: "겨울학기" };
const semLabel = (sem: string) => { const [y, t] = sem.split("-"); return `${y}년 ${TERM_LABEL[t] ?? t}`; };
const defaultCampuses = (m: Major | null) => (m && MAJOR_LABELS[m].startsWith("[상주]") ? ["상주"] : ["산격동", "동인동"]);

type Persisted = {
  sem: string | null;
  major: Major | null;
  extras: Major[];
  entryYear: number;
  cart: CartItem[];
  conditions: Conditions;
  campuses: string[];
  includeGrad: boolean;
};

const INITIAL: Persisted = {
  sem: null,
  major: null,
  extras: [],
  entryYear: ENTRY_YEAR_LAST,
  cart: [],
  conditions: DEFAULT_CONDITIONS,
  campuses: ["산격동", "동인동"],
  includeGrad: false,
};

type Pane = "courses" | "cart" | "result";

function loadPersisted(): Persisted {
  const saved = readLocal<Partial<Persisted>>(STATE_KEY, {});
  return { ...INITIAL, ...saved, conditions: { ...DEFAULT_CONDITIONS, ...saved.conditions } };
}

const EMPTY_MAP = new Map<string, string>();

/** 브라우저 전용 (localStorage 초기값을 쓰므로 page.tsx에서 ssr:false로 불러온다) */
export default function Planner() {
  const [st, setSt] = useState<Persisted>(loadPersisted);
  const [index, setIndex] = useState<SnapshotIndex | null>(null);
  const [loaded, setLoaded] = useState<Snapshot | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [mineCur, setMineCur] = useState<{ key: string; map: Map<string, string> } | null>(null);
  const [extra, setExtra] = useState<Map<string, string>>(new Map());
  const [pane, setPane] = useState<Pane>("courses");
  // 결과는 계산에 쓴 groups와 함께 보관 (담은 과목이 바뀌는 사이 이전 결과와 섞이지 않도록)
  const [resp, setResp] = useState<{ data: EngineResponse; groups: EngineGroup[] } | null>(null);
  const [running, setRunning] = useState(false);
  const [selIdx, setSelIdx] = useState(0);
  const [profPick, setProfPick] = useState<Record<string, string>>({});
  const [modal, setModal] = useState<null | "codes" | "save" | "saved">(null);
  const [saveName, setSaveName] = useState("");
  const [plans, setPlans] = useState<SavedPlan[]>(loadPlans);
  const [preview, setPreview] = useState<SavedPlan | null>(null);
  const [toast, setToast] = useState("");

  const update = useCallback((patch: Partial<Persisted>) => setSt((s) => ({ ...s, ...patch })), []);
  const flash = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 1800); };

  /* ── 초기화: 저장된 상태 + 학기 목록 ── */
  useEffect(() => {
    loadIndex().then((idx) => {
      if (!idx) { setLoadError(true); return; }
      setIndex(idx);
      const sems = Object.keys(idx.semesters).sort();
      setSt((s) => (s.sem && idx.semesters[s.sem] ? s : { ...s, sem: sems[sems.length - 1] ?? null }));
    });
  }, []);

  useEffect(() => { writeLocal(STATE_KEY, st); }, [st]);

  useEffect(() => {
    if (!st.sem) return;
    loadSnapshot(st.sem).then((s) => (s ? setLoaded(s) : setLoadError(true)));
  }, [st.sem]);
  const snapshot = loaded && loaded.sem === st.sem ? loaded : null;

  useEffect(() => {
    if (!st.major) return;
    const key = `${st.major}-${st.entryYear}`;
    loadCurriculum(st.major, st.entryYear).then((map) => setMineCur({ key, map }));
  }, [st.major, st.entryYear]);
  const mine = st.major && mineCur?.key === `${st.major}-${st.entryYear}` ? mineCur.map : EMPTY_MAP;

  useEffect(() => {
    Promise.all(st.extras.map((m) => loadCurriculum(m, st.entryYear))).then((maps) => {
      const merged = new Map<string, string>();
      for (const m of maps) for (const [k, v] of m) if (!merged.has(k)) merged.set(k, v);
      setExtra(merged);
    });
  }, [st.extras, st.entryYear]);

  const courses = useMemo(() => (snapshot ? buildCourses(snapshot.sections, mine, extra) : []), [snapshot, mine, extra]);
  const courseByCode = useMemo(() => new Map(courses.map((c) => [c.code, c])), [courses]);
  const sectionFilter: SectionFilter = useMemo(() => ({ campuses: st.campuses }), [st.campuses]);
  const cart = useMemo(() => st.cart.filter((i) => courseByCode.has(i.code)), [st.cart, courseByCode]);
  const groups = useMemo(() => buildEngineGroups(cart, courseByCode, sectionFilter), [cart, courseByCode, sectionFilter]);

  /* ── 조합 계산 (Web Worker) ── */
  const workerRef = useRef<Worker | null>(null);
  const reqId = useRef(0);
  const pending = useRef<EngineGroup[]>([]);
  useEffect(() => {
    const w = new Worker(new URL("../../lib/planner/engine.worker.ts", import.meta.url));
    w.onmessage = (e: MessageEvent<EngineResponse>) => {
      if (e.data.id !== reqId.current) return;
      setResp({ data: e.data, groups: pending.current });
      setSelIdx(0);
      setRunning(false);
    };
    workerRef.current = w;
    return () => w.terminate();
  }, []);

  useEffect(() => {
    if (!groups.length) return;
    const t = setTimeout(() => {
      setRunning(true);
      reqId.current += 1;
      pending.current = groups;
      workerRef.current?.postMessage({ id: reqId.current, groups, cond: st.conditions });
    }, 150);
    return () => clearTimeout(t);
  }, [groups, st.conditions]);

  const shown = groups.length ? resp?.data ?? null : null;
  const resGroups = useMemo(() => resp?.groups ?? [], [resp]);
  const busy = groups.length > 0 && running;

  /* ── 장바구니 조작 ── */
  const setMode = useCallback((code: string, mode: CartMode | null) => {
    setSt((s) => {
      const exists = s.cart.find((i) => i.code === code);
      if (!mode) return { ...s, cart: s.cart.filter((i) => i.code !== code) };
      if (exists) return { ...s, cart: s.cart.map((i) => (i.code === code ? { ...i, mode } : i)) };
      return { ...s, cart: [...s.cart, { code, mode, pinned: null, excluded: [] }] };
    });
  }, []);

  const onSection = useCallback((code: string, id: string, action: "pin" | "exclude") => {
    setSt((s) => ({
      ...s,
      cart: s.cart.map((i) => {
        if (i.code !== code) return i;
        if (action === "pin") return { ...i, pinned: i.pinned === id ? null : id, excluded: i.excluded.filter((x) => x !== id) };
        const excluded = i.excluded.includes(id) ? i.excluded.filter((x) => x !== id) : [...i.excluded, id];
        return { ...i, excluded, pinned: i.pinned === id ? null : i.pinned };
      }),
    }));
  }, []);

  /* ── 선택된 결과 → 화면/이미지용 데이터 ── */
  const results = useMemo(() => shown?.results ?? [], [shown]);
  const view: ResultView | null = useMemo(() => {
    const r = results[selIdx];
    if (!r) return null;
    const items: ResultView["items"] = [];
    resGroups.forEach((g, gi) => {
      const pi = r.picks[gi] ?? -1;
      if (pi < 0 || !g.options[pi]) return;
      const opt = g.options[pi];
      const secs = opt.sections.filter((s) => !s.profs.some((p) => st.conditions.excludeProfs.includes(p)));
      const list = secs.length ? secs : opt.sections;
      const chosen = list.find((s) => s.id === profPick[g.code]) ?? list[0];
      const decided = list.length === 1 || !!profPick[g.code];
      items.push({
        code: g.code,
        name: g.name,
        credit: g.credit,
        slots: opt.slots,
        color: colorFor(g.code),
        prof: decided ? chosen.profs.join(", ") : `${chosen.profs[0] ?? ""} 외 ${list.length - 1}분반`,
        room: decided ? chosen.room : "",
        sectionIds: decided ? [chosen.id] : list.map((s) => s.id),
        options: list.map((s) => ({ id: s.id, prof: s.profs.join(", ") || "교수 미정" })),
        chosen: chosen.id,
      });
    });
    return { items };
  }, [results, selIdx, resGroups, profPick, st.conditions.excludeProfs]);

  const names = useCallback((i: number) => resGroups.filter((_, gi) => (results[i]?.picks[gi] ?? -1) >= 0).map((g) => g.name), [resGroups, results]);
  const busySlots: Slot[] = useMemo(() => view?.items.flatMap((i) => i.slots) ?? [], [view]);

  const majorLabel = st.major ? MAJOR_LABELS[st.major] : "";
  const title = st.sem ? `${semLabel(st.sem)} 시간표` : "시간표";
  const doImage = async (items: TimetableItem[] = view?.items ?? [], t = title) => {
    if (!items.length) return;
    const credit = items.reduce((s, i) => s + i.credit, 0);
    await exportTimetable({
      title: t,
      subtitle: [majorLabel, `${credit}학점`].filter(Boolean).join(" · "),
      items,
      dark: document.documentElement.classList.contains("dark"),
    });
  };

  const doSave = () => {
    if (!view || !st.sem) return;
    const name = saveName.trim() || `${title} ${plans.length + 1}`;
    const saved = savePlan({ name, sem: st.sem, items: view.items.map((i) => ({ code: i.code, name: i.name, prof: i.prof, room: i.room, credit: i.credit, slots: i.slots, color: i.color, sectionIds: i.sectionIds })) });
    if (!saved) { flash("저장 공간이 부족해요"); return; }
    setPlans(loadPlans());
    setModal(null);
    setSaveName("");
    flash("보관함에 저장했어요");
  };

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); flash("복사했어요"); } catch { flash("복사에 실패했어요"); }
  };

  const sems = index ? Object.keys(index.semesters).sort() : [];
  const collectedAt = st.sem && index?.semesters[st.sem]?.collectedAt;

  return (
    <div className="pl">
      <header className="pl-top">
        <div className="pl-brand">시간표 검색 <small>KNU</small></div>
        <div className="pl-profile">
          <select className="pl-select" value={st.sem ?? ""} onChange={(e) => update({ sem: e.target.value })} aria-label="학기">
            {sems.map((s) => <option key={s} value={s}>{semLabel(s)}</option>)}
          </select>
          <MajorPicker value={st.major} onChange={(m) => update({ major: m, campuses: defaultCampuses(m) })} />
          <select className="pl-select" value={st.entryYear} onChange={(e) => update({ entryYear: +e.target.value })} aria-label="학번">
            {Array.from({ length: ENTRY_YEAR_LAST - ENTRY_YEAR_MIN + 1 }, (_, i) => ENTRY_YEAR_LAST - i).map((y) => <option key={y} value={y}>{y}학번</option>)}
          </select>
          {st.extras.map((m, i) => (
            <MajorPicker key={i} value={m} onChange={(nm) => update({ extras: st.extras.map((x, j) => (j === i ? nm : x)) })} onRemove={() => update({ extras: st.extras.filter((_, j) => j !== i) })} />
          ))}
          {st.major && st.extras.length < 3 && (
            <MajorPicker value={null} placeholder="+ 복수전공" onChange={(m) => update({ extras: [...st.extras, m] })} />
          )}
        </div>
        <div className="pl-top-right">
          <button className="pl-btn ghost" onClick={() => { setPlans(loadPlans()); setModal("saved"); }}>보관함 {plans.length || ""}</button>
          <Link className="pl-btn ghost" href="/" style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }}>기존 화면</Link>
        </div>
      </header>

      {loadError && !snapshot ? (
        <div className="pl-loading">강의 데이터를 불러오지 못했어요. 잠시 후 새로고침해 주세요.</div>
      ) : !snapshot ? (
        <div className="pl-loading">{st.sem ? `${semLabel(st.sem)} 강의 불러오는 중…` : "학기 정보 불러오는 중…"}</div>
      ) : (
        <main className="pl-main">
          <section className="pl-pane" data-active={pane === "courses"}>
            <CourseBrowser
              key={`${st.sem}-${st.major ?? ""}`}
              courses={courses}
              cart={cart}
              hasMajor={!!st.major}
              hasExtra={st.extras.length > 0}
              sectionFilter={sectionFilter}
              onCampusesChange={(c) => update({ campuses: c })}
              includeGrad={st.includeGrad}
              onIncludeGradChange={(v) => update({ includeGrad: v })}
              conditions={st.conditions}
              busySlots={busySlots}
              onSetMode={setMode}
              onSection={onSection}
            />
            {collectedAt && (
              <div className="pl-muted pl-small" style={{ padding: "6px 14px", borderTop: "1px solid var(--line)" }}>
                {new Date(collectedAt).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" })} 기준 개설 정보 · 정원/신청 인원은 그 시점 값이에요
              </div>
            )}
          </section>
          <section className="pl-pane" data-active={pane === "cart"}>
            <CartPanel
              cart={cart}
              courseByCode={courseByCode}
              conditions={st.conditions}
              onConditions={(c) => update({ conditions: c })}
              onSetMode={setMode}
              onClear={() => update({ cart: [] })}
            />
          </section>
          <section className="pl-pane" data-active={pane === "result"}>
            <ResultPanel
              response={shown}
              running={busy}
              cartEmpty={cart.length === 0}
              selIdx={selIdx}
              onSelect={setSelIdx}
              view={view}
              names={names}
              onImage={() => doImage()}
              onSave={() => { setSaveName(""); setModal("save"); }}
              onCodes={() => setModal("codes")}
            />
          </section>
        </main>
      )}

      <nav className="pl-tabs" role="tablist">
        <button role="tab" aria-selected={pane === "courses"} onClick={() => setPane("courses")}>과목 담기</button>
        <button role="tab" aria-selected={pane === "cart"} onClick={() => setPane("cart")}>담은 과목 {cart.length || ""}</button>
        <button role="tab" aria-selected={pane === "result"} onClick={() => setPane("result")}>시간표 {shown ? shown.results.length : ""}</button>
      </nav>

      {modal && (
        <div className="pl-modal-bg" onClick={() => { setModal(null); setPreview(null); }}>
          <div className="pl-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            {modal === "codes" && view && (
              <>
                <div className="pl-modal-head"><h3>수강신청 코드</h3><button className="pl-x" aria-label="닫기" onClick={() => setModal(null)}>×</button></div>
                <div className="pl-modal-body">
                  {view.items.map((it) => (
                    <div key={it.code} className="pl-code-row">
                      <div>
                        <div style={{ fontWeight: 600 }}>{it.name} <span className="pl-muted pl-small">{it.credit}학점</span></div>
                        {it.options.length > 1 ? (
                          <select className="pl-select" style={{ marginTop: 6, height: 28 }} value={it.chosen}
                            onChange={(e) => setProfPick((p) => ({ ...p, [it.code]: e.target.value }))} aria-label={`${it.name} 분반 선택`}>
                            {it.options.map((o) => <option key={o.id} value={o.id}>{o.id.split("-")[1]}분반 · {o.prof}</option>)}
                          </select>
                        ) : <div className="pl-muted pl-small">{it.prof}</div>}
                        <code>{it.chosen}</code>
                      </div>
                      <button className="pl-btn sm" onClick={() => copy(it.chosen)}>복사</button>
                    </div>
                  ))}
                  <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                    <button className="pl-btn" style={{ flex: 1 }} onClick={() => copy(view.items.map((i) => i.chosen).join("\n"))}>전체 복사</button>
                    <a className="pl-btn primary" style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }} href="https://sugang.knu.ac.kr" target="_blank" rel="noopener noreferrer">수강신청 사이트</a>
                  </div>
                </div>
              </>
            )}
            {modal === "save" && (
              <>
                <div className="pl-modal-head"><h3>보관함에 저장</h3><button className="pl-x" aria-label="닫기" onClick={() => setModal(null)}>×</button></div>
                <div className="pl-modal-body">
                  <input autoFocus className="pl-field" placeholder={`${title} ${plans.length + 1}`} value={saveName}
                    onChange={(e) => setSaveName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && doSave()} />
                  <button className="pl-btn primary" onClick={doSave}>저장</button>
                  <div className="pl-muted pl-small">이 브라우저에만 저장돼요.</div>
                </div>
              </>
            )}
            {modal === "saved" && (
              <>
                <div className="pl-modal-head">
                  <h3>{preview ? preview.name : `보관함 ${plans.length}`}</h3>
                  <button className="pl-x" aria-label="닫기" onClick={() => { setModal(null); setPreview(null); }}>×</button>
                </div>
                <div className="pl-modal-body">
                  {preview ? (
                    <>
                      <Timetable items={preview.items} />
                      <div style={{ display: "flex", gap: 6 }}>
                        <button className="pl-btn" onClick={() => setPreview(null)}>목록</button>
                        <button className="pl-btn primary" style={{ flex: 1 }} onClick={() => doImage(preview.items, preview.name)}>이미지 저장</button>
                      </div>
                    </>
                  ) : plans.length === 0 ? (
                    <div className="pl-empty">저장한 시간표가 없어요.</div>
                  ) : (
                    plans.map((p) => (
                      <div key={p.id} className="pl-code-row">
                        <button className="pl-course-main" onClick={() => setPreview(p)}>
                          <div style={{ fontWeight: 600 }}>{p.name}</div>
                          <div className="pl-muted pl-small">{semLabel(p.sem)} · {p.items.reduce((s, i) => s + i.credit, 0)}학점 · {p.items.length}과목</div>
                        </button>
                        <button className="pl-btn sm" onClick={() => { deletePlan(p.id); setPlans(loadPlans()); }}>삭제</button>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
      {toast && <div className="pl-toast" role="status">{toast}</div>}
    </div>
  );
}
