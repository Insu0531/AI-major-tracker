"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ENTRY_YEAR_MIN } from "@/lib/courses";
import { BASE_MAJORS, isGradMajor, isSangjuLabel, loadMajors, type MajorInfo } from "@/lib/planner/majors";
import { buildCourses, buildEngineGroups, colorAt, loadCurriculum, loadIndex, loadSnapshot, type SectionFilter } from "@/lib/planner/data";
import { exportTimetable, renderTimetablePng, type TimetableItem } from "@/lib/planner/exportImage";
import { deletePlan, loadPlans, markMigrated, readLocal, renamePlan, savePlan, writeLocal, type SavedPlan } from "@/lib/planner/storage";
import { accountsEnabled } from "@/lib/supabase";
import {
  acceptInvite, addCloudPlan, deleteAccount, deleteCloudPlan, getProfile, listCloudPlans, renameCloudPlan,
  setFeatured, signInWithGoogle, signOut, unsetFeatured, useSession, type Profile,
} from "@/lib/account";
import FriendsPanel from "@/components/planner/FriendsPanel";
import { trackSave } from "@/lib/trackSave";
import { courseMatches, normQuery, recommendFill, sampleRecs, type Recommendation } from "@/lib/planner/recommend";
import QuickAdd from "@/components/planner/QuickAdd";
import { analyticsEnabled, initAnalytics, isOptedOut, setOptOut, track } from "@/lib/analytics";
import { dataSemFor, pickDefaultSem, recommendedSem, semLabel, sortSems, TERM_LABEL, TERMS } from "@/lib/planner/semester";
import { shareTimetableImage, shareToKakao } from "@/lib/kakaoShare";
import GuideTour, { type TourStep } from "@/components/GuideTour";
import AcademicCalendarTab from "@/components/AcademicCalendarTab";
import FeedbackTab from "@/components/FeedbackTab";
import { DEFAULT_CONDITIONS, type CartItem, type CartMode, type Conditions, type EngineGroup, type EngineResponse, type Slot, type Snapshot, type SnapshotIndex } from "@/lib/planner/types";
import MajorPicker from "@/components/planner/MajorPicker";
import CourseBrowser from "@/components/planner/CourseBrowser";
import { CartList, ConditionsPanel, cartCredit } from "@/components/planner/CartPanel";
import ResultPanel, { type ResultView } from "@/components/planner/ResultPanel";
import Timetable from "@/components/planner/Timetable";

const STATE_KEY = "knu_planner_state_v1";
const TOUR_KEY = "knu_planner_tour_v1";
const TOUR_2: TourStep[] = [
  { selector: '[data-tour="search"]', title: "과목 찾기", body: "과목명·코드·교수·학과로 검색하거나, 오른쪽 '필터'로 학년·학점·SDG·캠퍼스 등을 고를 수 있어요." },
  { selector: '[data-tour="cats"]', title: "구분", body: "내 전공(학과·학번 이수체계), 교양, 교직 등으로 나눠 볼 수 있어요. 여러 개를 같이 켜도 돼요." },
  { selector: ".pl-course", title: "담기", body: "들을 만한 과목을 넉넉히 담으세요. 과목 이름을 누르면 분반이 펼쳐지고, 원하는 분반만 고정하거나 싫은 분반을 뺄 수 있어요." },
  { selector: '[data-tour="next"]', title: "시간표 보기", body: "담은 과목으로 시간이 겹치지 않게 최대한 많이 넣은 시간표를 만들어 드려요." },
];
const TOUR_3: TourStep[] = [
  { selector: '[data-tour="must"]', title: "꼭 넣을 과목", body: "반드시 들어가야 하는 과목을 고르면 그 과목이 들어간 시간표만 보여 줘요." },
  { selector: '[data-tour="sort"]', title: "정렬 · 조건", body: "공강 많은 순, 늦게 시작 등으로 정렬하고, 아래에서 학점·공강 요일·수업 시간·피할 교수를 정할 수 있어요." },
  { selector: '[data-tour="actions"]', title: "저장 · 수강신청", body: "이미지로 저장하거나 보관함에 넣고, 수강신청 코드를 복사할 수 있어요. ← → 키로 시간표를 넘길 수 있어요." },
];
const ENTRY_YEAR_LAST = 2026; // 이수체계 데이터가 있는 마지막 학번
const fmtDate = (iso: string) => new Date(iso).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" });
const defaultCampuses = (label: string) => (isSangjuLabel(label) ? ["상주"] : ["산격동", "동인동"]);

type Persisted = {
  sem: string | null;
  major: string | null;
  extras: string[];
  entryYear: number;
  cart: CartItem[];
  conditions: Conditions;
  campuses: string[];
  includeGrad: boolean;
  onlyOpen: boolean;
  /** 1단계 학과 목록: 학부 / 대학원 */
  level: "ug" | "grad";
  /** 학기를 직접 고른 시점의 추천 학기 (추천 학기가 바뀌면 다시 자동 선택) */
  semChosenFor: string | null;
  step: 1 | 2 | 3;
};

const INITIAL: Persisted = {
  sem: null,
  major: "ai", // 처음 방문하면 전자공학부 인공지능전공이 기본
  extras: [],
  entryYear: ENTRY_YEAR_LAST,
  cart: [],
  conditions: DEFAULT_CONDITIONS,
  campuses: ["산격동", "동인동"],
  includeGrad: false,
  onlyOpen: false,
  level: "ug",
  semChosenFor: null,
  step: 1,
};

/**
 * 새로고침하면 담은 과목·조건·단계는 처음부터 (사용자 요청).
 * 내 정보(학기·학과·학번·복수전공·캠퍼스 설정)만 기억해서 매번 다시 고르지 않게 한다.
 */
const KEEP_ON_RELOAD = ["sem", "semChosenFor", "major", "extras", "entryYear", "campuses", "includeGrad", "onlyOpen", "level"] as const;
const pickProfile = (s: Partial<Persisted>) =>
  Object.fromEntries(KEEP_ON_RELOAD.filter((k) => k in s).map((k) => [k, s[k]])) as Partial<Persisted>;

