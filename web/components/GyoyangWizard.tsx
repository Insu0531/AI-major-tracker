"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { buildSectionGroups, generateCombos, parseTimes, Section, SectionGroup, TimeSlot, NoTimeSection } from "@/lib/timetable";
import { captureTimetableImage } from "@/lib/captureTimetable";
import TimetableGrid from "@/components/TimetableGrid";
import ProfPickerModal, { ProfStep, getMultiProfSections, applyProfPicks, getMultiProfNoTimeSections, applyProfPicksNoTime } from "@/components/ProfPickerModal";
import GYOYANG_LIST from "@/lib/gyoyang.json";
import { saveTimetable } from "@/lib/timetableStorage";

type GyoyangCourse = { code: string; name: string; credit: string; sdg: boolean; hmnts: boolean };
const ALL_COURSES: GyoyangCourse[] = GYOYANG_LIST as GyoyangCourse[];
const MAX_SELECT = 6;

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
  // 같은 요일끼리 묶어서 연속 슬롯 병합
  const byDay = new Map<number, { start: number; end: number }[]>();
  for (const s of slots) {
    if (!byDay.has(s.day)) byDay.set(s.day, []);
    byDay.get(s.day)!.push({ start: s.start, end: s.end });
  }
  const parts: string[] = [];
  for (const [day, segs] of [...byDay.entries()].sort((a, b) => a[0] - b[0])) {
    segs.sort((a, b) => a.start - b.start);
    // 연속 슬롯 병합
    const merged: { start: number; end: number }[] = [];
    for (const seg of segs) {
      if (merged.length && seg.start <= merged[merged.length - 1].end) {
        merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, seg.end);
      } else {
        merged.push({ ...seg });
      }
    }
    for (const m of merged) {
      parts.push(`${DAY_NAMES[day]} ${fmt(m.start)}~${fmt(m.end)}`);
    }
  }
  return parts.join(", ");
}
// 각 timeStr을 요일 조합으로 변환 후 중복 제거해 "월목/화금" 형태로 반환
function summarizeDays(timeStrs: string[]): string {
  const patterns = new Set<string>();
  for (const ts of timeStrs) {
    const days = new Set<number>();
    for (const s of parseTimes(ts)) days.add(s.day);
    const pattern = [...days].sort((a, b) => a - b).map((d) => DAY_NAMES[d]).join("");
    if (pattern) patterns.add(pattern);
  }
  return [...patterns].join("/");
}

