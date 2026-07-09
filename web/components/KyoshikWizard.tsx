"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { buildSectionGroups, generateCombos, parseTimes, Section, TimeSlot, NoTimeSection } from "@/lib/timetable";
import { captureTimetableImage } from "@/lib/captureTimetable";
import SugangLink from "@/components/SugangLink";
import TimetableGrid from "@/components/TimetableGrid";
import ProfPickerModal, { ProfStep, getMultiProfSections, applyProfPicks, getMultiProfNoTimeSections, applyProfPicksNoTime } from "@/components/ProfPickerModal";
import { saveTimetable } from "@/lib/timetableStorage";
import { trackSave } from "@/lib/trackSave";

type Row = { grade: string; crseNo: string; name: string; code: string; credit: string; dept: string; prof: string; timeStr: string; rmrk: string; location: string; tag?: string };

function slotsOverlap(a: TimeSlot[], b: TimeSlot[]): boolean {
  for (const x of a) for (const y of b) {
    if (x.day === y.day && x.start < y.end && x.end > y.start) return true;
  }
  return false;
}

const DAY_NAMES = ["월", "화", "수", "목", "금", "토"];
function fmt(h: number) {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return `${hh}:${String(mm).padStart(2, "0")}`;
}
function formatTimeStr(timeStr: string): string {
  const slots = parseTimes(timeStr);
  const byDay = new Map<number, { start: number; end: number }[]>();
  for (const s of slots) {
    if (!byDay.has(s.day)) byDay.set(s.day, []);
    byDay.get(s.day)!.push({ start: s.start, end: s.end });
  }
  const parts: string[] = [];
  for (const [day, segs] of [...byDay.entries()].sort((a, b) => a[0] - b[0])) {
    segs.sort((a, b) => a.start - b.start);
    const merged: { start: number; end: number }[] = [];
    for (const seg of segs) {
      if (merged.length && seg.start <= merged[merged.length - 1].end) {
        merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, seg.end);
      } else merged.push({ ...seg });
    }
    for (const m of merged) parts.push(`${DAY_NAMES[day]} ${fmt(m.start)}~${fmt(m.end)}`);
  }
  return parts.join(", ");
}