function loadPersisted(): Persisted {
  const saved = readLocal<Partial<Persisted>>(STATE_KEY, {});
  return { ...INITIAL, ...pickProfile(saved), conditions: { ...DEFAULT_CONDITIONS } };
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
  const [condOpen, setCondOpen] = useState(false);
  // 결과는 계산에 쓴 groups와 함께 보관 (담은 과목이 바뀌는 사이 이전 결과와 섞이지 않도록)
  const [resp, setResp] = useState<{ data: EngineResponse; groups: EngineGroup[] } | null>(null);
  const [running, setRunning] = useState(false);
  const [selIdx, setSelIdx] = useState(0);
  const [profPick, setProfPick] = useState<Record<string, string>>({});
  const [pickFor, setPickFor] = useState<"image" | "kakao">("image");
  const [modal, setModal] = useState<null | "codes" | "save" | "saved" | "cart" | "bulk" | "friends" | "invite" | "pick" | "refresh">(null);
  /* ── 계정 (구글 로그인 · 보관함 동기화 · 친구) ── */
  const { session } = useSession();
  const loggedIn = !!session;
  const [me, setMe] = useState<Profile | null>(null);
  const [cloudPlans, setCloudPlans] = useState<SavedPlan[]>([]);
  const [saveFeatured, setSaveFeatured] = useState(true);
  const [sheet, setSheet] = useState<null | "calendar" | "feedback">(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [tour, setTour] = useState(false);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [bulkProgress, setBulkProgress] = useState<number | null>(null);
  const [optOut, setOptOutState] = useState(isOptedOut);
  const [majors, setMajors] = useState<MajorInfo[]>(BASE_MAJORS);
  useEffect(() => { loadMajors().then(setMajors); }, []);
  const majorByKey = useMemo(() => new Map(majors.map((m) => [m.key, m])), [majors]);
  const labelOf = useCallback((key: string) => majorByKey.get(key)?.label ?? key, [majorByKey]);
  // 1단계 학부 / 대학원 탭: 고른 과정의 학과만 보여 준다
  const levelMajors = useMemo(() => majors.filter((m) => isGradMajor(m) === (st.level === "grad")), [majors, st.level]);
  const gradCount = useMemo(() => majors.filter(isGradMajor).length, [majors]);
  const chooseLevel = (level: "ug" | "grad") => {
    if (level === st.level) return;
    const fits = (k: string | null) => !!k && isGradMajor(majorByKey.get(k)) === (level === "grad");
    update({ level, major: fits(st.major) ? st.major : null, extras: st.extras.filter(fits), includeGrad: level === "grad" });
    track("level_changed", { level });
  };
  const [saveName, setSaveName] = useState("");
  const [plans, setPlans] = useState<SavedPlan[]>(loadPlans);
  const [toastMsg, setToastMsg] = useState("");
  const flash = useCallback((msg: string) => { setToastMsg(msg); setTimeout(() => setToastMsg(""), 1800); }, []);

  const refreshCloud = useCallback(async () => {
    try {
      const [list, prof] = await Promise.all([listCloudPlans(), getProfile()]);
      setCloudPlans(list);
      setMe(prof);
    } catch { /* 네트워크 오류 시 다음에 다시 */ }
  }, []);
  const reloadPlans = () => { setPlans(loadPlans()); if (loggedIn) void refreshCloud(); };

  useEffect(() => {
    if (!loggedIn) return;
    let alive = true;
    Promise.all([listCloudPlans(), getProfile()])
      .then(([list, prof]) => { if (alive) { setCloudPlans(list); setMe(prof); } })
      .catch(() => { /* 네트워크 오류 시 다음에 다시 */ });
    track("logged_in");
    return () => { alive = false; };
  }, [loggedIn]);

  // 초대 링크(?invite=코드)로 들어오면 코드를 기억해 두고, 로그인되어 있으면 바로 친구 맺기
  const INVITE_KEY = "knu_pending_invite";
  useEffect(() => {
    const url = new URL(window.location.href);
    const code = url.searchParams.get("invite");
    if (!code) return;
    writeLocal(INVITE_KEY, code);
    url.searchParams.delete("invite");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  }, []);
  useEffect(() => {
    const code = readLocal<string>(INVITE_KEY, "");
    if (!code || !accountsEnabled()) return;
    if (!loggedIn) { const t = setTimeout(() => setModal("invite"), 0); return () => clearTimeout(t); }
    writeLocal(INVITE_KEY, "");
    acceptInvite(code)
      .then((name) => { flash(`${name}님과 친구가 됐어요`); track("friend_added", { via: "link" }); })
      .catch((e: Error) => flash(e.message));
  }, [loggedIn, flash]);

  /** 이 브라우저 보관함을 계정으로 옮기기 (기존 사이트 저장본은 원본을 두고 목록에서만 숨김) */
  const migrateLocal = async () => {
    const local = loadPlans();
    let moved = 0;
    for (const p of local) {
      try {
        await addCloudPlan({ name: p.name, sem: p.sem, items: p.items, savedAt: p.savedAt });
        if (p.legacy) markMigrated([p.id]); else deletePlan(p);
        moved++;
      } catch { /* 하나 실패해도 나머지 계속 */ }
    }
    track("plans_migrated", { count: moved });
    flash(`${moved}개를 계정으로 옮겼어요`);
    reloadPlans();
  };
  const [preview, setPreview] = useState<SavedPlan | null>(null);

  const update = useCallback((patch: Partial<Persisted>) => setSt((s) => ({ ...s, ...patch })), []);

  /* ── 초기화: 저장된 상태 + 학기 목록 ── */
  useEffect(() => {
    void initAnalytics();
    loadIndex().then((idx) => {
      if (!idx) { setLoadError(true); return; }
      setIndex(idx);
      // 날짜에 맞는 학기를 기본 선택. 직접 고른 학기는 같은 수강신청 시기 동안만 유지
      const rec = recommendedSem();
      setSt((s) => (s.sem && s.semChosenFor === rec ? s : { ...s, sem: pickDefaultSem(Object.keys(idx.semesters)), semChosenFor: null }));
    });
  }, []);

  useEffect(() => { writeLocal(STATE_KEY, pickProfile(st)); }, [st]);

  // 아직 데이터가 없는 학기(예: 2027년 1학기)는 같은 학기의 가장 최근 데이터(2026년 1학기)로 대신 조회 (2026-11-11 사용자 요청)
  const dataSem = index && st.sem ? dataSemFor(st.sem, Object.keys(index.semesters)) : null;
  const fallbackSem = dataSem && dataSem !== st.sem ? dataSem : null;
  useEffect(() => {
    if (!dataSem) return;
    loadSnapshot(dataSem).then((s) => (s ? setLoaded(s) : setLoadError(true)));
  }, [dataSem]);
  const snapshot = loaded && loaded.sem === dataSem ? loaded : null;

  useEffect(() => {
    if (!st.major) return;
    const key = `${st.major}-${st.entryYear}`;
    loadCurriculum(st.major, st.entryYear, majorByKey.get(st.major)?.years).then((map) => setMineCur({ key, map }));
  }, [st.major, st.entryYear, majorByKey]);
  const mine = st.major && mineCur?.key === `${st.major}-${st.entryYear}` ? mineCur.map : EMPTY_MAP;

  useEffect(() => {
    Promise.all(st.extras.map((m) => loadCurriculum(m, st.entryYear, majorByKey.get(m)?.years))).then((maps) => {
      const merged = new Map<string, string>();
      for (const m of maps) for (const [k, v] of m) if (!merged.has(k)) merged.set(k, v);
      setExtra(merged);
    });
  }, [st.extras, st.entryYear, majorByKey]);

  const courses = useMemo(() => (snapshot ? buildCourses(snapshot.sections, mine, extra) : []), [snapshot, mine, extra]);
  const courseByCode = useMemo(() => new Map(courses.map((c) => [c.code, c])), [courses]);
  const sectionFilter: SectionFilter = useMemo(() => ({ campuses: st.campuses, onlyOpen: st.onlyOpen }), [st.campuses, st.onlyOpen]);
  const cart = useMemo(() => st.cart.filter((i) => courseByCode.has(i.code)), [st.cart, courseByCode]);
  const groups = useMemo(() => buildEngineGroups(cart, courseByCode, sectionFilter), [cart, courseByCode, sectionFilter]);
  // 색은 담은 순서대로 (한 시간표 안에서 같은 색이 나오지 않게)
  const colorIndex = useMemo(() => new Map(st.cart.map((c, i) => [c.code, i])), [st.cart]);
  const colorOf = useCallback((code: string) => colorAt(colorIndex.get(code) ?? 0), [colorIndex]);

  /* ── 조합 계산 (Web Worker) ── */
  const workerRef = useRef<Worker | null>(null);
  const reqId = useRef(0);
  const pending = useRef<EngineGroup[]>([]);
  useEffect(() => {
    const w = new Worker(new URL("../../lib/planner/engine.worker.ts", import.meta.url));
    w.onmessage = (e: MessageEvent<EngineResponse>) => {
      if (e.data.id !== reqId.current) return;
      setResp({ data: e.data, groups: pending.current });
      track("results_computed", { total: e.data.total, kept: e.data.results.length, courses: pending.current.length, truncated: e.data.truncated, ms: e.data.ms });
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
  const courseRef = useRef(courseByCode);
  useEffect(() => { courseRef.current = courseByCode; }, [courseByCode]);
  const setMode = useCallback((code: string, mode: CartMode | null) => {
    const c = courseRef.current.get(code);
    track(mode === null ? "course_removed" : mode === "must" ? "course_must" : "course_added", { code, name: c?.name, category: c?.category });
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
      // 아직 안 담은 과목이면 담으면서 적용
      cart: (s.cart.some((i) => i.code === code) ? s.cart : [...s.cart, { code, mode: "maybe" as const, pinned: null, excluded: [] }]).map((i) => {
        if (i.code !== code) return i;
        if (action === "pin") return { ...i, pinned: i.pinned === id ? null : id, excluded: i.excluded.filter((x) => x !== id) };
        const excluded = i.excluded.includes(id) ? i.excluded.filter((x) => x !== id) : [...i.excluded, id];
        return { ...i, excluded, pinned: i.pinned === id ? null : i.pinned };
      }),
    }));
  }, []);

  /* ── 선택된 결과 → 화면/이미지용 데이터 ── */
  const results = useMemo(() => shown?.results ?? [], [shown]);
  const itemsFor = useCallback((idx: number): ResultView["items"] => {
    const r = results[idx];
    if (!r) return [];
    const items: ResultView["items"] = [];
    resGroups.forEach((g, gi) => {
      const pi = r.picks[gi] ?? -1;
      if (pi < 0 || !g.options[pi]) return;
      const opt = g.options[pi];
      const secs = opt.sections.filter((s) => !s.profs.some((p) => st.conditions.excludeProfs.includes(p)));
      const list = secs.length ? secs : opt.sections;
      const picked = list.find((s) => s.id === profPick[g.code]);
      const wanted = list.find((s) => s.profs.some((p) => (st.conditions.includeProfs ?? []).includes(p)));
      const chosen = picked ?? wanted ?? list[0];
      // 직접 고른 분반이나 '꼭 들어야 하는 교수님' 분반이면 그 교수님으로 확정해서 보여 줌
      const decided = list.length === 1 || !!picked || !!wanted;
      items.push({
        code: g.code,
        name: g.name,
        credit: g.credit,
        slots: opt.slots,
        color: colorOf(g.code),
        prof: decided ? chosen.profs.join(", ") : `${chosen.profs[0] ?? ""} 외 ${list.length - 1}분반`,
        // 교수님 미정이어도 분반들 강의실이 모두 같으면 보여 줌
        room: decided || list.every((x) => x.room === chosen.room) ? chosen.room : "",
        sectionIds: decided ? [chosen.id] : list.map((s) => s.id),
        options: list.map((s) => ({ id: s.id, prof: s.profs.join(", ") || "교수 미정", room: s.room })),
        decided,
        chosen: chosen.id,
      });
    });
    return items;
  }, [results, resGroups, profPick, st.conditions.excludeProfs, st.conditions.includeProfs, colorOf]);
  const view: ResultView | null = useMemo(() => (results[selIdx] ? { items: itemsFor(selIdx) } : null), [results, selIdx, itemsFor]);

  /* 3단계: ← → 키로 시간표 넘기기 */
  useEffect(() => {
    if (st.step !== 3 || results.length < 2) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA") return;
      if (e.key === "ArrowRight") setSelIdx((i) => (i + 1) % results.length);
      if (e.key === "ArrowLeft") setSelIdx((i) => (i - 1 + results.length) % results.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [st.step, results.length]);

  const names = useCallback((i: number) => resGroups.filter((_, gi) => (results[i]?.picks[gi] ?? -1) >= 0).map((g) => g.name), [resGroups, results]);
  const busySlots: Slot[] = useMemo(() => view?.items.flatMap((i) => i.slots) ?? [], [view]);

  /* 지금 시간표의 빈 시간에 넣기 좋은 과목 — 교양 탭 / 전공 탭 (규칙 기반 추천 → 상위 24개 중 8개를 무작위로) */
  const [recSeed, setRecSeed] = useState(() => Math.floor(Math.random() * 1e9));
  const recBase = useMemo(() => (view ? {
    courses,
    cartCodes: new Set(cart.map((c) => c.code)),
    busy: busySlots,
    currentCredit: view.items.reduce((s, i) => s + i.credit, 0),
    cond: st.conditions,
    filter: sectionFilter,
    includeGrad: st.includeGrad,
    limit: 24,
  } : null), [view, courses, cart, busySlots, st.conditions, sectionFilter, st.includeGrad]);
  const recPools = useMemo(() => recBase ? {
    gyoyang: recommendFill({ ...recBase, categories: ["gyoyang", "ilban"] }),
    major: recommendFill({ ...recBase, categories: ["major", "major2"] }),
  } : { gyoyang: [], major: [] }, [recBase]);
  /** 검색한 과목 중 지금 시간표 빈 시간에 들어가는 분반 전부 (구분 상관없이, 과목별로 묶어 최대 30개) */
  const recommendSearch = useCallback((q: string): Recommendation[] => {
    const t = normQuery(q);
    if (!recBase || !t) return [];
    const matched = recBase.courses.filter((c) => courseMatches(c, t));
    return recommendFill({ ...recBase, courses: matched, categories: ["major", "major2", "gyoyang", "kyoshik", "ilban", "other"], perSection: true, limit: 30 });
  }, [recBase]);
  const recs = useMemo(() => ({
    gyoyang: sampleRecs(recPools.gyoyang, 8, recSeed),
    major: sampleRecs(recPools.major, 8, recSeed),
  }), [recPools, recSeed]);

  /* 추천에서 넣은 과목: 목록 위에 남겨 두고 다시 누르면 뺄 수 있게 */
  const [recAdded, setRecAdded] = useState<string[]>([]);
  const addedRecs: Recommendation[] = useMemo(() => recAdded.flatMap((code) => {
    const item = cart.find((c) => c.code === code);
    const course = courseByCode.get(code);
    const section = course?.sections.find((x) => x.id === item?.pinned);
    return course && section ? [{ course, section, score: 0, reasons: [] }] : [];
  }), [recAdded, cart, courseByCode]);
  const removeRec = (code: string) => {
    setMode(code, null);
    setRecAdded((a) => a.filter((c) => c !== code));
    track("rec_removed", { code });
  };

  /** 추천 과목을 그 분반으로 고정해 '꼭 넣을 과목'으로 담음 → 이 과목이 들어간 시간표만 다시 계산 */
  const addRec = (r: Recommendation) => {
    setSt((s) => ({
      ...s,
      cart: [...s.cart.filter((c) => c.code !== r.course.code), { code: r.course.code, mode: "must", pinned: r.section.id, excluded: [] }],
    }));
    setRecAdded((a) => [...a.filter((c) => c !== r.course.code), r.course.code]);
    const tab = recs.major.includes(r) ? "major" : recs.gyoyang.includes(r) ? "gyoyang" : "search";
    track("rec_added", { code: r.course.code, name: r.course.name, reasons: r.reasons, tab, rank: tab === "search" ? 0 : recs[tab].indexOf(r) + 1 });
    flash(`${r.course.name}을(를) 넣었어요`);
  };

  const majorLabel = st.major ? labelOf(st.major) : "";
  const title = st.sem ? `${semLabel(st.sem)} 시간표` : "시간표";
  /** 지금 시간표 이미지를 카카오톡 피드 카드로 공유 (안 되면 기본 공유 창 → 그것도 안 되면 이미지 저장) */
  const doKakao = async (items: TimetableItem[] = view?.items ?? [], cardTitle = title, fileName = title) => {
    if (!items.length) return;
    flash("공유할 이미지를 만드는 중이에요");
    try {
      const png = await renderTimetablePng(items);
      const how = await shareTimetableImage(png, {
        // 카드: 제목 "2026년 2학기 시간표", 설명은 두 줄 — "전자공학부 인공지능전공" / "KNU 시간표 마법사에서 만들었어요"
        title: cardTitle,
        description: [majorLabel, "KNU 시간표 마법사에서 만들었어요"].filter(Boolean).join("\n"),
        fileName,
      });
      track("timetable_shared", { how, courses: items.length });
      if (how === "download") { await doImage(items); flash("공유할 수 없어 이미지로 저장했어요"); }
    } catch {
      flash("공유하지 못했어요. 이미지 저장을 이용해 주세요");
    }
  };

  const doImage = async (items: TimetableItem[] = view?.items ?? [], t = title) => {
    if (!items.length) return;
    const credit = items.reduce((s, i) => s + i.credit, 0);
    await exportTimetable({
      title: t,
      subtitle: [majorLabel, `${credit}학점`].filter(Boolean).join(" · "),
      items,
    });
    logSave("이미지 저장");
    track("image_saved", { courses: items.length, credit });
  };

  /** 기존 사이트와 같은 Google Form 저장 로그 */
  const logSave = (event: "이미지 저장" | "라이브러리 저장") =>
    trackSave({ event, majorLabel, extraMajorLabels: st.extras.map(labelOf), entryYear: st.entryYear });

  /* 모든 결과 이미지 일괄 저장 (기존 "모든 시간표 이미지 저장") */
  const doBulkImages = async () => {
    setModal(null);
    const pad = String(results.length).length;
    for (let i = 0; i < results.length; i++) {
      setBulkProgress(i + 1);
      const items = itemsFor(i);
      const credit = items.reduce((s, it) => s + it.credit, 0);
      await exportTimetable({
        title,
        subtitle: [majorLabel, `${credit}학점`, `${i + 1}번`].filter(Boolean).join(" · "),
        items,
        fileName: `${title} ${String(i + 1).padStart(pad, "0")}`,
        });
      await new Promise((r) => setTimeout(r, 400)); // 브라우저 다중 다운로드 차단 방지
    }
    setBulkProgress(null);
    logSave("이미지 저장");
    track("image_saved_bulk", { count: results.length });
  };

  // 새 화면은 라이트 모드만 (기존 사이트의 다크 설정은 건드리지 않고, 이 화면에서만 끔)
  useEffect(() => {
    const root = document.documentElement;
    const had = root.classList.contains("dark");
    root.classList.remove("dark");
    return () => { if (had) root.classList.add("dark"); };
  }, []);

  const doSave = async (): Promise<boolean> => {
    if (!view || !st.sem) return false;
    const name = saveName.trim() || `${title} ${plans.length + cloudPlans.length + 1}`;
    const items = view.items.map((i) => ({ code: i.code, name: i.name, prof: i.prof, room: i.room, credit: i.credit, slots: i.slots, color: i.color, sectionIds: i.sectionIds }));
    if (loggedIn) {
      try {
        const saved = await addCloudPlan({ name, sem: st.sem, items });
        if (saveFeatured) await setFeatured(saved.id);
      } catch (e) { flash((e as Error).message); return false; }
    } else if (!savePlan({ name, sem: st.sem, items })) { flash("저장 공간이 부족해요"); return false; }
    setSavedSig(viewSig);
    logSave("라이브러리 저장");
    track("plan_saved", { courses: view.items.length, cloud: loggedIn, featured: loggedIn && saveFeatured });
    reloadPlans();
    setModal(null);
    setSaveName("");
    flash(loggedIn && saveFeatured ? "저장하고 대표 시간표로 정했어요" : "보관함에 저장했어요");
    return true;
  };

  /* ── 새로고침 전에 "보관함에 저장할까요?" ──
     새로고침하면 담은 과목·조건이 초기화되므로, 저장 안 한 시간표가 있으면 묻는다.
     F5 / Ctrl·⌘+R 은 우리 창을 띄우고, 브라우저 버튼·당겨서 새로고침은 브라우저 기본 확인 창만 가능(보안 제한). */
  const viewSig = view ? view.items.map((i) => `${i.code}:${i.chosen}`).sort().join("|") : "";
  const [savedSig, setSavedSig] = useState<string | null>(null);
  const dirty = cart.length > 0 && (!view || viewSig !== savedSig);
  const leaving = useRef(false);
  const reloadNow = () => { leaving.current = true; window.location.reload(); };
  useEffect(() => {
    if (!dirty) return;
    const onBefore = (e: BeforeUnloadEvent) => { if (leaving.current) return; e.preventDefault(); e.returnValue = ""; };
    const onKey = (e: KeyboardEvent) => {
      const isReload = e.key === "F5" || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "r");
      if (!isReload) return;
      e.preventDefault();
      setModal("refresh");
      track("refresh_prompted");
    };
    window.addEventListener("beforeunload", onBefore);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("beforeunload", onBefore); window.removeEventListener("keydown", onKey); };
  }, [dirty]);

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); flash("복사했어요"); track("code_copied"); } catch { flash("복사에 실패했어요"); }
  };

  const sems = index ? sortSems(Object.keys(index.semesters)) : [];
  // 연도 · 학기 따로 고르기 (데이터 첫 해 ~ 지금 기준 +4년)
  const [selYear, selTerm] = (st.sem ?? recommendedSem()).split("-");
  const yearOptions = (() => {
    const ys = sems.map((s) => +s.split("-")[0]);
    const first = Math.min(...ys, +recommendedSem().split("-")[0]);
    const last = Math.max(...ys, +recommendedSem().split("-")[0]) + 4;
    return Array.from({ length: last - first + 1 }, (_, i) => first + i);
  })();
  const chooseSem = (year: string, term: string) => update({ sem: `${year}-${term}`, semChosenFor: recommendedSem() });

  const doRename = async (p: SavedPlan, name: string) => {
    if (!name) return;
    if (p.cloud) await renameCloudPlan(p.id, name).catch((e: Error) => flash(e.message));
    else renamePlan(p, name);
    reloadPlans();
  };
  const doDelete = async (p: SavedPlan) => {
    if (!window.confirm(`'${p.name}'을(를) 삭제할까요?`)) return;
    if (p.cloud) await deleteCloudPlan(p.id).catch((e: Error) => flash(e.message));
    else deletePlan(p);
    reloadPlans();
  };
  const toggleFeatured = async (p: SavedPlan) => {
    try {
      if (p.featured) await unsetFeatured(p.id); else await setFeatured(p.id);
      track("featured_set", { on: !p.featured });
      flash(p.featured ? "대표 시간표를 해제했어요" : `${semLabel(p.sem)} 대표 시간표로 정했어요`);
    } catch (e) { flash((e as Error).message); }
    reloadPlans();
  };

  const renderPlanRow = (p: SavedPlan) => (
    <div key={p.id} className="pl-code-row">
      {renaming?.id === p.id ? (
        <input autoFocus className="pl-field" value={renaming.name}
          onChange={(e) => setRenaming({ id: p.id, name: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter") { void doRename(p, renaming.name.trim()); setRenaming(null); }
            if (e.key === "Escape") setRenaming(null);
          }}
          onBlur={() => { void doRename(p, renaming.name.trim()); setRenaming(null); }} />
      ) : (
        <button className="pl-course-main" onClick={() => setPreview(p)}>
          <div style={{ fontWeight: 600 }}>
            {p.name}{" "}
            {p.featured && <span className="pl-badge cat-major">대표</span>}
            {p.legacy && <span className="pl-badge">기존 사이트</span>}
          </div>
          <div className="pl-hint">{semLabel(p.sem)} · {p.items.reduce((s, i) => s + i.credit, 0)}학점 · {p.items.length}과목</div>
        </button>
      )}
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "flex-end" }}>
        {p.cloud && (
          <button className="pl-btn sm" aria-pressed={!!p.featured} onClick={() => toggleFeatured(p)} title="친구에게 보이는 이번 학기 내 시간표">
            {p.featured ? "대표 해제" : "대표로"}
          </button>
        )}
        <button className="pl-btn sm" onClick={() => setPreview(p)}>보기</button>
        <button className="pl-btn sm" onClick={() => setRenaming({ id: p.id, name: p.name })}>이름 수정</button>
        <button className="pl-btn sm pl-kakao" onClick={() => { track("saved_shared"); void doKakao(p.items, `${semLabel(p.sem)} 시간표`, p.name); }}>카톡 공유</button>
        <button className="pl-btn sm" onClick={() => doDelete(p)}>삭제</button>
      </div>
    </div>
  );
  const collectedAt = dataSem ? index?.semesters[dataSem]?.collectedAt : undefined;
  const step = st.step;
  const goStep = (n: 1 | 2 | 3) => {
    update({ step: n });
    track("step_view", { step: n, cart: cart.length });
    if (n === 2 && !readLocal<number>(TOUR_KEY, 0)) setTour(true);
  };

  return (
    <div className="pl">
      <header className="pl-top">
        <div className="pl-brand">KNU <span>시간표 마법사</span></div>
        <nav className="pl-steps" aria-label="단계">
          {([[1, "내 정보"], [2, "과목 담기"], [3, "시간표"]] as const).map(([n, label], i) => (
            <div key={n} style={{ display: "flex", alignItems: "center" }}>
              {i > 0 && <span className="pl-step-sep" />}
              <button className="pl-step" aria-current={step === n ? "step" : undefined} disabled={n > 1 && !snapshot} onClick={() => goStep(n)}>
                <b>{n}</b><span>{label}</span>
              </button>
            </div>
          ))}
        </nav>
        <div className="pl-top-right">
          {accountsEnabled() ? (loggedIn
            ? <button className="pl-btn ghost" onClick={() => { setModal("friends"); track("friends_opened"); }}>친구</button>
            : <button className="pl-btn ghost" onClick={() => { track("login_clicked"); void signInWithGoogle(); }}>구글 로그인</button>)
            : (
              <button className="pl-btn ghost pl-soon pl-hide-mobile" aria-disabled="true" title="구글 로그인 · 친구 시간표 기능을 준비하고 있어요"
                onClick={() => { flash("구글 로그인과 친구 기능은 준비 중이에요"); track("soon_clicked", { feature: "account" }); }}>
                로그인 · 친구 <span className="pl-soon-badge">준비 중</span>
              </button>
            )}
          <button className="pl-btn ghost" onClick={() => { reloadPlans(); setModal("saved"); }}>보관함{plans.length + cloudPlans.length ? ` ${plans.length + cloudPlans.length}` : ""}</button>
          <div className="pl-pop">
            <button className="pl-btn ghost" aria-expanded={menuOpen} aria-label="메뉴" onClick={() => setMenuOpen((v) => !v)}>메뉴</button>
            {menuOpen && (
              <>
                <div style={{ position: "fixed", inset: 0, zIndex: 29 }} onClick={() => setMenuOpen(false)} />
                <div className="pl-pop-panel pl-menu" style={{ left: "auto", right: 0, width: 220 }}>
                  <div className="pl-pop-list">
                    {loggedIn && (
                      <div className="pl-menu-account">
                        <b>{me?.display_name ?? "로그인됨"}</b>
                        <span>{session?.user.email}</span>
                      </div>
                    )}
                    {step > 1 && <button onClick={() => { setMenuOpen(false); setTour(true); }}>사용법 보기</button>}
                    {!accountsEnabled() && (
                      <button className="pl-show-mobile" onClick={() => { setMenuOpen(false); flash("구글 로그인과 친구 기능은 준비 중이에요"); }}>로그인 · 친구 (준비 중)</button>
                    )}
                    <button onClick={() => { setMenuOpen(false); setSheet("calendar"); track("menu_calendar"); }}>학사일정</button>
                    <button onClick={() => { setMenuOpen(false); setSheet("feedback"); track("menu_feedback"); }}>피드백 · 응원</button>
                    <button onClick={() => { setMenuOpen(false); shareToKakao(); track("kakao_share"); }}>카카오톡으로 공유</button>
                    <a href="/old" onClick={() => track("old_version_opened")}>구버전 보기</a>
                    <a href="/privacy" target="_blank" rel="noopener">개인정보처리방침</a>
                    <a href="mailto:insu0531@knu.ac.kr">문의 · insu0531@knu.ac.kr</a>
                    {loggedIn && <button onClick={async () => { setMenuOpen(false); await signOut(); setCloudPlans([]); setMe(null); flash("로그아웃했어요"); }}>로그아웃</button>}
                    {loggedIn && (
                      <button onClick={async () => {
                        setMenuOpen(false);
                        if (!window.confirm("회원 탈퇴하면 계정에 저장한 시간표와 친구 관계가 모두 바로 삭제되고 되돌릴 수 없어요. 탈퇴할까요?")) return;
                        try { await deleteAccount(); setCloudPlans([]); setMe(null); flash("탈퇴했어요. 그동안 고마웠어요"); }
                        catch (e) { flash((e as Error).message); }
                      }}>회원 탈퇴</button>
                    )}
                    {analyticsEnabled() && (
                      <button onClick={() => { const next = !optOut; setOptOut(next); setOptOutState(next); flash(next ? "사용 통계를 보내지 않아요" : "사용 통계 보내기를 다시 켰어요"); }}>
                        사용 통계 {optOut ? "보내기 켜기" : "보내지 않기"}
                      </button>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </header>
      {step > 1 && fallbackSem && st.sem && (
        <div className="pl-sem-note" role="status">
          {semLabel(st.sem)} 개설 정보가 아직 없어 <b>{semLabel(fallbackSem)}</b> 개설 정보로 보여 드려요. 실제 개설 과목·시간은 달라질 수 있어요.
        </div>
      )}

      {step === 1 ? (
        <div className="pl-scroll">
          <div className="pl-intro">
            <div className="pl-intro-lead pl-enter">
              <h1>담기만 하세요.<br /><em>시간표</em>는 알아서<br />짜 드릴게요.</h1>
              <p>전공·교양·교직을 한 번에 담으면 시간이 겹치지 않는 조합을 모두 찾아,<br />공강 많은 순·늦게 시작하는 순으로 정리해 드려요.</p>
              <p className="pl-intro-point">우리 과에서는 안 열려도 <b>전공으로 인정되는 다른 학과 개설 과목</b>까지 함께 찾아 드려요.</p>
              <div className="pl-hint">
                {collectedAt && <>{fmtDate(collectedAt)} 기준 개설 정보 · </>}
                <a className="pl-link" href="/privacy" target="_blank" rel="noopener">개인정보처리방침</a> · <a className="pl-link" href="mailto:insu0531@knu.ac.kr">insu0531@knu.ac.kr</a>
              </div>
            </div>
            <div className="pl-intro-form pl-enter" style={{ animationDelay: "60ms" }}>
              <div>
                <div className="pl-label">학기</div>
                <div className="pl-grid2">
                  <select className="pl-select" value={selYear} onChange={(e) => chooseSem(e.target.value, selTerm)} aria-label="연도">
                    {yearOptions.map((y) => <option key={y} value={y}>{y}년</option>)}
                  </select>
                  <select className="pl-select" value={selTerm} onChange={(e) => chooseSem(selYear, e.target.value)} aria-label="학기">
                    {TERMS.map((t) => <option key={t} value={t}>{TERM_LABEL[t]}{index && !index.semesters[`${selYear}-${t}`] ? " (준비 중)" : ""}</option>)}
                  </select>
                </div>
                {fallbackSem && st.sem && (
                  <div className="pl-hint" style={{ marginTop: 6 }}>{semLabel(st.sem)} 개설 정보는 아직 없어서 <b>{semLabel(fallbackSem)}</b> 개설 정보로 보여 드려요. 학교에 강의가 열리면 자동으로 바뀌어요.</div>
                )}
              </div>
              <div>
                <div className="pl-tabs pl-level-tabs" role="tablist" aria-label="과정">
                  {(["ug", "grad"] as const).map((l) => (
                    <button key={l} role="tab" type="button" className="pl-tab" aria-selected={st.level === l} style={{ "--c": "var(--accent)" } as CSSProperties} onClick={() => chooseLevel(l)}>
                      {l === "ug" ? "학부" : "대학원"}
                      <span className="pl-tab-count">{l === "ug" ? majors.length - gradCount : gradCount}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="pl-row">
                <div>
                  <div className="pl-label">학과</div>
                  <MajorPicker options={levelMajors} value={st.major} onChange={(m) => { update({ major: m, campuses: defaultCampuses(labelOf(m)), ...(isGradMajor(majorByKey.get(m)) ? { includeGrad: true } : {}) }); track("major_selected", { major: labelOf(m) }); }} />
                </div>
                <div>
                  <div className="pl-label">학번</div>
                  <select className="pl-select" value={st.entryYear} onChange={(e) => update({ entryYear: +e.target.value })} aria-label="학번">
                    {Array.from({ length: ENTRY_YEAR_LAST - ENTRY_YEAR_MIN + 1 }, (_, i) => ENTRY_YEAR_LAST - i).map((y) => <option key={y} value={y}>{y}학번</option>)}
                  </select>
                </div>
              </div>
              {st.major && (
                <div>
                  <div className="pl-label">복수전공 · 부전공 <span className="pl-muted" style={{ fontWeight: 500 }}>(선택, 최대 3개)</span></div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {st.extras.map((m, i) => (
                      <MajorPicker options={levelMajors} key={i} value={m} onChange={(nm) => update({ extras: st.extras.map((x, j) => (j === i ? nm : x)) })} onRemove={() => update({ extras: st.extras.filter((_, j) => j !== i) })} />
                    ))}
                    {st.extras.length < 3 && <MajorPicker options={levelMajors} value={null} placeholder="+ 학과 추가" onChange={(m) => update({ extras: [...st.extras, m] })} />}
                  </div>
                </div>
              )}
              <button className="pl-btn primary lg" disabled={!snapshot} onClick={() => goStep(2)}>
                {snapshot ? (st.major ? "과목 담으러 가기 →" : "학과 없이 계속하기 →") : loadError ? "강의 데이터를 불러오지 못했어요" : "강의 정보 불러오는 중…"}
              </button>
            </div>
          </div>
        </div>
      ) : !snapshot ? (
        <div className="pl-loading">{loadError ? "강의 데이터를 불러오지 못했어요. 잠시 후 새로고침해 주세요." : "강의 정보 불러오는 중…"}</div>
      ) : step === 2 ? (
        <div className="pl-body pl-enter">
          <div className="pl-split">
            <div>
              <CourseBrowser
                key={`${st.sem}-${st.major ?? ""}`}
                myLabels={[st.major, ...st.extras].filter((m): m is string => !!m).map(labelOf)}
                courses={courses}
                cart={cart}
                hasMajor={!!st.major}
                hasExtra={st.extras.length > 0}
                sectionFilter={sectionFilter}
                onCampusesChange={(c) => update({ campuses: c })}
                includeGrad={st.includeGrad}
                onIncludeGradChange={(v) => update({ includeGrad: v })}
                onOnlyOpenChange={(v) => update({ onlyOpen: v })}
                conditions={st.conditions}
                busySlots={busySlots}
                onSetMode={setMode}
                onSection={onSection}
              />
            </div>
            <aside className="pl-cart-side">
              <div className="pl-cart-head"><h2>담은 과목</h2></div>
              <div className="pl-scroll">
                <CartList cart={cart} courseByCode={courseByCode} colorOf={colorOf} onSetMode={setMode} onClear={() => update({ cart: [] })} />
              </div>
            </aside>
          </div>
          <div className="pl-bar" data-tour="next">
            <button className="pl-bar-summary" onClick={() => setModal("cart")}>
              <b>{cart.length}과목 담음</b>
              <div className="pl-hint">최대 {cartCredit(cart, courseByCode)}학점<span className="pl-hide-mobile"> · 겹치지 않게 최대한 넣어 드려요</span></div>
            </button>
            <button className="pl-btn primary lg" disabled={cart.length === 0} onClick={() => goStep(3)}>시간표 보기</button>
          </div>
        </div>
      ) : (
        <div className="pl-plan pl-enter">
          <aside className="pl-cond" data-open={condOpen}>
            <button className="pl-cond-toggle" onClick={() => setCondOpen((v) => !v)} aria-expanded={condOpen}>
              <span>조건 · 정렬</span><span className="pl-muted">{condOpen ? "접기 ▴" : "펼치기 ▾"}</span>
            </button>
            <div className="pl-scroll">
              <div className="pl-cond-block" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span><b>{cart.length}과목</b> <span className="pl-muted">담음</span></span>
                <button className="pl-link" onClick={() => goStep(2)}>과목 더 담기 · 빼기</button>
              </div>
              <ConditionsPanel cart={cart} courseByCode={courseByCode} conditions={st.conditions} onConditions={(c) => {
                const changed = (Object.keys(c) as (keyof Conditions)[]).filter((k) => JSON.stringify(c[k]) !== JSON.stringify(st.conditions[k]));
                track("condition_changed", { keys: changed, sort: c.sort, daysOff: c.daysOff, maxCredit: c.maxCredit, includeProfs: c.includeProfs.length, excludeProfs: c.excludeProfs.length });
                update({ conditions: c });
              }} onSetMode={setMode} />
            </div>
          </aside>
          <section>
            <ResultPanel
              response={shown}
              running={busy}
              cartEmpty={cart.length === 0}
              selIdx={selIdx}
              onSelect={setSelIdx}
              view={view}
              names={names}
              onImage={() => (view?.items.some((i) => i.options.length > 1 && !i.decided) ? (setPickFor("image"), setModal("pick")) : doImage())}
              onKakao={() => (view?.items.some((i) => i.options.length > 1 && !i.decided) ? (setPickFor("kakao"), setModal("pick")) : void doKakao())}
              onSave={() => { setSaveName(""); setModal("save"); }}
              onCodes={() => { setModal("codes"); track("codes_opened"); }}
              onBulk={results.length > 1 ? () => (results.length > 20 ? setModal("bulk") : doBulkImages()) : undefined}
              bulkProgress={bulkProgress}
              onBack={() => goStep(2)}
              recs={recs}
              addedRecs={addedRecs}
              onAddRec={addRec}
              onRemoveRec={removeRec}
              canShuffle={{ gyoyang: recPools.gyoyang.length > recs.gyoyang.length, major: recPools.major.length > recs.major.length }}
              onShuffleRecs={() => { setRecSeed((x) => x + 1); track("rec_shuffled"); }}
              hasMajor={!!st.major || st.extras.length > 0}
              recommendSearch={recommendSearch}
              quickAdd={(q) => (
                <QuickAdd
                  q={q}
                  courses={courses}
                  cart={cart}
                  sectionFilter={sectionFilter}
                  includeGrad={st.includeGrad}
                  myLabels={[st.major, ...st.extras].filter((m): m is string => !!m).map(labelOf)}
                  onSetMode={setMode}
                  onSection={onSection}
                />
              )}
              onChoose={(code, id) => { setProfPick((p) => ({ ...p, [code]: id })); track("section_chosen", { where: "block" }); }}
            />
          </section>
        </div>
      )}

      {modal && (
        <div className="pl-modal-bg" onClick={() => { setModal(null); setPreview(null); }}>
          <div className="pl-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            {modal === "refresh" && (
              <>
                <div className="pl-modal-head"><h3>새로고침할까요?</h3><button className="pl-x" aria-label="닫기" onClick={() => setModal(null)}>×</button></div>
                <div className="pl-modal-body">
                  <div>새로고침하면 담은 과목과 조건이 <b>처음부터 다시</b> 시작돼요. (학기·학과·학번은 그대로)</div>
                  {view ? (
                    <>
                      <div className="pl-hint">지금 보고 있는 시간표({view.items.length}과목 · {view.items.reduce((s, i) => s + i.credit, 0)}학점)를 보관함에 저장해 둘까요?</div>
                      <button className="pl-btn primary lg" onClick={async () => { if (await doSave()) { track("refresh_saved"); reloadNow(); } }}>보관함에 저장하고 새로고침</button>
                    </>
                  ) : (
                    <div className="pl-hint">아직 만든 시간표가 없어서 저장할 건 없어요.</div>
                  )}
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="pl-btn" style={{ flex: 1 }} onClick={() => { track("refresh_discarded"); reloadNow(); }}>저장하지 않고 새로고침</button>
                    <button className="pl-btn" style={{ flex: 1 }} onClick={() => setModal(null)}>취소</button>
                  </div>
                </div>
              </>
            )}
            {modal === "pick" && view && (
              <>
                <div className="pl-modal-head"><h3>{pickFor === "kakao" ? "분반 고르고 공유" : "분반 고르고 저장"}</h3><button className="pl-x" aria-label="닫기" onClick={() => setModal(null)}>×</button></div>
                <div className="pl-modal-body">
                  <div className="pl-hint">같은 시간에 교수님이 다른 분반이 있어요. 고르면 이미지에 교수님·강의실이 들어가요.</div>
                  {view.items.filter((i) => i.options.length > 1).map((it) => (
                    <div key={it.code} className="pl-pick-group">
                      <div style={{ fontWeight: 700 }}>{it.name}</div>
                      <div className="pl-chips">
                        {it.options.map((o) => (
                          <button key={o.id} className="pl-chip" aria-pressed={it.decided && it.chosen === o.id}
                            onClick={() => { setProfPick((p) => ({ ...p, [it.code]: o.id })); track("section_chosen", { where: "save" }); }}>
                            {o.id.split("-").pop()} · {o.prof}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                  <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                    <button className="pl-btn" style={{ flex: 1 }} onClick={() => { setModal(null); void (pickFor === "kakao" ? doKakao() : doImage()); }}>고르지 않고 {pickFor === "kakao" ? "공유" : "저장"}</button>
                    <button className="pl-btn primary" style={{ flex: 1 }} onClick={() => { setModal(null); void (pickFor === "kakao" ? doKakao() : doImage()); }}>{pickFor === "kakao" ? "카톡 공유" : "이미지 저장"}</button>
                  </div>
                </div>
              </>
            )}
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
            {modal === "cart" && (
              <>
                <div className="pl-modal-head"><h3>담은 과목 {cart.length}</h3><button className="pl-x" aria-label="닫기" onClick={() => setModal(null)}>×</button></div>
                <div className="pl-modal-body" style={{ padding: 0 }}>
                  <CartList cart={cart} courseByCode={courseByCode} colorOf={colorOf} onSetMode={setMode} onClear={() => update({ cart: [] })} />
                </div>
              </>
            )}
            {modal === "friends" && loggedIn && (
              <>
                <div className="pl-modal-head"><h3>친구</h3><button className="pl-x" aria-label="닫기" onClick={() => setModal(null)}>×</button></div>
                <FriendsPanel sems={sems} defaultSem={st.sem ?? sems[sems.length - 1]} flash={flash} />
              </>
            )}
            {modal === "invite" && (
              <>
                <div className="pl-modal-head"><h3>친구 초대를 받았어요</h3><button className="pl-x" aria-label="닫기" onClick={() => setModal(null)}>×</button></div>
                <div className="pl-modal-body">
                  <div>구글 계정으로 로그인하면 바로 친구가 돼요. 서로의 <b>대표 시간표</b>(과목명·시간·교수님)를 볼 수 있어요.</div>
                  <button className="pl-btn primary lg" onClick={() => { track("login_clicked", { from: "invite" }); void signInWithGoogle(); }}>구글로 로그인하고 친구 되기</button>
                  <button className="pl-link" style={{ alignSelf: "center" }} onClick={() => { writeLocal("knu_pending_invite", ""); setModal(null); }}>괜찮아요</button>
                </div>
              </>
            )}
            {modal === "bulk" && (
              <>
                <div className="pl-modal-head"><h3>이미지 {results.length}장 저장</h3><button className="pl-x" aria-label="닫기" onClick={() => setModal(null)}>×</button></div>
                <div className="pl-modal-body">
                  <div>결과 {results.length}개를 모두 이미지로 저장해요. 브라우저가 여러 파일 다운로드를 물어보면 허용해 주세요.</div>
                  <button className="pl-btn primary" onClick={doBulkImages}>모두 저장</button>
                </div>
              </>
            )}
            {modal === "save" && (
              <>
                <div className="pl-modal-head"><h3>보관함에 저장</h3><button className="pl-x" aria-label="닫기" onClick={() => setModal(null)}>×</button></div>
                <div className="pl-modal-body">
                  <input autoFocus className="pl-field" placeholder={`${title} ${plans.length + 1}`} value={saveName}
                    onChange={(e) => setSaveName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && doSave()} />
                  {loggedIn && (
                    <label className="pl-check">
                      <input type="checkbox" checked={saveFeatured} onChange={(e) => setSaveFeatured(e.target.checked)} />
                      {st.sem ? semLabel(st.sem) : "이 학기"} 대표 시간표로 정하기 <span className="pl-muted">(친구에게 보여요)</span>
                    </label>
                  )}
                  <button className="pl-btn primary" onClick={doSave}>저장</button>
                  <div className="pl-muted pl-small">
                    {loggedIn ? "계정에 저장돼서 다른 기기에서도 볼 수 있어요." : accountsEnabled() ? "이 브라우저에만 저장돼요. 구글로 로그인하면 계정에 저장돼요." : "이 브라우저에만 저장돼요."}
                  </div>
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
                        <button className="pl-btn pl-kakao" style={{ flex: 1 }} onClick={() => { track("saved_shared"); void doKakao(preview.items, `${semLabel(preview.sem)} 시간표`, preview.name); }}>카톡 공유</button>
                      </div>
                    </>
                  ) : plans.length + cloudPlans.length === 0 ? (
                    <div className="pl-empty">저장한 시간표가 없어요.</div>
                  ) : (
                    <>
                      {loggedIn && cloudPlans.length > 0 && <div className="pl-label">내 계정</div>}
                      {loggedIn && cloudPlans.map(renderPlanRow)}
                      {plans.length > 0 && (
                        <>
                          {loggedIn && (
                            <div className="pl-migrate">
                              <span>이 브라우저에만 있는 시간표 {plans.length}개</span>
                              <button className="pl-btn sm primary" onClick={migrateLocal}>계정으로 옮기기</button>
                            </div>
                          )}
                          {plans.map(renderPlanRow)}
                        </>
                      )}
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
      {sheet && (
        <div className="pl-modal-bg" onClick={() => setSheet(null)}>
          <div className="pl-modal pl-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="pl-modal-head"><h3>{sheet === "calendar" ? "학사일정" : "피드백 · 응원"}</h3><button className="pl-x" aria-label="닫기" onClick={() => setSheet(null)}>×</button></div>
            <div className="pl-sheet-body">{sheet === "calendar" ? <AcademicCalendarTab /> : <FeedbackTab />}</div>
          </div>
        </div>
      )}
      <GuideTour variant="planner" steps={step === 3 ? TOUR_3 : TOUR_2} run={tour && step > 1} onClose={() => { setTour(false); writeLocal(TOUR_KEY, Date.now()); }} />
      {toastMsg && <div className="pl-toast" role="status">{toastMsg}</div>}
    </div>
  );
}