export default function GyoyangWizard({ pinnedCombo, pinnedNoTimeSections, initialSem, majorLabel, majorLabel2, major, onFeedbackClick, onGoToKyoshik }: { pinnedCombo: Section[] | null; pinnedNoTimeSections?: NoTimeSection[]; initialSem?: string; majorLabel?: string; majorLabel2?: string; major?: string; onFeedbackClick?: () => void; onGoToKyoshik?: (combo: Section[], noTimeSections: NoTimeSection[]) => void }) {
  const [semYear, setSemYear] = useState(() => initialSem?.split("-")[0] ?? "2026");
  const [semTerm, setSemTerm] = useState(() => initialSem?.split("-")[1] ?? "1");
  const sem = `${semYear}-${semTerm}`;

  // 검색/필터
  const [search, setSearch] = useState("");
  const [filterSdg, setFilterSdg] = useState(false);
  const [filterHmnts, setFilterHmnts] = useState(false);
  const [filterSuEval, setFilterSuEval] = useState(false);
  const [filterRemote, setFilterRemote] = useState(false);
  const [filterIlban, setFilterIlban] = useState(false);
  const [filterHideConflict, setFilterHideConflict] = useState(true);
  const [filterSangju, setFilterSangju] = useState<"exclude" | "include" | "all">("exclude");
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);

  const isSangju = majorLabel?.startsWith("[상주]") ?? false;
  // 상주 모드 변경 시 필터 기본값 리셋
  useEffect(() => {
    setFilterSangju(isSangju ? "include" : "exclude");
    setSelected(new Set());
    setExpandedCodes(new Set());
  }, [isSangju]);
  const [filterDayOff, setFilterDayOff] = useState<Set<number>>(new Set());
  const [filterDayCombo, setFilterDayCombo] = useState<string>("");
  const [sortAsc, setSortAsc] = useState(true);

  // 선택된 교양 과목 코드 목록
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // 시간 상세 펼쳐진 과목 코드 목록
  const [expandedCodes, setExpandedCodes] = useState<Set<string>>(new Set());

  // 전체 조회 결과 (학기 전체 교양)
  const [allRows, setAllRows] = useState<Row[]>([]);
  const effectiveRows = allRows; // 상주 필터는 filteredList/filteredSangju 로 처리
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);

  // 조합
  const [combos, setCombos] = useState<Section[][]>([]);
  const [filteredCombos, setFilteredCombos] = useState<Section[][]>([]);
  const [comboIdx, setComboIdx] = useState(0);
  const [panelOpen, setPanelOpen] = useState(() => typeof window !== "undefined" && window.innerWidth >= 768);
  const [leftTab, setLeftTab] = useState<"timetable" | "list">("timetable");
  const [listSearch, setListSearch] = useState("");
  const [listSortState, setListSortState] = useState<{ col: keyof Row; dir: "asc" | "desc" } | null>(null);
  const [maxCredit, setMaxCredit] = useState(0); // 0 = 제한 없음
  const [minGyoyangCredit, setMinGyoyangCredit] = useState(0); // 0 = 제한 없음
  const [noTimeSections, setNoTimeSections] = useState<NoTimeSection[]>([]);
  const [flashKey, setFlashKey] = useState(0);
  const [slideDir, setSlideDir] = useState<"left" | "right">("left");
  const [panelTab, setPanelTab] = useState<"courses" | "filter">("courses");
  const [gyoDayOff, setGyoDayOff] = useState<Set<number>>(new Set());
  const [gyoNoMorning, setGyoNoMorning] = useState("");
  const [gyoNoEvening, setGyoNoEvening] = useState("");
  const [gyoFilterMap, setGyoFilterMap] = useState<Map<string, true | string>>(new Map());
  const [gyoExcludeProfs, setGyoExcludeProfs] = useState<Set<string>>(new Set());
  const [gyoIncludeProfs, setGyoIncludeProfs] = useState<Set<string>>(new Set());
  const [gyoProfSearch, setGyoProfSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const timetableRef = useRef<HTMLDivElement | null>(null);
  const captureRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  // 시간 외 추가 시 자동 스크롤
  useEffect(() => {
    if (noTimeSections.length > 0) {
      setTimeout(() => {
        scrollContainerRef.current?.scrollTo({ top: scrollContainerRef.current.scrollHeight, behavior: "smooth" });
      }, 150);
    }
  }, [noTimeSections]);

  // 이미지 저장 후 토스트
  const [saveToast, setSaveToast] = useState(false);
  const [kyoshikTip, setKyoshikTip] = useState(false);
  const saveToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 시간표 저장
  const [gyoSavePrompt, setGyoSavePrompt] = useState(false);
  const [gyoSaveName, setGyoSaveName] = useState("");
  const [pendingSaveCombo, setPendingSaveCombo] = useState<Section[] | null>(null);
  const [pendingSaveNoTime, setPendingSaveNoTime] = useState<NoTimeSection[] | null>(null);

  // 수강신청 팝업
  const [regModal, setRegModal] = useState<{ courses: { crseNo: string; name: string; credit: number }[] } | null>(null);
  const [regSaved, setRegSaved] = useState<{ crseNo: string; name: string; credit: number }[] | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // 교수 선택 팝업 상태
  const [profSteps, setProfSteps] = useState<ProfStep[]>([]);
  const [profStepIdx, setProfStepIdx] = useState(0);
  // 선택된 교수 map: courseName → prof (undefined = 선택 안 함/건너뜀)
  const profPickResults = useRef<Map<string, string>>(new Map());
  // 팝업 완료 후 실행할 콜백
  const afterPickRef = useRef<((picks: Map<string, string>) => void) | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const doFetch = useCallback(async () => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setLoading(true);
    setCombos([]);

    try {
      const res = await fetch(`/api/gyoyang?sem=${encodeURIComponent(sem)}`, {
        signal: abortRef.current.signal,
      });
      if (!res.ok) { alert("조회 실패"); return; }

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
          if (json.type === "done") {
            setAllRows(json.rows ?? []);
            setFetched(true);
          } else if (json.type === "error") {
            alert(json.message ?? "오류가 발생했습니다.");
          }
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

  // 일반선택 과목은 gyoyang.json에 없으므로 effectiveRows에서 동적으로 보완
  const allCourses = useMemo(() => {
    const known = new Set(ALL_COURSES.map((c) => c.code));
    const seen = new Set<string>();
    const extras: GyoyangCourse[] = [];
    for (const r of effectiveRows) {
      if (!known.has(r.code) && !seen.has(r.code)) {
        seen.add(r.code);
        extras.push({ code: r.code, name: r.name, credit: r.credit, sdg: false, hmnts: false });
      }
    }
    return [...ALL_COURSES, ...extras];
  }, [effectiveRows]);

  const openCodes = new Set(effectiveRows.map((r) => r.code));
  const suEvalCodes = new Set(effectiveRows.filter((r) => r.rmrk.includes("SU평가")).map((r) => r.code));
  const remoteCodes = new Set(effectiveRows.filter((r) => r.rmrk.includes("원격강좌")).map((r) => r.code));
  const sanjuCodes = new Set(effectiveRows.filter((r) => r.rmrk.includes("상주캠퍼스")).map((r) => r.code));

  const pinnedSlots = pinnedCombo?.flatMap((s) => s.times) ?? [];
  const conflictCodes = new Set(
    fetched && pinnedSlots.length > 0
      ? [...openCodes].filter((code) => {
          const rows = effectiveRows.filter((r) => {
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
      if (fetched && !openCodes.has(c.code)) return false;
      if (filterHideConflict && fetched && conflictCodes.has(c.code)) return false;
      if (filterSdg && !c.sdg) return false;
      if (filterHmnts && !c.hmnts) return false;
      if (filterSuEval && fetched && !suEvalCodes.has(c.code)) return false;
      if (filterRemote && fetched && !remoteCodes.has(c.code)) return false;
      if (filterIlban && c.code.startsWith("CLTR")) return false;
      if (filterSangju === "exclude" && fetched && sanjuCodes.has(c.code)) {
        const rows = effectiveRows.filter((r) => r.code === c.code);
        if (rows.length > 0 && rows.every((r) => r.rmrk.includes("상주캠퍼스"))) return false;
      }
      if (filterSangju === "include" && fetched && !sanjuCodes.has(c.code)) return false;
      if (filterDayOff.size > 0 && fetched) {
        const rows = effectiveRows.filter((r) => r.code === c.code);
        const hasMatchingSection = rows.some((r) => {
          const slots = parseTimes(r.timeStr);
          return slots.some((s) => filterDayOff.has(s.day));
        });
        if (!hasMatchingSection) return false;
      }
      if (filterDayCombo && fetched) {
        const comboChars = new Set([...filterDayCombo]);
        const rows = effectiveRows.filter((r) => r.code === c.code);
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
    }).sort((a, b) => {
      const cmp = a.name.localeCompare(b.name, "ko");
      return sortAsc ? cmp : -cmp;
    });
    // 선택된 항목을 현재 순서 그대로 맨 위로 고정, 나머지는 아래
    const sel = list.filter((c) => selected.has(c.code));
    const rest = list.filter((c) => !selected.has(c.code));
    return [...sel, ...rest];
  }, [allCourses, fetched, openCodes, conflictCodes, filterSdg, filterHmnts, filterSuEval, filterRemote, filterIlban, filterHideConflict, filterSangju, suEvalCodes, remoteCodes, sanjuCodes, filterDayOff, filterDayCombo, effectiveRows, search, sortAsc, selected]);

  useEffect(() => {
    if (effectiveRows.length === 0 || selected.size === 0) { setCombos([]); setNoTimeSections([]); return; }

    const selectedRows = effectiveRows.filter((r) => {
      if (!selected.has(r.code)) return false;
      const isSanjuRow = r.rmrk.includes("상주캠퍼스");
      if (filterSangju === "include" && !isSanjuRow) return false;
      if (filterSangju === "exclude" && isSanjuRow) return false;
      return true;
    });
    const { groups, noTimeSections: nts } = buildSectionGroups(selectedRows);
    setNoTimeSections(nts);

    const pinnedSlots = pinnedCombo?.flatMap((s) => s.times) ?? [];
    const filteredGroups = pinnedSlots.length > 0
      ? groups.map((group) => group.filter((sec) => !slotsOverlap(sec.times, pinnedSlots))).filter((g) => g.length > 0)
      : groups;

    const pinnedCredit = (pinnedCombo ?? []).reduce((s, sec) => s + sec.credit, 0);

    let all: Section[][];
    if (maxCredit > 0 && pinnedCredit < maxCredit) {
      // 허용 교양 학점
      const allowedCredit = maxCredit - pinnedCredit;
      // 교양 group별 학점 (각 group의 첫 section 기준)
      const groupCredits = filteredGroups.map((g) => g[0]?.credit ?? 0);
      // 부분집합 인덱스 열거 (학점 합계 <= allowedCredit인 것만)
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
      // 각 부분집합에 대해 generateCombos 실행 후 합산
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
    setFlashKey((k) => k + 1);
    if (typeof window !== "undefined" && window.innerWidth < 768) setPanelOpen(false);
  }, [effectiveRows, selected, pinnedCombo, maxCredit, filterSangju]);

  useEffect(() => { setComboIdx(0); }, [minGyoyangCredit]);

  useEffect(() => {
    if (combos.length === 0) { setFilteredCombos([]); return; }
    const required = [...gyoFilterMap.entries()];
    const morningLimit = parseInt(gyoNoMorning);
    const eveningLimit = parseInt(gyoNoEvening);
    setFilteredCombos(
      combos.filter((combo) => {
        if (required.length && !required.every(([name, prof]) =>
          combo.some((sec) => sec.name === name && (prof === true || sec.profs.includes(prof as string)))
        )) return false;
        if (gyoExcludeProfs.size > 0 && combo.some((sec) => sec.profs.some((p) => gyoExcludeProfs.has(p)))) return false;
        if (gyoIncludeProfs.size > 0 && ![...gyoIncludeProfs].every((p) => combo.some((sec) => sec.profs.includes(p)))) return false;
        const allSlots = combo.flatMap((sec) => sec.times);
        if (gyoDayOff.size > 0) {
          const usedDays = new Set(allSlots.map((t) => t.day));
          if ([...gyoDayOff].some((d) => usedDays.has(d))) return false;
        }
        if (!isNaN(morningLimit) && morningLimit > 0 && allSlots.some((t) => t.start < morningLimit)) return false;
        if (!isNaN(eveningLimit) && eveningLimit > 0 && allSlots.some((t) => t.end > eveningLimit)) return false;
        return true;
      })
    );
    setComboIdx(0);
  }, [combos, gyoFilterMap, gyoDayOff, gyoNoMorning, gyoNoEvening, gyoExcludeProfs, gyoIncludeProfs]);

  const pinnedNoTimeCredit = (pinnedNoTimeSections ?? []).reduce((s, sec) => s + sec.credit, 0);
  const pinnedCredit = (pinnedCombo ?? []).reduce((s, sec) => s + sec.credit, 0) + pinnedNoTimeCredit;
  // 전체 학점(전공+교양) 기준 필터
  const visibleCombos = minGyoyangCredit > 0
    ? filteredCombos.filter((c) => {
        const gyoyang = c.reduce((s, sec) => s + sec.credit, 0);
        return pinnedCredit + gyoyang >= minGyoyangCredit;
      })
    : filteredCombos;
  const currentCombo = visibleCombos[comboIdx] ?? [];
  const displayCombo = [...(pinnedCombo ?? []), ...currentCombo];
  const gyoyangNoTimeCredit = noTimeSections.reduce((s, sec) => s + sec.credit, 0);
  const gyoyangCredit = currentCombo.reduce((s, sec) => s + sec.credit, 0) + gyoyangNoTimeCredit;
  const totalCredit = displayCombo.reduce((s, sec) => s + sec.credit, 0) + pinnedNoTimeCredit + gyoyangNoTimeCredit;

  const namesInCombos = [...new Set(combos.flatMap((c) => c.map((s) => s.name)))];
  const profsByName = new Map<string, string[]>();
  for (const name of namesInCombos) {
    const profs = [...new Set(combos.flatMap((c) => c.filter((s) => s.name === name).flatMap((s) => s.profs)))].sort((a, b) => a.localeCompare(b, "ko"));
    profsByName.set(name, profs);
  }
  const profsInCombos = [...new Set(combos.flatMap((c) => c.flatMap((s) => s.profs)))].sort((a, b) => a.localeCompare(b, "ko"));
  const filteredGyoProfs = gyoProfSearch ? profsInCombos.filter((p) => p.includes(gyoProfSearch)) : profsInCombos;

  const getTag = (r: Row) => r.crseNo.startsWith("CLTR") ? "교양" : "일반선택";
  const listSorted = useMemo(() => {
    const q = listSearch.toLowerCase();
    const filtered = effectiveRows.filter((r) => {
      if (q && !r.name.toLowerCase().includes(q) && !r.prof.toLowerCase().includes(q) && !r.crseNo.toLowerCase().includes(q)) return false;
      return true;
    });
    if (!listSortState) return filtered;
    return [...filtered].sort((a, b) => {
      const col = listSortState.col as keyof Row;
      const av = col === "tag" ? getTag(a) : a[col] ?? "";
      const bv = col === "tag" ? getTag(b) : b[col] ?? "";
      const an = Number(av), bn = Number(bv);
      const cmp = !isNaN(an) && !isNaN(bn) ? an - bn : av.localeCompare(bv, "ko");
      return listSortState.dir === "asc" ? cmp : -cmp;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveRows, listSearch, listSortState]);

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
        fileName: `${prefix}${semYear}년 ${termLabel} 시간표`,
      });

      // 이미지 저장 완료 토스트
      if (saveToastTimer.current) clearTimeout(saveToastTimer.current);
      setSaveToast(true);
      saveToastTimer.current = setTimeout(() => setSaveToast(false), 10000);

      // 수강신청 팝업용 과목 목록 수집 (교수 선택이 반영된 버전 우선 사용)
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

  // 교수가 선택된 시간표를 캡처용으로 잠깐 보여주기 위한 state
  const [captureCombo, setCaptureCombo] = useState<Section[] | null>(null);
  const [capturedPinnedCombo, setCapturedPinnedCombo] = useState<Section[] | null>(null);
  const [captureNoTimeSections, setCaptureNoTimeSections] = useState<NoTimeSection[] | null>(null);

  // 실제로 시간표에 표시되는 combo (캡처 중일 땐 교수 선택 반영본 사용)
  const visibleCombo = captureCombo !== null
    ? [...(capturedPinnedCombo ?? pinnedCombo ?? []), ...captureCombo]
    : displayCombo;

  // 팝업에서 교수 선택 완료 → 다음 스텝 or 완료
  const handleProfSelect = (prof: string) => {
    const step = profSteps[profStepIdx];
    profPickResults.current.set(step.name, prof);
    advanceProfStep();
  };

  const handleProfSkip = () => {
    advanceProfStep();
  };

  const advanceProfStep = () => {
    const nextIdx = profStepIdx + 1;
    if (nextIdx < profSteps.length) {
      setProfStepIdx(nextIdx);
    } else {
      // 모든 스텝 완료
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

    if (steps.length === 0) {
      await doCapture(currentCombo);
      return;
    }

    profPickResults.current = new Map();
    setProfSteps(steps);
    setProfStepIdx(0);

    afterPickRef.current = async (picks) => {
      const resolvedPinned = applyProfPicks(pinnedCombo ?? [], picks);
      const resolvedGyoyang = applyProfPicks(currentCombo, picks);
      const resolvedNoTime = applyProfPicksNoTime(allNoTime, picks);
      setCaptureCombo(resolvedGyoyang);
      setCapturedPinnedCombo(resolvedPinned);
      setCaptureNoTimeSections(resolvedNoTime);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      await doCapture(resolvedGyoyang, resolvedPinned, resolvedNoTime);
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
      const resolvedGyoyang = applyProfPicks(currentCombo, picks);
      const resolvedAllNoTime = applyProfPicksNoTime(allNoTime, picks);
      setPendingSaveCombo(resolvedGyoyang);
      setPendingSaveNoTime(resolvedAllNoTime);
      setGyoSaveName(defaultName);
      setGyoSavePrompt(true);
    };
  };

  return (
    <div className="flex flex-1 overflow-hidden relative">
      {/* 교수 선택 팝업 */}
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

      {/* 교직 이동 안내 모달 */}
      {kyoshikTip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-xl shadow-xl px-6 py-5 flex flex-col gap-3 w-80 max-w-[90vw]">
            <p className="text-sm font-bold text-gray-800 text-center">교직 마법사로 이동합니다</p>
            <p className="text-xs text-gray-500 text-center leading-relaxed">교직 과목을 선택하지 않아도 됩니다.<br/>그냥 저장 버튼을 눌러도 됩니다.</p>
            <div className="flex gap-2 mt-1">
              <button onClick={() => setKyoshikTip(false)} className="flex-1 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">취소</button>
              <button onClick={() => { setKyoshikTip(false); onGoToKyoshik!(currentCombo, noTimeSections); }} className="flex-1 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold rounded-lg">계속</button>
            </div>
          </div>
        </div>
      )}

      {/* 이미지 저장 완료 토스트 */}
      {saveToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-gray-900 text-white text-sm px-4 py-3 rounded-xl shadow-xl animate-[fadeIn_0.3s_ease] max-w-sm w-[90vw]">
          <span className="text-green-400 text-base shrink-0">✓</span>
          <span className="flex-1 leading-snug">시간표 저장 완료! 도움이 됐다면 한 마디 남겨주세요.</span>
          {onFeedbackClick && (
            <button
              onClick={() => { setSaveToast(false); onFeedbackClick(); }}
              className="shrink-0 text-xs text-indigo-300 hover:text-indigo-200 underline whitespace-nowrap"
            >
              피드백/응원
            </button>
          )}
          <button onClick={() => setSaveToast(false)} className="shrink-0 text-gray-500 hover:text-gray-300 text-base leading-none">✕</button>
        </div>
      )}

      {/* 시간표 저장 이름 입력 모달 */}
      {gyoSavePrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-xl shadow-xl px-6 py-5 flex flex-col gap-4 w-80 max-w-[90vw]">
            <p className="text-sm font-semibold text-gray-800">시간표 이름</p>
            <input
              autoFocus
              type="text"
              value={gyoSaveName}
              onChange={(e) => setGyoSaveName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && gyoSaveName.trim()) {
                  const pinnedNTLen = (pinnedNoTimeSections ?? []).length;
                  saveTimetable({
                    name: gyoSaveName.trim(),
                    sem: `${semYear}-${semTerm}`,
                    major: major ?? "",
                    majorLabel: majorLabel ?? "",
                    pinnedCombo: pinnedCombo ?? [],
                    pinnedNoTimeSections: pendingSaveNoTime ? pendingSaveNoTime.slice(0, pinnedNTLen) : (pinnedNoTimeSections ?? []),
                    gyoyangCombo: pendingSaveCombo ?? currentCombo,
                    gyoyangNoTimeSections: pendingSaveNoTime ? pendingSaveNoTime.slice(pinnedNTLen) : noTimeSections,
                  });
                  setGyoSavePrompt(false); setPendingSaveCombo(null); setPendingSaveNoTime(null);
                }
              }}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
            <div className="flex gap-2">
              <button onClick={() => { setGyoSavePrompt(false); setPendingSaveCombo(null); setPendingSaveNoTime(null); }} className="flex-1 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">취소</button>
              <button
                disabled={!gyoSaveName.trim()}
                onClick={() => {
                  const pinnedNTLen = (pinnedNoTimeSections ?? []).length;
                  saveTimetable({
                    name: gyoSaveName.trim(),
                    sem: `${semYear}-${semTerm}`,
                    major: major ?? "",
                    majorLabel: majorLabel ?? "",
                    pinnedCombo: pinnedCombo ?? [],
                    pinnedNoTimeSections: pendingSaveNoTime ? pendingSaveNoTime.slice(0, pinnedNTLen) : (pinnedNoTimeSections ?? []),
                    gyoyangCombo: pendingSaveCombo ?? currentCombo,
                    gyoyangNoTimeSections: pendingSaveNoTime ? pendingSaveNoTime.slice(pinnedNTLen) : noTimeSections,
                  });
                  setGyoSavePrompt(false); setPendingSaveCombo(null); setPendingSaveNoTime(null);
                }}
                className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg"
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 수강신청 팝업 */}
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
                      onClick={() => {
                        navigator.clipboard.writeText(code).then(() => {
                          setCopiedCode(code);
                          setTimeout(() => setCopiedCode(null), 2000);
                        });
                      }}
                      className={`shrink-0 w-28 py-1.5 rounded-lg text-sm font-mono font-bold transition-all duration-200 ${
                        isCopied
                          ? "bg-green-500 text-white"
                          : "bg-indigo-50 hover:bg-indigo-100 text-indigo-600 border border-indigo-200"
                      }`}
                    >
                      {isCopied ? "✓ 복사됨" : code}
                    </button>
                    <span className="text-base font-semibold text-gray-800 leading-tight">{c.name}</span>
                    <span className="text-xs text-gray-400 shrink-0 ml-auto">{c.credit}학점</span>
                  </div>
                );
              })}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 shrink-0">
              <p className="text-xs text-gray-400 text-center">실수로 닫아도 수강신청하기 버튼으로 다시 볼 수 있어요.</p>
            </div>
          </div>
        </div>
      )}

      {/* Left panel */}
      <div className={`${panelOpen ? "w-96 max-w-full" : "w-0"} shrink-0 border-r border-gray-200 bg-white flex flex-col overflow-hidden transition-all duration-200 h-full`}>
        {/* 학기 표시 + 로딩 + 닫기 */}
        <div className="px-3 pt-3 pb-2 shrink-0 flex items-center gap-2 border-b border-gray-100">
          <button onClick={() => setPanelOpen(false)} className="shrink-0 text-gray-400 hover:text-gray-700 text-base leading-none px-1" title="패널 닫기">←</button>
          <span className="text-sm font-medium text-gray-700 flex-1 truncate">{semYear}년 {semTerm === "s" ? "여름" : semTerm === "w" ? "겨울" : `${semTerm}학기`}</span>
          {loading && <span className="text-gray-400 text-xs animate-pulse shrink-0">불러오는 중...</span>}
          {fetched && !loading && (
            <span className="text-xs text-gray-400 shrink-0">{new Set(effectiveRows.map((r) => r.code)).size}과목</span>
          )}
        </div>

        {/* 내부 탭 */}
        <div className="flex border-b border-gray-200 shrink-0">
          {(["courses", "filter"] as const).map((t) => (
            <button key={t} onClick={() => setPanelTab(t)}
              className={`flex-1 py-2 text-sm font-medium transition-colors ${panelTab === t ? "border-b-2 border-indigo-500 text-indigo-600" : "text-gray-500 hover:text-gray-700"}`}>
              {t === "courses" ? (
                <span>과목 선택 <span className={`text-xs ${selected.size >= MAX_SELECT ? "text-red-500 font-bold" : "text-gray-400"}`}>({selected.size}/{MAX_SELECT})</span></span>
              ) : (
                <span>시간표 필터 {(gyoFilterMap.size > 0 || gyoDayOff.size > 0 || gyoNoMorning || gyoNoEvening || gyoExcludeProfs.size > 0 || gyoIncludeProfs.size > 0 || maxCredit > 0 || minGyoyangCredit > 0) && <span className="text-indigo-500">●</span>}</span>
              )}
            </button>
          ))}
        </div>

        {/* ── 과목 선택 탭 ── */}
        {panelTab === "courses" && (<>
          <div className="px-3 py-2 shrink-0 flex flex-col gap-1.5 border-b border-gray-100">
            <div className="flex gap-1.5">
              <input
                type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="과목명 또는 과목코드 검색..."
                className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
              <button onClick={() => setSortAsc((v) => !v)}
                className="shrink-0 border border-gray-300 rounded px-2 py-1.5 text-xs text-gray-600 hover:bg-gray-50" title="이름 정렬">
                ㄱ{sortAsc ? "▲" : "▼"}
              </button>
            </div>
            {/* 필터 접기/펼치기 헤더 */}
            <div className="flex items-center justify-between">
              <button
                onClick={() => setFilterPanelOpen((v) => !v)}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 w-fit"
              >
                <span>{filterPanelOpen ? "▾" : "▸"}</span>
                <span>검색 필터</span>
                {(filterSdg || filterHmnts || filterSuEval || filterRemote || filterIlban || !filterHideConflict || filterDayOff.size > 0 || filterDayCombo) && (
                  <span className="ml-1 text-indigo-500">●</span>
                )}
              </button>
              {fetched && (
                <span className="text-xs text-gray-400">
                  {filteredList.length}과목 ·{" "}
                  {filteredList.reduce((s, c) => s + effectiveRows.filter((r) => r.code === c.code).length, 0)}분반
                </span>
              )}
            </div>
            {selected.size > 0 && (
              <button onClick={() => setSelected(new Set())} className="text-xs text-gray-400 hover:text-red-500 text-left">전체 과목 선택 해제</button>
            )}
            {/* 필터 내용 (접기/펼치기) */}
            {filterPanelOpen && (
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  <label className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer">
                    <input type="checkbox" checked={filterSdg} onChange={(e) => setFilterSdg(e.target.checked)} />
                    SDG교양
                  </label>
                  <label className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer">
                    <input type="checkbox" checked={filterHmnts} onChange={(e) => setFilterHmnts(e.target.checked)} />
                    인문교양
                  </label>
                  <label className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer">
                    <input type="checkbox" checked={filterSuEval} onChange={(e) => setFilterSuEval(e.target.checked)} />
                    SU평가
                  </label>
                  <label className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer">
                    <input type="checkbox" checked={filterRemote} onChange={(e) => setFilterRemote(e.target.checked)} />
                    원격강좌
                  </label>
                  <label className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer">
                    <input type="checkbox" checked={filterIlban} onChange={(e) => setFilterIlban(e.target.checked)} />
                    일반선택
                  </label>
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
                <div className="flex items-center gap-1">
                  <span className="text-xs text-gray-600 shrink-0">포함 요일</span>
                  {["월","화","수","목","금"].map((d, i) => (
                    <button key={i} onClick={() => {
                      const next = new Set(filterDayOff);
                      next.has(i) ? next.delete(i) : next.add(i);
                      setFilterDayOff(next);
                    }} className={`flex-1 py-1 text-xs rounded border transition-colors ${filterDayOff.has(i) ? "bg-indigo-600 text-white border-indigo-600" : "border-gray-300 text-gray-600 hover:bg-gray-50"}`}>
                      {d}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-600 shrink-0">요일 조합</label>
                  <select value={filterDayCombo} onChange={(e) => setFilterDayCombo(e.target.value)}
                    className="flex-1 border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400">
                    <option value="">전체</option>
                    {["월","화","수","목","금","월화","월수","월목","월금","화수","화목","화금","수목","수금","목금"].map((combo) => (
                      <option key={combo} value={combo}>{combo}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>
          <div className="overflow-y-auto px-2 py-1 flex-1 min-h-0">
            {!fetched ? (
              <p className="text-xs text-gray-400 text-center py-8">{loading ? "교양 과목 불러오는 중..." : "학기를 선택하면 자동으로 불러옵니다"}</p>
            ) : filteredList.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-8">검색 결과 없음</p>
            ) : (
              filteredList.map((c) => {
                const isSelected = selected.has(c.code);
                const disabled = !isSelected && selected.size >= MAX_SELECT;
                const courseRows = effectiveRows.filter((r) => r.code === c.code);

                // 교수별로 묶기: prof → { timeStrs, conflict }
                const profMap = new Map<string, { timeStrs: Set<string>; conflict: boolean }>();
                for (const r of courseRows) {
                  const sec = buildSectionGroups([r]).groups.flat()[0];
                  const conflict = sec ? slotsOverlap(sec.times, pinnedSlots) : false;
                  const profs = (r.prof || "미정").split(",").map((p) => p.trim());
                  for (const prof of profs) {
                    if (!profMap.has(prof)) profMap.set(prof, { timeStrs: new Set(), conflict });
                    const entry = profMap.get(prof)!;
                    if (!conflict) entry.conflict = false;
                    if (r.timeStr) entry.timeStrs.add(r.timeStr);
                  }
                }

                const isExpanded = expandedCodes.has(c.code);
                // 분반별 요일 패턴 + conflict 여부
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
                          {!c.code.startsWith("CLTR") && <span className="ml-1 text-amber-700">일반선택</span>}
                          {c.sdg && <span className="ml-1 text-green-600">SDG</span>}
                          {c.hmnts && <span className="ml-1 text-purple-600">인문</span>}
                          {fetched && suEvalCodes.has(c.code) && <span className="ml-1 text-orange-500">SU평가</span>}
                          {fetched && remoteCodes.has(c.code) && <span className="ml-1 text-indigo-500">원격</span>}
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
                      {fetched && profMap.size > 0 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            const next = new Set(expandedCodes);
                            next.has(c.code) ? next.delete(c.code) : next.add(c.code);
                            setExpandedCodes(next);
                          }}
                          className="text-xs text-gray-400 hover:text-gray-600 shrink-0 px-1"
                        >
                          {isExpanded ? "▲" : "▼"}
                        </button>
                      )}
                    </label>
                    {fetched && courseRows.length > 0 && isExpanded && (
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
                          const isRemote = r.rmrk.includes("원격강좌");
                          const prof = r.prof || "미정";
                          const rowClass = conflict
                            ? "text-red-400 bg-red-50"
                            : sanjuBlocked
                            ? "text-orange-500 bg-orange-50"
                            : "text-green-700 bg-green-50";
                          const subClass = conflict
                            ? "text-red-300"
                            : sanjuBlocked
                            ? "text-orange-400"
                            : "text-green-600";
                          const mark = conflict ? "✗" : sanjuBlocked ? "✗" : "✓";
                          return (
                            <div key={idx} className={`text-xs px-1.5 py-0.5 rounded ${rowClass}`}>
                              <span className={(conflict || sanjuBlocked) ? "line-through" : ""}>{mark} {prof}</span>
                              {isRemote && <span className="ml-1 text-indigo-500">원격</span>}
                              {isSanjuRow && <span className="ml-1 text-slate-500">상주</span>}
                              {timeStr && <span className={`block pl-3 ${subClass}`}>{timeStr}</span>}
                              {r.location && <span className={`block pl-3 ${conflict || sanjuBlocked ? subClass : "text-gray-500"}`}>{r.location}</span>}
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
              조합 {visibleCombos.length}개{filteredCombos.length !== combos.length || (minGyoyangCredit > 0 && combos.length !== visibleCombos.length) ? ` / 전체 ${combos.length}개` : ""}
            </p>
          )}
        </>)}

        {/* ── 시간표 필터 탭 ── */}
        {panelTab === "filter" && (
          <div className="overflow-y-auto flex-1 px-2 pt-2 pb-1 flex flex-col gap-4 min-h-0">
            {namesInCombos.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-xs text-gray-400 px-4 text-center">
                과목을 선택하면 시간표 필터를 사용할 수 있습니다
              </div>
            ) : (
              <>
                {/* 필수 포함 과목 */}
                <div className="px-1">
                  <p className="text-xs text-gray-400 mb-1.5">필수 포함 과목 <span className="text-gray-300">(교수 지정 가능)</span></p>
                  <div className="flex flex-col gap-1">
                    {namesInCombos.map((name) => {
                      const val = gyoFilterMap.get(name);
                      const checked = val !== undefined;
                      const profs = profsByName.get(name) ?? [];
                      return (
                        <div key={name}>
                          <label className="flex items-center gap-2 px-1 py-0.5 hover:bg-gray-50 rounded cursor-pointer">
                            <input type="checkbox" checked={checked}
                              onChange={(e) => {
                                const next = new Map(gyoFilterMap);
                                if (e.target.checked) next.set(name, true); else next.delete(name);
                                setGyoFilterMap(next);
                              }}
                            />
                            <span className="text-sm text-gray-700 leading-tight">{name.replace(/\s*\(.*?\)\s*$/, "")}</span>
                          </label>
                          {checked && profs.length > 1 && (
                            <select
                              value={val === true ? "" : val}
                              onChange={(e) => {
                                const next = new Map(gyoFilterMap);
                                next.set(name, e.target.value === "" ? true : e.target.value);
                                setGyoFilterMap(next);
                              }}
                              className="ml-6 mt-0.5 w-[calc(100%-1.5rem)] border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400"
                            >
                              <option value="">교수 무관</option>
                              {profs.map((p) => <option key={p} value={p}>{p}</option>)}
                            </select>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 공강 요일 */}
                <div className="px-1">
                  <p className="text-xs text-gray-400 mb-1.5">공강 요일 <span className="text-gray-300">(중복 선택)</span></p>
                  <div className="flex gap-1">
                    {["월","화","수","목","금"].map((d, i) => (
                      <button key={i}
                        onClick={() => { const next = new Set(gyoDayOff); next.has(i) ? next.delete(i) : next.add(i); setGyoDayOff(next); }}
                        className={`flex-1 py-1.5 text-sm rounded border transition-colors ${gyoDayOff.has(i) ? "bg-indigo-600 text-white border-indigo-600" : "border-gray-300 text-gray-600 hover:bg-gray-50"}`}
                      >{d}</button>
                    ))}
                  </div>
                </div>

                {/* 아침 수업 없음 */}
                <div className="px-1">
                  <p className="text-xs text-gray-400 mb-1">아침 수업 없음</p>
                  <select value={gyoNoMorning} onChange={(e) => setGyoNoMorning(e.target.value)}
                    className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400">
                    <option value="">제한 없음</option>
                    {["9","10","11","12"].map((h) => <option key={h} value={h}>{h}시 이전 수업 없음</option>)}
                  </select>
                </div>

                {/* 저녁 수업 없음 */}
                <div className="px-1">
                  <p className="text-xs text-gray-400 mb-1">저녁 수업 없음</p>
                  <select value={gyoNoEvening} onChange={(e) => setGyoNoEvening(e.target.value)}
                    className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400">
                    <option value="">제한 없음</option>
                    {["17","18","19","20","21"].map((h) => <option key={h} value={h}>{h}시 이후 수업 없음</option>)}
                  </select>
                </div>

                {/* 최대 학점 */}
                <div className="px-1">
                  <p className="text-xs text-gray-400 mb-1">최대 학점</p>
                  <div className="flex items-center gap-2">
                    <select value={maxCredit} onChange={(e) => setMaxCredit(Number(e.target.value))}
                      className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400">
                      <option value={0}>제한 없음</option>
                      {Array.from({ length: 16 }, (_, i) => i + 12).map((v) => <option key={v} value={v}>{v}학점</option>)}
                    </select>
                    {maxCredit > 0 && (
                      <span className="text-xs text-gray-400 shrink-0">전공 {(pinnedCombo ?? []).reduce((s, sec) => s + sec.credit, 0)}학점</span>
                    )}
                  </div>
                </div>

                {/* 전체 최소 */}
                <div className="px-1">
                  <p className="text-xs text-gray-400 mb-1">전체 최소</p>
                  <select value={minGyoyangCredit} onChange={(e) => setMinGyoyangCredit(Number(e.target.value))}
                    className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400">
                    <option value={0}>제한 없음</option>
                    {Array.from({ length: 17 }, (_, i) => i + 9).map((v) => <option key={v} value={v}>{v}학점 이상</option>)}
                  </select>
                </div>

                {/* 교수 필터 */}
                <div className="px-1">
                  <p className="text-xs text-gray-400 mb-1.5">교수 필터</p>
                  <input type="text" value={gyoProfSearch} onChange={(e) => setGyoProfSearch(e.target.value)}
                    placeholder="교수 검색..."
                    className="w-full border border-gray-300 rounded px-2 py-1 text-sm mb-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  />
                  <div className="max-h-36 overflow-y-auto flex flex-col gap-0.5 border border-gray-100 rounded p-1">
                    {filteredGyoProfs.length === 0 && <p className="text-xs text-gray-300 px-1 py-1">결과 없음</p>}
                    {filteredGyoProfs.map((prof) => {
                      const isExclude = gyoExcludeProfs.has(prof);
                      const isInclude = gyoIncludeProfs.has(prof);
                      return (
                        <div key={prof} className="flex items-center justify-between px-1 py-0.5 hover:bg-gray-50 rounded">
                          <span className="text-sm text-gray-700 truncate flex-1">{prof}</span>
                          <div className="flex gap-1 shrink-0 ml-1">
                            <button onClick={() => {
                              const next = new Set(gyoIncludeProfs); const excl = new Set(gyoExcludeProfs);
                              if (isInclude) { next.delete(prof); } else { next.add(prof); excl.delete(prof); }
                              setGyoIncludeProfs(next); setGyoExcludeProfs(excl);
                            }} className={`text-[11px] px-1.5 py-0.5 rounded border transition-colors ${isInclude ? "bg-indigo-600 text-white border-indigo-600" : "border-gray-300 text-gray-500 hover:bg-gray-100"}`}>포함</button>
                            <button onClick={() => {
                              const next = new Set(gyoExcludeProfs); const incl = new Set(gyoIncludeProfs);
                              if (isExclude) { next.delete(prof); } else { next.add(prof); incl.delete(prof); }
                              setGyoExcludeProfs(next); setGyoIncludeProfs(incl);
                            }} className={`text-[11px] px-1.5 py-0.5 rounded border transition-colors ${isExclude ? "bg-red-500 text-white border-red-500" : "border-gray-300 text-gray-500 hover:bg-gray-100"}`}>제외</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {(gyoIncludeProfs.size > 0 || gyoExcludeProfs.size > 0) && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {[...gyoIncludeProfs].map((p) => <span key={p} className="text-[11px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded">{p} ✓</span>)}
                      {[...gyoExcludeProfs].map((p) => <span key={p} className="text-[11px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded">{p} ✗</span>)}
                    </div>
                  )}
                </div>
              </>
            )}
            {combos.length > 0 && (
              <div className="px-1 pb-2 border-t border-gray-100 pt-2 mt-auto shrink-0">
                <p className="text-xs text-gray-500 text-center">
                  {visibleCombos.length}개 / 전체 {combos.length}개
                </p>
              </div>
            )}
          </div>
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
          {onGoToKyoshik && (
            <button
              onClick={() => setKyoshikTip(true)}
              className="ml-auto shrink-0 self-start mb-1 text-xs px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-colors">
              현재 시간표 고정 후 교직 마법사로 →
            </button>
          )}
        </div>

        {/* 시간표 뷰 */}
        {leftTab === "timetable" && (
          <div key={`${flashKey}-${leftTab}`} className="flex-1 flex flex-col overflow-hidden p-4 gap-2 animate-[fadeIn_0.4s_ease] min-h-0">
            {visibleCombos.length > 0 ? (
              <>
                <div className="flex items-center gap-3 flex-wrap shrink-0">
                  <button onClick={() => { setSlideDir("right"); setComboIdx((i) => (i - 1 + visibleCombos.length) % visibleCombos.length); }} className="px-3 py-1 border border-gray-300 rounded hover:bg-gray-50 text-sm">◀</button>
                  <span className="text-sm text-gray-600 w-24 text-center">{comboIdx + 1} / {visibleCombos.length}</span>
                  <button onClick={() => { setSlideDir("left"); setComboIdx((i) => (i + 1) % visibleCombos.length); }} className="px-3 py-1 border border-gray-300 rounded hover:bg-gray-50 text-sm">▶</button>
                  <span className="text-sm font-semibold text-indigo-600">
                    총 {totalCredit}학점 <span className="text-gray-400 font-normal text-xs">(전공 {pinnedCredit} + 교양 {gyoyangCredit})</span>
                  </span>
                </div>
                <div ref={(el) => { scrollContainerRef.current = el; }} key={`${comboIdx}-${slideDir}`} className={`flex-1 overflow-auto min-h-0 ${slideDir === "left" ? "slide-left" : "slide-right"}`}>
                  <div ref={captureRef}>
                    <TimetableGrid ref={timetableRef} combo={visibleCombo} />
                    {((pinnedNoTimeSections?.length ?? 0) > 0 || noTimeSections.length > 0) && (
                      <div className="border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/70 rounded-lg px-4 py-3 flex flex-wrap gap-x-4 gap-y-2 mt-2">
                        <span className="text-sm font-semibold text-orange-600 dark:text-orange-400 w-full">시간 외</span>
                        {(captureNoTimeSections ?? [...(pinnedNoTimeSections ?? []), ...noTimeSections]).map((s) => (
                          <span key={s.crseNo} className="text-sm text-orange-700 dark:text-orange-300">{s.name}{s.profs?.length === 1 && <span className="text-orange-500 dark:text-orange-400"> · {s.profs[0]}</span>} <span className="text-orange-400 dark:text-orange-500 text-xs">({s.credit}학점)</span></span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="shrink-0 pt-1 flex flex-col gap-1.5">
                  <div className="flex gap-2">
                    <button onClick={saveAsImage} disabled={saving} className="flex-1 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors">
                      {saving ? "저장 중..." : "이미지 저장"}
                    </button>
                    <button
                      onClick={() => { const termLabel = semTerm === "s" ? "여름" : semTerm === "w" ? "겨울" : `${semTerm}학기`; const majorPart = majorLabel2 ? `${majorLabel ?? ""}·${majorLabel2}` : (majorLabel ?? ""); saveToLibrary(`${majorPart} ${semYear}년 ${termLabel} 시간표`.trim()); }}
                      className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition-colors"
                    >
                      라이브러리에 저장
                    </button>
                  </div>
                  {regSaved && (
                    <button
                      onClick={() => setRegModal({ courses: regSaved })}
                      className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition-colors"
                    >
                      수강신청하기
                    </button>
                  )}
                </div>
              </>
            ) : (
              <>
                <div ref={(el) => { scrollContainerRef.current = el; }} className="flex-1 overflow-auto min-h-0">
                  <div ref={captureRef} className="px-1 pt-1">
                    {pinnedCombo && pinnedCombo.length > 0 && (
                      <TimetableGrid ref={timetableRef} combo={pinnedCombo} />
                    )}
                    {((pinnedNoTimeSections?.length ?? 0) > 0 || noTimeSections.length > 0) && (
                      <div className="border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/70 rounded-lg px-4 py-3 flex flex-wrap gap-x-4 gap-y-2 mt-2">
                        <span className="text-sm font-semibold text-orange-600 dark:text-orange-400 w-full">시간 외</span>
                        {(captureNoTimeSections ?? [...(pinnedNoTimeSections ?? []), ...noTimeSections]).map((s) => (
                          <span key={s.crseNo} className="text-sm text-orange-700 dark:text-orange-300">{s.name}{s.profs?.length === 1 && <span className="text-orange-500 dark:text-orange-400"> · {s.profs[0]}</span>} <span className="text-orange-400 dark:text-orange-500 text-xs">({s.credit}학점)</span></span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-center text-gray-400 text-sm py-4">
                    {combos.length > 0 ? (
                      <p>최소 학점 조건을 만족하는 조합이 없습니다</p>
                    ) : !fetched ? (
                      <p>왼쪽에서 조회 후 과목을 선택하면 조합이 자동 생성됩니다</p>
                    ) : selected.size === 0 ? (
                      <p>과목을 선택하면 조합이 자동 생성됩니다</p>
                    ) : (
                      <p>선택한 과목 조합이 없습니다 (전공 시간표와 모두 충돌)</p>
                    )}
                  </div>
                </div>
                <div className="shrink-0 pt-1 flex flex-col gap-1.5">
                  <div className="flex gap-2">
                    <button onClick={saveAsImage} disabled={saving || !pinnedCombo?.length} className="flex-1 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors">
                      {saving ? "저장 중..." : "이미지 저장"}
                    </button>
                    <button
                      onClick={() => { const termLabel = semTerm === "s" ? "여름" : semTerm === "w" ? "겨울" : `${semTerm}학기`; const majorPart = majorLabel2 ? `${majorLabel ?? ""}·${majorLabel2}` : (majorLabel ?? ""); saveToLibrary(`${majorPart} ${semYear}년 ${termLabel} 시간표`.trim()); }}
                      disabled={!pinnedCombo?.length}
                      className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
                    >
                      라이브러리에 저장
                    </button>
                  </div>
                  {regSaved && (
                    <button
                      onClick={() => setRegModal({ courses: regSaved })}
                      className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition-colors"
                    >
                      수강신청하기
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* 전체 목록 뷰 */}
        {leftTab === "list" && (() => {
          const LIST_COLS: { key: keyof Row | "tag"; label: string }[] = [
            { key: "tag",      label: "교과구분" },
            { key: "crseNo",   label: "강좌번호" },
            { key: "name",     label: "교과목명" },
            { key: "credit",   label: "학점" },
            { key: "prof",     label: "담당교수" },
            { key: "timeStr",  label: "강의시간" },
            { key: "location", label: "강의실" },
            { key: "rmrk",    label: "비고" },
          ];
          const toggleListSort = (col: keyof Row | "tag") => {
            setListSortState((prev) => {
              if (!prev || prev.col !== col) return { col: col as keyof Row, dir: "asc" };
              if (prev.dir === "asc") return { col: col as keyof Row, dir: "desc" };
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
                      {listSorted.map((r, i) => {
                        const displayTag = r.crseNo.startsWith("CLTR") ? "교양" : "일반선택";
                        const displayTagColor = displayTag === "교양" ? "text-indigo-700 bg-indigo-50" : "text-amber-700 bg-amber-50";
                        return (
                          <tr key={i} className={`border-b border-gray-100 hover:bg-indigo-50 transition-colors ${i % 2 === 0 ? "bg-white" : "bg-gray-50/60"}`}>
                            <td className="px-1.5 py-1.5 whitespace-nowrap">
                              <span className={`px-1 py-0.5 rounded text-xs font-medium ${displayTagColor}`}>{displayTag}</span>
                            </td>
                            <td className="px-1.5 py-1.5 whitespace-nowrap text-gray-400 text-xs">{r.crseNo}</td>
                            <td className="px-2 py-1.5 text-gray-700 max-w-44">
                              <div className="truncate" title={r.name}>{r.name}</div>
                            </td>
                            <td className="px-1.5 py-1.5 text-center whitespace-nowrap text-gray-500 text-xs">{r.credit.split("-")[0]}</td>
                            <td className="px-2 py-1.5 text-gray-700 max-w-20">
                              <div className="truncate" title={r.prof}>{r.prof}</div>
                            </td>
                            <td className="px-2 py-1.5 text-gray-700 text-xs">
                              {(formatTimeStr(r.timeStr) || r.timeStr || "").split(",").map((t) => t.trim()).filter(Boolean).map((t, i) => <div key={i} className="whitespace-nowrap">{t}</div>)}
                            </td>
                            <td className="px-2 py-1.5 text-gray-700 text-xs">
                              {r.location ? r.location.split("\n").map((line, i) => <div key={i} className="whitespace-nowrap">{line}</div>) : ""}
                            </td>
                            <td className="px-1.5 py-1.5 text-gray-400 text-xs max-w-20">
                              <div className="truncate" title={r.rmrk}>{r.rmrk}</div>
                            </td>
                          </tr>
                        );
                      })}
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