export default function KyoshikWizard({ pinnedCombo, pinnedNoTimeSections, initialSem, majorLabel, majorLabel2, major, entryYear, extraMajorLabels, onFeedbackClick }: {
  pinnedCombo: Section[] | null;
  pinnedNoTimeSections?: NoTimeSection[];
  initialSem?: string;
  majorLabel?: string;
  majorLabel2?: string;
  major?: string;
  entryYear?: number;
  extraMajorLabels?: string[];
  onFeedbackClick?: () => void;
}) {
  const [semYear] = useState(() => initialSem?.split("-")[0] ?? "2026");
  const [semTerm] = useState(() => initialSem?.split("-")[1] ?? "1");
  const sem = `${semYear}-${semTerm}`;

  const [search, setSearch] = useState("");
  const [filterHideConflict, setFilterHideConflict] = useState(true);
  const [filterSangju, setFilterSangju] = useState<"exclude" | "include" | "all">("exclude");
  const [filterPanelOpen, setFilterPanelOpen] = useState(true);
  const [filterDayCombo, setFilterDayCombo] = useState<string>("");
  const [maxCredit, setMaxCredit] = useState(0);
  const [minKyoshikCredit, setMinKyoshikCredit] = useState(0);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expandedCodes, setExpandedCodes] = useState<Set<string>>(new Set());
  const [allRows, setAllRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);

  const [combos, setCombos] = useState<Section[][]>([]);
  const [comboIdx, setComboIdx] = useState(0);
  const [panelOpen, setPanelOpen] = useState(() => typeof window !== "undefined" && window.innerWidth >= 768);
  const [noTimeSections, setNoTimeSections] = useState<NoTimeSection[]>([]);
  const [slideDir, setSlideDir] = useState<"left" | "right">("left");
  const [navTick, setNavTick] = useState(0);
  const [slideOutCombo, setSlideOutCombo] = useState<Section[] | null>(null);
  const slideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [leftTab, setLeftTab] = useState<"timetable" | "list">("timetable");
  const [listSearch, setListSearch] = useState("");
  const [listSortState, setListSortState] = useState<{ col: keyof Row; dir: "asc" | "desc" } | null>(null);
  const [saving, setSaving] = useState(false);
  const timetableRef = useRef<HTMLDivElement | null>(null);
  const captureRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (noTimeSections.length > 0) {
      setTimeout(() => {
        scrollContainerRef.current?.scrollTo({ top: scrollContainerRef.current.scrollHeight, behavior: "smooth" });
      }, 150);
    }
  }, [noTimeSections]);

  const [gyoSavePrompt, setGyoSavePrompt] = useState(false);
  const [gyoSaveName, setGyoSaveName] = useState("");
  const [pendingSaveCombo, setPendingSaveCombo] = useState<Section[] | null>(null);
  const [pendingSaveNoTime, setPendingSaveNoTime] = useState<NoTimeSection[] | null>(null);

  const [regModal, setRegModal] = useState<{ courses: { crseNo: string; name: string; credit: number }[] } | null>(null);
  const [regSaved, setRegSaved] = useState<{ crseNo: string; name: string; credit: number }[] | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const [profSteps, setProfSteps] = useState<ProfStep[]>([]);
  const [profStepIdx, setProfStepIdx] = useState(0);
  const profPickResults = useRef<Map<string, string>>(new Map());
  const afterPickRef = useRef<((picks: Map<string, string>) => void) | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const doFetch = useCallback(async () => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setLoading(true);
    setCombos([]);
    try {
      const res = await fetch(`/api/kyoshik?sem=${encodeURIComponent(sem)}`, {
        signal: abortRef.current.signal,
      });
      if (!res.ok) { alert("교직 과목 조회 실패"); return; }
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data:")) continue;
          const json = JSON.parse(line.slice(5).trim());
          if (json.type === "done") { setAllRows(json.rows ?? []); setFetched(true); }
          else if (json.type === "error") alert(json.message ?? "오류가 발생했습니다.");
        }
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.name !== "AbortError") alert("오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }, [sem]);

  useEffect(() => {
    setAllRows([]);
    setFetched(false);
    setCombos([]);
    setSelected(new Set());
    doFetch();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sem]);

  const allCourses = useMemo(() => {
    const seen = new Set<string>();
    const result: { code: string; name: string; credit: string }[] = [];
    for (const r of allRows) {
      if (!seen.has(r.code)) {
        seen.add(r.code);
        result.push({ code: r.code, name: r.name, credit: r.credit });
      }
    }
    return result;
  }, [allRows]);

  const MAX_SELECT = 6;
  const pinnedSlots = pinnedCombo?.flatMap((s) => s.times) ?? [];

  const openCodes = new Set(allRows.map((r) => r.code));
  const sanjuCodes = new Set(allRows.filter((r) => r.rmrk.includes("상주캠퍼스")).map((r) => r.code));
  const conflictCodes = new Set(
    fetched && pinnedSlots.length > 0
      ? [...openCodes].filter((code) => {
          const rows = allRows.filter((r) => {
            if (r.code !== code) return false;
            const isSanjuRow = r.rmrk.includes("상주캠퍼스");
            if (filterSangju === "include" && !isSanjuRow) return false;
            if (filterSangju === "exclude" && isSanjuRow) return false;
            return true;
          });
          if (rows.length === 0) return false;
          return rows.every((r) => {
            const sec = buildSectionGroups([r]).groups.flat()[0];
            return sec ? slotsOverlap(sec.times, pinnedSlots) : false;
          });
        })
      : []
  );

  const filteredList = useMemo(() => {
    const list = allCourses.filter((c) => {
      if (filterHideConflict && fetched && conflictCodes.has(c.code)) return false;
      if (filterSangju === "exclude" && fetched && sanjuCodes.has(c.code)) {
        const rows = allRows.filter((r) => r.code === c.code);
        if (rows.length > 0 && rows.every((r) => r.rmrk.includes("상주캠퍼스"))) return false;
      }
      if (filterSangju === "include" && fetched && !sanjuCodes.has(c.code)) return false;
      if (filterDayCombo && fetched) {
        const comboChars = new Set([...filterDayCombo]);
        const rows = allRows.filter((r) => r.code === c.code);
        const hasMatch = rows.some((r) => {
          const days = new Set(parseTimes(r.timeStr).map((s) => DAY_NAMES[s.day]));
          return [...comboChars].every((ch) => days.has(ch));
        });
        if (!hasMatch) return false;
      }
      if (search) {
        const q = search.toLowerCase();
        if (!c.name.toLowerCase().includes(q) && !c.code.toLowerCase().includes(q)) return false;
      }
      return true;
    }).sort((a, b) => a.name.localeCompare(b.name, "ko"));
    const sel = list.filter((c) => selected.has(c.code));
    const rest = list.filter((c) => !selected.has(c.code));
    return [...sel, ...rest];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allCourses, fetched, conflictCodes, filterHideConflict, filterSangju, sanjuCodes, filterDayCombo, allRows, search, selected]);

  useEffect(() => {
    if (allRows.length === 0 || selected.size === 0) { setCombos([]); setNoTimeSections([]); return; }
    const selectedRows = allRows.filter((r) => {
      if (!selected.has(r.code)) return false;
      const isSanjuRow = r.rmrk.includes("상주캠퍼스");
      if (filterSangju === "include" && !isSanjuRow) return false;
      if (filterSangju === "exclude" && isSanjuRow) return false;
      return true;
    });
    const { groups, noTimeSections: nts } = buildSectionGroups(selectedRows);
    setNoTimeSections(nts);

    const filteredGroups = pinnedSlots.length > 0
      ? groups.map((group) => group.filter((sec) => !slotsOverlap(sec.times, pinnedSlots))).filter((g) => g.length > 0)
      : groups;

    const pinnedCredit = (pinnedCombo ?? []).reduce((s, sec) => s + sec.credit, 0);
    let all: Section[][];
    if (maxCredit > 0 && pinnedCredit < maxCredit) {
      const allowedCredit = maxCredit - pinnedCredit;
      const groupCredits = filteredGroups.map((g) => g[0]?.credit ?? 0);
      const validSubsets: number[][] = [];
      const n = filteredGroups.length;
      for (let mask = 1; mask < (1 << n); mask++) {
        const indices: number[] = [];
        let creditSum = 0;
        for (let i = 0; i < n; i++) {
          if (mask & (1 << i)) { indices.push(i); creditSum += groupCredits[i]; }
        }
        if (creditSum <= allowedCredit) validSubsets.push(indices);
      }
      const seen = new Set<string>();
      const result: Section[][] = [];
      for (const indices of validSubsets) {
        const subGroups = indices.map((i) => filteredGroups[i]);
        for (const combo of generateCombos(subGroups)) {
          const key = combo.map((s) => `${s.crseNo}|${s.timeStr}`).sort().join(";");
          if (!seen.has(key)) { seen.add(key); result.push(combo); }
        }
      }
      all = result;
    } else {
      all = generateCombos(filteredGroups);
    }
    setCombos(all);
    setComboIdx(0);
    if (typeof window !== "undefined" && window.innerWidth < 768) setPanelOpen(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allRows, selected, pinnedCombo, maxCredit, filterSangju]);

  useEffect(() => { setComboIdx(0); }, [minKyoshikCredit]);

  const pinnedNoTimeCredit = (pinnedNoTimeSections ?? []).reduce((s, sec) => s + sec.credit, 0);
  const pinnedCredit = (pinnedCombo ?? []).reduce((s, sec) => s + sec.credit, 0) + pinnedNoTimeCredit;
  const visibleCombos = minKyoshikCredit > 0
    ? combos.filter((c) => {
        const kyoshik = c.reduce((s, sec) => s + sec.credit, 0);
        return pinnedCredit + kyoshik >= minKyoshikCredit;
      })
    : combos;
  const currentCombo = visibleCombos[comboIdx] ?? [];
  const displayCombo = [...(pinnedCombo ?? []), ...currentCombo];
  const kyoshikNoTimeCredit = noTimeSections.reduce((s, sec) => s + sec.credit, 0);
  const kyoshikCredit = currentCombo.reduce((s, sec) => s + sec.credit, 0) + kyoshikNoTimeCredit;
  const totalCredit = displayCombo.reduce((s, sec) => s + sec.credit, 0) + pinnedNoTimeCredit + kyoshikNoTimeCredit;

  const listSorted = useMemo(() => {
    const q = listSearch.toLowerCase();
    const filtered = allRows.filter((r) => {
      if (q && !r.name.toLowerCase().includes(q) && !r.prof.toLowerCase().includes(q) && !r.crseNo.toLowerCase().includes(q)) return false;
      return true;
    });
    if (!listSortState) return filtered;
    return [...filtered].sort((a, b) => {
      const col = listSortState.col as keyof Row;
      const av = a[col] ?? "";
      const bv = b[col] ?? "";
      const an = Number(av), bn = Number(bv);
      const cmp = !isNaN(an) && !isNaN(bn) ? an - bn : av.localeCompare(bv, "ko");
      return listSortState.dir === "asc" ? cmp : -cmp;
    });
  }, [allRows, listSearch, listSortState]);

  const doCapture = async (comboToCapture: Section[], pinnedForReg?: Section[], resolvedNoTime?: NoTimeSection[]) => {
    if (!captureRef.current) return;
    setSaving(true);
    try {
      // captureRef 안에 실제로 렌더된 combo (= visibleCombo) 기준으로 크롭
      const renderedCombo = [...(pinnedForReg ?? pinnedCombo ?? []), ...comboToCapture];
      const termLabel = semTerm === "s" ? "여름계절" : semTerm === "w" ? "겨울계절" : `${semTerm}학기`;
      const prefix = majorLabel ? `${majorLabel} ` : "";
      await captureTimetableImage({
        el: captureRef.current,
        combo: renderedCombo,
        fileName: `${prefix}${semYear}년 ${termLabel} 교직 시간표`,
      });
      trackSave({ event: "이미지 저장", majorLabel: majorLabel ?? "", extraMajorLabels, entryYear });

      const fullComboForReg = [...(pinnedForReg ?? pinnedCombo ?? []), ...comboToCapture];
      const noTimeForReg = resolvedNoTime ?? [...(pinnedNoTimeSections ?? []), ...noTimeSections];
      const courses = [
        ...fullComboForReg.map((s) => ({ crseNo: s.crseNo, name: s.name, credit: s.credit })),
        ...noTimeForReg.map((s) => ({ crseNo: s.crseNo, name: s.name, credit: s.credit })),
      ];
      setRegSaved(courses);
      setRegModal({ courses });
    } finally {
      setSaving(false);
    }
  };

  const [captureCombo, setCaptureCombo] = useState<Section[] | null>(null);
  const [capturedPinnedCombo, setCapturedPinnedCombo] = useState<Section[] | null>(null);
  const [captureNoTimeSections, setCaptureNoTimeSections] = useState<NoTimeSection[] | null>(null);
  const visibleCombo = captureCombo !== null
    ? [...(capturedPinnedCombo ?? pinnedCombo ?? []), ...captureCombo]
    : displayCombo;

  const handleProfSelect = (prof: string) => {
    const step = profSteps[profStepIdx];
    profPickResults.current.set(step.name, prof);
    advanceProfStep();
  };
  const handleProfSkip = () => { advanceProfStep(); };
  const advanceProfStep = () => {
    const nextIdx = profStepIdx + 1;
    if (nextIdx < profSteps.length) {
      setProfStepIdx(nextIdx);
    } else {
      const picks = new Map(profPickResults.current);
      setProfSteps([]);
      setProfStepIdx(0);
      afterPickRef.current?.(picks);
      afterPickRef.current = null;
    }
  };

  const saveAsImage = async () => {
    const fullComboForPick = [...(pinnedCombo ?? []), ...currentCombo];
    const allNoTime = [...(pinnedNoTimeSections ?? []), ...noTimeSections];
    const steps = [
      ...getMultiProfSections(fullComboForPick),
      ...getMultiProfNoTimeSections(allNoTime),
    ];
    if (steps.length === 0) { await doCapture(currentCombo); return; }
    profPickResults.current = new Map();
    setProfSteps(steps);
    setProfStepIdx(0);
    afterPickRef.current = async (picks) => {
      const resolvedPinned = applyProfPicks(pinnedCombo ?? [], picks);
      const resolvedKyoshik = applyProfPicks(currentCombo, picks);
      const resolvedNoTime = applyProfPicksNoTime(allNoTime, picks);
      setCaptureCombo(resolvedKyoshik);
      setCapturedPinnedCombo(resolvedPinned);
      setCaptureNoTimeSections(resolvedNoTime);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      await doCapture(resolvedKyoshik, resolvedPinned, resolvedNoTime);
      setCaptureCombo(null);
      setCapturedPinnedCombo(null);
      setCaptureNoTimeSections(null);
    };
  };

  const saveToLibrary = (defaultName: string) => {
    const fullComboForPick = [...(pinnedCombo ?? []), ...currentCombo];
    const allNoTime = [...(pinnedNoTimeSections ?? []), ...noTimeSections];
    const steps = [
      ...getMultiProfSections(fullComboForPick),
      ...getMultiProfNoTimeSections(allNoTime),
    ];
    if (steps.length === 0) {
      setPendingSaveCombo(currentCombo);
      setPendingSaveNoTime(null);
      setGyoSaveName(defaultName);
      setGyoSavePrompt(true);
      return;
    }
    profPickResults.current = new Map();
    setProfSteps(steps);
    setProfStepIdx(0);
    afterPickRef.current = (picks) => {
      const resolvedKyoshik = applyProfPicks(currentCombo, picks);
      const resolvedAllNoTime = applyProfPicksNoTime(allNoTime, picks);
      setPendingSaveCombo(resolvedKyoshik);
      setPendingSaveNoTime(resolvedAllNoTime);
      setGyoSaveName(defaultName);
      setGyoSavePrompt(true);
    };
  };

  return (
    <div className="flex flex-1 overflow-hidden relative">
      {profSteps.length > 0 && profStepIdx < profSteps.length && (
        <ProfPickerModal
          courseName={profSteps[profStepIdx].name}
          profs={profSteps[profStepIdx].profs}
          isNoTime={profSteps[profStepIdx].isNoTime}
          stepIdx={profStepIdx}
          totalSteps={profSteps.length}
          onSelect={handleProfSelect}
          onSkip={handleProfSkip}
        />
      )}

      {gyoSavePrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-xl shadow-xl px-6 py-5 flex flex-col gap-4 w-80 max-w-[90vw]">
            <p className="text-sm font-semibold text-gray-800">시간표 이름</p>
            <input autoFocus type="text" value={gyoSaveName} onChange={(e) => setGyoSaveName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && gyoSaveName.trim()) {
                  const pinnedNTLen = (pinnedNoTimeSections ?? []).length;
                  const kyoComboSaved = pendingSaveCombo ?? currentCombo;
                  const pinnedNTSaved = pendingSaveNoTime ? pendingSaveNoTime.slice(0, pinnedNTLen) : (pinnedNoTimeSections ?? []);
                  const kyoNTSaved = pendingSaveNoTime ? pendingSaveNoTime.slice(pinnedNTLen) : noTimeSections;
                  saveTimetable({ name: gyoSaveName.trim(), sem: `${semYear}-${semTerm}`, major: major ?? "", majorLabel: majorLabel ?? "", entryYear, extraMajorLabels, pinnedCombo: pinnedCombo ?? [], pinnedNoTimeSections: pinnedNTSaved, gyoyangCombo: kyoComboSaved, gyoyangNoTimeSections: kyoNTSaved });
                  trackSave({ event: "라이브러리 저장", majorLabel: majorLabel ?? "", extraMajorLabels, entryYear });
                  const savedCourses = [
                    ...[...(pinnedCombo ?? []), ...kyoComboSaved].map((s) => ({ crseNo: s.crseNo, name: s.name, credit: s.credit })),
                    ...[...pinnedNTSaved, ...kyoNTSaved].map((s) => ({ crseNo: s.crseNo, name: s.name, credit: s.credit })),
                  ];
                  setRegSaved(savedCourses);
                  setRegModal({ courses: savedCourses });
                  setGyoSavePrompt(false); setPendingSaveCombo(null); setPendingSaveNoTime(null);
                }
              }}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
            <div className="flex gap-2">
              <button onClick={() => { setGyoSavePrompt(false); setPendingSaveCombo(null); setPendingSaveNoTime(null); }} className="flex-1 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">취소</button>
              <button disabled={!gyoSaveName.trim()}
                onClick={() => {
                  const pinnedNTLen = (pinnedNoTimeSections ?? []).length;
                  const kyoComboSaved = pendingSaveCombo ?? currentCombo;
                  const pinnedNTSaved = pendingSaveNoTime ? pendingSaveNoTime.slice(0, pinnedNTLen) : (pinnedNoTimeSections ?? []);
                  const kyoNTSaved = pendingSaveNoTime ? pendingSaveNoTime.slice(pinnedNTLen) : noTimeSections;
                  saveTimetable({ name: gyoSaveName.trim(), sem: `${semYear}-${semTerm}`, major: major ?? "", majorLabel: majorLabel ?? "", entryYear, extraMajorLabels, pinnedCombo: pinnedCombo ?? [], pinnedNoTimeSections: pinnedNTSaved, gyoyangCombo: kyoComboSaved, gyoyangNoTimeSections: kyoNTSaved });
                  trackSave({ event: "라이브러리 저장", majorLabel: majorLabel ?? "", extraMajorLabels, entryYear });
                  const savedCourses = [
                    ...[...(pinnedCombo ?? []), ...kyoComboSaved].map((s) => ({ crseNo: s.crseNo, name: s.name, credit: s.credit })),
                    ...[...pinnedNTSaved, ...kyoNTSaved].map((s) => ({ crseNo: s.crseNo, name: s.name, credit: s.credit })),
                  ];
                  setRegSaved(savedCourses);
                  setRegModal({ courses: savedCourses });
                  setGyoSavePrompt(false); setPendingSaveCombo(null); setPendingSaveNoTime(null);
                }}
                className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg">
                저장
              </button>
            </div>
          </div>
        </div>
      )}

      {regModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl flex flex-col max-w-lg w-[92vw] max-h-[80vh]">
            <div className="px-6 pt-5 pb-3 border-b border-gray-100 flex items-center justify-between shrink-0">
              <div>
                <p className="text-base font-bold text-gray-800">수강신청 과목 목록</p>
                <p className="text-xs text-gray-400 mt-0.5">과목코드를 클립보드에 복사하세요</p>
              </div>
              <button onClick={() => { setRegModal(null); setCopiedCode(null); }} className="text-gray-400 hover:text-gray-600 text-xl px-1">✕</button>
            </div>
            <div className="overflow-y-auto flex-1 px-6 py-4 flex flex-col gap-2">
              {regModal.courses.map((c) => {
                const code = c.crseNo.replace(/-/g, "");
                const isCopied = copiedCode === code;
                return (
                  <div key={c.crseNo} className="flex items-center gap-3">
                    <button
                      onClick={() => { navigator.clipboard.writeText(code).then(() => { setCopiedCode(code); setTimeout(() => setCopiedCode(null), 2000); }); }}
                      className={`shrink-0 w-28 py-1.5 rounded-lg text-sm font-mono font-bold transition-all duration-200 ${isCopied ? "bg-green-500 text-white" : "bg-indigo-50 hover:bg-indigo-100 text-indigo-600 border border-indigo-200"}`}>
                      {isCopied ? "✓ 복사됨" : code}
                    </button>
                    <span className="text-base font-semibold text-gray-800 leading-tight">{c.name}</span>
                    <span className="text-xs text-gray-400 shrink-0 ml-auto">{c.credit}학점</span>
                  </div>
                );
              })}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 shrink-0 flex flex-col gap-2">
              <SugangLink />
              <p className="text-xs text-gray-400 text-center">실수로 닫아도 수강신청하기 버튼으로 다시 볼 수 있어요.</p>
              {onFeedbackClick && (
                <p className="text-xs text-center">
                  <button onClick={() => { setRegModal(null); setCopiedCode(null); onFeedbackClick(); }} className="text-indigo-500 hover:text-indigo-600 underline">피드백/응원 남기기 →</button>
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Left panel: 교직 과목 목록 */}
      <div className={`${panelOpen ? "w-80 max-w-full" : "w-0"} shrink-0 border-r border-gray-200 bg-white flex flex-col overflow-hidden transition-all duration-200 h-full`}>
        <div className="px-3 pt-3 pb-2 shrink-0 flex items-center gap-2 border-b border-gray-100">
          <button onClick={() => setPanelOpen(false)} className="shrink-0 text-gray-400 hover:text-gray-700 text-base leading-none px-1" title="패널 닫기">←</button>
          <span className="text-sm font-medium text-gray-700 flex-1">교직 과목</span>
          {loading && <span className="text-gray-400 text-xs animate-pulse shrink-0">불러오는 중...</span>}
          {fetched && !loading && (
            <span className="text-xs text-gray-400 shrink-0">{allCourses.length}과목</span>
          )}
        </div>

        <div className="px-3 py-2 shrink-0 flex flex-col gap-1.5 border-b border-gray-100">
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="과목명 검색..."
            className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
          />
          <div className="flex items-center justify-between">
            <button onClick={() => setFilterPanelOpen((v) => !v)}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 w-fit">
              <span>{filterPanelOpen ? "▾" : "▸"}</span>
              <span>필터</span>
              {(!filterHideConflict || filterSangju !== "exclude" || filterDayCombo || maxCredit > 0 || minKyoshikCredit > 0) && (
                <span className="ml-1 text-indigo-500">●</span>
              )}
            </button>
            <div className="flex gap-2 items-center">
              {fetched && (
                <span className="text-xs text-gray-400">{filteredList.length}과목</span>
              )}
              <span className={`text-xs ${selected.size >= MAX_SELECT ? "text-red-500 font-bold" : "text-gray-400"}`}>
                {selected.size}/{MAX_SELECT}
              </span>
              {selected.size > 0 && (
                <button onClick={() => setSelected(new Set())} className="text-xs text-gray-400 hover:text-red-500">해제</button>
              )}
            </div>
          </div>
          {filterPanelOpen && (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                <label className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer">
                  <input type="checkbox" checked={filterHideConflict} onChange={(e) => setFilterHideConflict(e.target.checked)} />
                  시간불가 숨기기
                </label>
                <label className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer">
                  <input type="checkbox" checked={filterSangju === "exclude"} onChange={(e) => setFilterSangju(e.target.checked ? "exclude" : "all")} />
                  상주제외
                </label>
                <label className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer">
                  <input type="checkbox" checked={filterSangju === "include"} onChange={(e) => setFilterSangju(e.target.checked ? "include" : "all")} />
                  상주만
                </label>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-600 shrink-0">요일 조합</label>
                <select value={filterDayCombo} onChange={(e) => setFilterDayCombo(e.target.value)}
                  className="flex-1 border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400">
                  <option value="">전체</option>
                  {["월","화","수","목","금","토","월화","월수","월목","월금","월토","화수","화목","화금","화토","수목","수금","수토","목금","목토","금토"].map((combo) => (
                    <option key={combo} value={combo}>{combo}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-600 shrink-0">최대 학점</label>
                <select value={maxCredit} onChange={(e) => setMaxCredit(Number(e.target.value))}
                  className="flex-1 border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400">
                  <option value={0}>제한 없음</option>
                  {Array.from({ length: 16 }, (_, i) => i + 12).map((v) => (
                    <option key={v} value={v}>{v}학점</option>
                  ))}
                </select>
                {maxCredit > 0 && (
                  <span className="text-xs text-gray-400 shrink-0">
                    전공+교양 {(pinnedCombo ?? []).reduce((s, sec) => s + sec.credit, 0)}학점
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-600 shrink-0">전체 최소</label>
                <select value={minKyoshikCredit} onChange={(e) => setMinKyoshikCredit(Number(e.target.value))}
                  className="flex-1 border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400">
                  <option value={0}>제한 없음</option>
                  {Array.from({ length: 17 }, (_, i) => i + 9).map((v) => (
                    <option key={v} value={v}>{v}학점 이상</option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>

        <div className="overflow-y-auto px-2 py-1 flex-1 min-h-0">
          {!fetched ? (
            <p className="text-xs text-gray-400 text-center py-8">{loading ? "교직 과목 불러오는 중..." : ""}</p>
          ) : filteredList.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-8">검색 결과 없음</p>
          ) : (
            filteredList.map((c) => {
              const isSelected = selected.has(c.code);
              const disabled = !isSelected && selected.size >= MAX_SELECT;
              const courseRows = allRows.filter((r) => r.code === c.code);
              const isExpanded = expandedCodes.has(c.code);

              // 요일 패턴 + conflict 여부
              const dayPatterns: { pattern: string; ok: boolean }[] = [];
              if (fetched) {
                const seen = new Map<string, boolean>();
                for (const r of courseRows) {
                  if (!r.timeStr) continue;
                  const days = new Set<number>();
                  for (const s of parseTimes(r.timeStr)) days.add(s.day);
                  const pattern = [...days].sort((a, b) => a - b).map((d) => DAY_NAMES[d]).join("");
                  if (!pattern) continue;
                  const sec = buildSectionGroups([r]).groups.flat()[0];
                  const conflict = sec ? slotsOverlap(sec.times, pinnedSlots) : false;
                  if (!seen.has(pattern)) seen.set(pattern, !conflict);
                  else if (!conflict) seen.set(pattern, true);
                }
                for (const [pattern, ok] of seen) dayPatterns.push({ pattern, ok });
              }

              return (
                <div key={c.code} className={`mb-1 rounded ${isSelected ? "bg-indigo-50" : ""}`}>
                  <label className={`flex items-start gap-2 px-1 pt-1 pb-0.5 rounded ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer hover:bg-gray-50"} ${isSelected ? "hover:bg-indigo-100" : ""}`}>
                    <input type="checkbox" checked={isSelected} disabled={disabled}
                      onChange={(e) => {
                        if (e.target.checked && selected.size >= MAX_SELECT) return;
                        const next = new Set(selected);
                        e.target.checked ? next.add(c.code) : next.delete(c.code);
                        setSelected(next);
                        setExpandedCodes((prev) => {
                          const nextExp = new Set(prev);
                          e.target.checked ? nextExp.add(c.code) : nextExp.delete(c.code);
                          return nextExp;
                        });
                      }}
                      className="mt-0.5 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-700 leading-tight">{c.name}</p>
                      <p className="text-xs text-gray-400">{c.code} · {c.credit}학점
                        {fetched && sanjuCodes.has(c.code) && <span className="ml-1 text-slate-500">상주</span>}
                      </p>
                      {fetched && dayPatterns.length > 0 && (
                        <p className="text-xs mt-0.5">
                          {dayPatterns.map(({ pattern, ok }, i) => (
                            <span key={pattern}>
                              {i > 0 && <span className="text-gray-400">/</span>}
                              <span className={ok ? "text-green-600" : "text-red-400"}>{pattern}</span>
                            </span>
                          ))}
                        </p>
                      )}
                    </div>
                    {courseRows.length > 0 && (
                      <button type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          const next = new Set(expandedCodes);
                          next.has(c.code) ? next.delete(c.code) : next.add(c.code);
                          setExpandedCodes(next);
                        }}
                        className="text-xs text-gray-400 hover:text-gray-600 shrink-0 px-1">
                        {isExpanded ? "▲" : "▼"}
                      </button>
                    )}
                  </label>
                  {isExpanded && courseRows.length > 0 && (
                    <div className="ml-6 mb-1 flex flex-col gap-0.5">
                      {courseRows.map((r, idx) => {
                        const sec = buildSectionGroups([r]).groups.flat()[0];
                        const conflict = sec ? slotsOverlap(sec.times, pinnedSlots) : false;
                        const isSanjuRow = r.rmrk.includes("상주캠퍼스");
                        const sanjuBlocked = fetched && (
                          (filterSangju === "include" && !isSanjuRow) ||
                          (filterSangju === "exclude" && isSanjuRow)
                        );
                        const timeStr = r.timeStr ? formatTimeStr(r.timeStr) : "";
                        const prof = r.prof || "미정";
                        const rowClass = conflict ? "text-red-400 bg-red-50" : sanjuBlocked ? "text-orange-500 bg-orange-50" : "text-green-700 bg-green-50";
                        const subClass = conflict ? "text-red-300" : sanjuBlocked ? "text-orange-400" : "text-green-600";
                        const mark = conflict || sanjuBlocked ? "✗" : "✓";
                        return (
                          <div key={idx} className={`text-xs px-1.5 py-0.5 rounded ${rowClass}`}>
                            <span className={(conflict || sanjuBlocked) ? "line-through" : ""}>{mark} {prof}</span>
                            {isSanjuRow && <span className="ml-1 text-slate-500">상주</span>}
                            {timeStr && <span className={`block pl-3 ${subClass}`}>{timeStr}</span>}
                            {r.location && <span className="block pl-3 text-gray-500">{r.location}</span>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
        {fetched && selected.size > 0 && combos.length > 0 && (
          <p className="text-xs text-gray-500 text-center pb-2">
            조합 {visibleCombos.length}개{minKyoshikCredit > 0 && combos.length !== visibleCombos.length ? ` / 전체 ${combos.length}개` : ""}
          </p>
        )}
      </div>

      {/* Right area */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0 min-h-0">
        {/* 오른쪽 상단 탭바 */}
        <div className="flex items-center gap-2 px-4 pt-3 pb-0 shrink-0 border-b border-gray-200 bg-white">
          {!panelOpen && (
            <button onClick={() => setPanelOpen(true)}
              className="self-start flex items-center gap-1 text-xs font-semibold text-indigo-600 bg-indigo-50 border border-indigo-300 rounded-lg px-3 py-1.5 hover:bg-indigo-100 mr-2 shrink-0 transition-colors">
              ▶ 과목 선택
            </button>
          )}
          {(["timetable", "list"] as const).map((t) => (
            <button key={t} onClick={() => setLeftTab(t)}
              className={`pb-2 px-1 text-sm border-b-2 transition-colors ${leftTab === t ? "border-indigo-500 text-indigo-600 font-semibold" : "border-transparent text-gray-400 hover:text-gray-600"}`}>
              {t === "timetable" ? "시간표" : "전체 목록"}
            </button>
          ))}
        </div>

        {/* 시간표 뷰 */}
        {leftTab === "timetable" && (
          <div className="flex-1 flex flex-col overflow-hidden p-4 gap-2 min-h-0">
            {visibleCombos.length > 0 ? (
              <>
                <div className="flex items-center gap-3 flex-wrap shrink-0">
                  <button onClick={() => { if (slideTimerRef.current) clearTimeout(slideTimerRef.current); setSlideOutCombo([...visibleCombo]); setSlideDir("right"); setNavTick((t) => t + 1); setComboIdx((i) => (i - 1 + visibleCombos.length) % visibleCombos.length); slideTimerRef.current = setTimeout(() => setSlideOutCombo(null), 280); }} className="px-3 py-1 border border-gray-300 rounded hover:bg-gray-50 text-sm">◀</button>
                  <span className="text-sm text-gray-600 w-24 text-center">{comboIdx + 1} / {visibleCombos.length}</span>
                  <button onClick={() => { if (slideTimerRef.current) clearTimeout(slideTimerRef.current); setSlideOutCombo([...visibleCombo]); setSlideDir("left"); setNavTick((t) => t + 1); setComboIdx((i) => (i + 1) % visibleCombos.length); slideTimerRef.current = setTimeout(() => setSlideOutCombo(null), 280); }} className="px-3 py-1 border border-gray-300 rounded hover:bg-gray-50 text-sm">▶</button>
                  <span className="text-sm font-semibold text-indigo-600">
                    총 {totalCredit}학점 <span className="text-gray-400 font-normal text-xs">(전공+교양 {pinnedCredit} + 교직 {kyoshikCredit})</span>
                  </span>
                </div>
                <div className="flex-1 min-h-0 relative overflow-hidden">
                  {slideOutCombo !== null && (
                    <div className={`absolute inset-0 overflow-auto pointer-events-none ${slideDir === "left" ? "slide-out-to-left" : "slide-out-to-right"}`}>
                      <TimetableGrid combo={slideOutCombo} />
                    </div>
                  )}
                  <div ref={(el) => { scrollContainerRef.current = el; }} className={`absolute inset-0 overflow-auto ${slideOutCombo !== null ? (slideDir === "left" ? "slide-in-from-right" : "slide-in-from-left") : ""}`}>
                    <div ref={captureRef}>
                      <TimetableGrid key={navTick} ref={timetableRef} combo={visibleCombo} />
                      {((pinnedNoTimeSections?.length ?? 0) > 0 || noTimeSections.length > 0) && (
                        <div className="border border-orange-200 bg-orange-50 rounded-lg px-4 py-3 flex flex-wrap gap-x-4 gap-y-2 mt-2">
                          <span className="text-sm font-semibold text-orange-600 w-full">시간 외</span>
                          {(captureNoTimeSections ?? [...(pinnedNoTimeSections ?? []), ...noTimeSections]).map((s) => (
                            <span key={s.crseNo} className="text-sm text-orange-700">{s.name}{s.profs?.length === 1 && <span className="text-orange-500"> · {s.profs[0]}</span>} <span className="text-orange-400 text-xs">({s.credit}학점)</span></span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div ref={(el) => { scrollContainerRef.current = el; }} className="flex-1 overflow-auto min-h-0">
                  <div ref={captureRef}>
                    {pinnedCombo && pinnedCombo.length > 0 && (
                      <TimetableGrid ref={timetableRef} combo={pinnedCombo} />
                    )}
                    {((pinnedNoTimeSections?.length ?? 0) > 0 || noTimeSections.length > 0) && (
                      <div className="border border-orange-200 bg-orange-50 rounded-lg px-4 py-3 flex flex-wrap gap-x-4 gap-y-2 mt-2">
                        <span className="text-sm font-semibold text-orange-600 w-full">시간 외</span>
                        {(captureNoTimeSections ?? [...(pinnedNoTimeSections ?? []), ...noTimeSections]).map((s) => (
                          <span key={s.crseNo} className="text-sm text-orange-700">{s.name}{s.profs?.length === 1 && <span className="text-orange-500"> · {s.profs[0]}</span>} <span className="text-orange-400 text-xs">({s.credit}학점)</span></span>
                        ))}
                      </div>
                    )}
                  </div>
                  {(!pinnedCombo || pinnedCombo.length === 0) && !noTimeSections.length && !(pinnedNoTimeSections?.length) && (
                    <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                      {!fetched ? "교직 과목 불러오는 중..." : combos.length > 0 ? "최소 학점 조건을 만족하는 조합이 없습니다" : "왼쪽에서 교직 과목을 선택하세요"}
                    </div>
                  )}
                </div>
              </>
            )}
            <div className="shrink-0 pt-1 flex gap-2">
              <button onClick={saveAsImage} disabled={saving || (!currentCombo.length && !pinnedCombo?.length && !noTimeSections.length)}
                className="flex-1 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors">
                {saving ? "저장 중..." : "이미지 저장"}
              </button>
              <button
                onClick={() => {
                  const termLabel = semTerm === "s" ? "여름" : semTerm === "w" ? "겨울" : `${semTerm}학기`;
                  const majorPart = majorLabel2 ? `${majorLabel ?? ""}·${majorLabel2}` : (majorLabel ?? "");
                  saveToLibrary(`${majorPart} ${semYear}년 ${termLabel} 교직 시간표`.trim());
                }}
                disabled={!pinnedCombo?.length && !currentCombo.length && !noTimeSections.length}
                className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors">
                라이브러리에 저장
              </button>
            </div>
            {regSaved && (
              <button onClick={() => setRegModal({ courses: regSaved })}
                className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition-colors">
                수강신청하기
              </button>
            )}
          </div>
        )}

        {/* 전체 목록 뷰 */}
        {leftTab === "list" && (() => {
          const LIST_COLS: { key: keyof Row; label: string }[] = [
            { key: "crseNo",   label: "강좌번호" },
            { key: "name",     label: "교과목명" },
            { key: "credit",   label: "학점" },
            { key: "dept",     label: "개설학과" },
            { key: "prof",     label: "담당교수" },
            { key: "timeStr",  label: "강의시간" },
            { key: "location", label: "강의실" },
            { key: "rmrk",    label: "비고" },
          ];
          const toggleListSort = (col: keyof Row) => {
            setListSortState((prev) => {
              if (!prev || prev.col !== col) return { col, dir: "asc" };
              if (prev.dir === "asc") return { col, dir: "desc" };
              return null;
            });
          };
          return (
            <div className="flex-1 flex flex-col overflow-hidden min-h-0">
              <div className="px-4 py-2 shrink-0 flex gap-2 flex-wrap items-center border-b border-gray-100">
                <input
                  type="text" value={listSearch} onChange={(e) => setListSearch(e.target.value)}
                  placeholder="과목명·교수·강좌번호 검색..."
                  className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 w-60"
                />
                {fetched && <span className="text-xs text-gray-400 ml-auto">{listSorted.length}건</span>}
              </div>
              <div className="flex-1 overflow-auto border border-gray-200 rounded-none bg-white min-h-0">
                {!fetched ? (
                  <p className="text-sm text-gray-400 text-center py-16">{loading ? "불러오는 중..." : "조회 후 표시됩니다"}</p>
                ) : listSorted.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-16">검색 결과 없음</p>
                ) : (
                  <table className="text-sm w-full border-collapse min-w-max">
                    <thead className="sticky top-0 bg-gray-50 z-10">
                      <tr>
                        {LIST_COLS.map((c) => (
                          <th key={c.key} onClick={() => toggleListSort(c.key)}
                            className="text-left px-2 py-2 font-semibold text-gray-600 border-b border-gray-200 cursor-pointer select-none whitespace-nowrap hover:bg-gray-100">
                            {c.label}
                            {listSortState?.col === c.key ? (listSortState.dir === "asc" ? " ▲" : " ▼") : ""}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {listSorted.map((r, i) => (
                        <tr key={i} className={`border-b border-gray-100 hover:bg-indigo-50 transition-colors ${i % 2 === 0 ? "bg-white" : "bg-gray-50/60"}`}>
                          <td className="px-1.5 py-1.5 whitespace-nowrap text-gray-400 text-xs">{r.crseNo}</td>
                          <td className="px-2 py-1.5 text-gray-700 max-w-44">
                            <div className="truncate" title={r.name}>{r.name}</div>
                          </td>
                          <td className="px-1.5 py-1.5 text-center whitespace-nowrap text-gray-500 text-xs">{r.credit.split("-")[0]}</td>
                          <td className="px-2 py-1.5 text-gray-700 max-w-24">
                            <div className="truncate" title={r.dept}>{r.dept}</div>
                          </td>
                          <td className="px-2 py-1.5 text-gray-700 max-w-20">
                            <div className="truncate" title={r.prof}>{r.prof}</div>
                          </td>
                          <td className="px-2 py-1.5 text-gray-700 text-xs">
                            {(formatTimeStr(r.timeStr) || r.timeStr || "").split(",").map((t) => t.trim()).filter(Boolean).map((t, idx) => <div key={idx} className="whitespace-nowrap">{t}</div>)}
                          </td>
                          <td className="px-2 py-1.5 text-gray-700 text-xs">
                            {r.location ? r.location.split("\n").map((line, idx) => <div key={idx} className="whitespace-nowrap">{line}</div>) : ""}
                          </td>
                          <td className="px-1.5 py-1.5 text-gray-400 text-xs max-w-20">
                            <div className="truncate" title={r.rmrk}>{r.rmrk}</div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
