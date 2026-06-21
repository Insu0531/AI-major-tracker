"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { buildSectionGroups, generateCombos, parseTimes, Section, SectionGroup, TimeSlot, NoTimeSection } from "@/lib/timetable";
import TimetableGrid from "@/components/TimetableGrid";
import ProfPickerModal, { ProfStep, getMultiProfSections, applyProfPicks } from "@/components/ProfPickerModal";
import GYOYANG_LIST from "@/lib/gyoyang.json";

type GyoyangCourse = { code: string; name: string; credit: string; sdg: boolean; hmnts: boolean };
const ALL_COURSES: GyoyangCourse[] = GYOYANG_LIST as GyoyangCourse[];
const MAX_SELECT = 6;

type Row = { grade: string; crseNo: string; name: string; code: string; credit: string; dept: string; prof: string; timeStr: string; rmrk: string; tag?: string };

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

export default function GyoyangWizard({ pinnedCombo, pinnedNoTimeSections, initialSem, majorLabel }: { pinnedCombo: Section[] | null; pinnedNoTimeSections?: NoTimeSection[]; initialSem?: string; majorLabel?: string }) {
  const [semYear, setSemYear] = useState(() => initialSem?.split("-")[0] ?? "2026");
  const [semTerm, setSemTerm] = useState(() => initialSem?.split("-")[1] ?? "1");
  const sem = `${semYear}-${semTerm}`;

  // 검색/필터
  const [search, setSearch] = useState("");
  const [filterSdg, setFilterSdg] = useState(false);
  const [filterHmnts, setFilterHmnts] = useState(false);
  const [filterDayOff, setFilterDayOff] = useState<Set<number>>(new Set());
  const [sortAsc, setSortAsc] = useState(true);

  // 선택된 교양 과목 코드 목록
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // 전체 조회 결과 (학기 전체 교양)
  const [allRows, setAllRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);

  // 조합
  const [combos, setCombos] = useState<Section[][]>([]);
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
  const [saving, setSaving] = useState(false);
  const timetableRef = useRef<HTMLDivElement | null>(null);

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

  const openCodes = new Set(allRows.map((r) => r.code));

  const pinnedSlots = pinnedCombo?.flatMap((s) => s.times) ?? [];
  const conflictCodes = new Set(
    fetched && pinnedSlots.length > 0
      ? [...openCodes].filter((code) =>
          allRows
            .filter((r) => r.code === code)
            .every((r) => {
              const sec = buildSectionGroups([r]).groups.flat()[0];
              return sec ? slotsOverlap(sec.times, pinnedSlots) : false;
            })
        )
      : []
  );

  const filteredList = ALL_COURSES.filter((c) => {
    if (fetched && !openCodes.has(c.code)) return false;
    if (fetched && conflictCodes.has(c.code)) return false;
    if (filterSdg && !c.sdg) return false;
    if (filterHmnts && !c.hmnts) return false;
    if (filterDayOff.size > 0 && fetched) {
      const rows = allRows.filter((r) => r.code === c.code);
      const hasMatchingSection = rows.some((r) => {
        const slots = parseTimes(r.timeStr);
        return slots.some((s) => filterDayOff.has(s.day));
      });
      if (!hasMatchingSection) return false;
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

  useEffect(() => {
    if (allRows.length === 0 || selected.size === 0) { setCombos([]); setNoTimeSections([]); return; }

    const selectedRows = allRows.filter((r) => selected.has(r.code));
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
  }, [allRows, selected, pinnedCombo, maxCredit]);

  useEffect(() => { setComboIdx(0); }, [minGyoyangCredit]);

  const pinnedNoTimeCredit = (pinnedNoTimeSections ?? []).reduce((s, sec) => s + sec.credit, 0);
  const pinnedCredit = (pinnedCombo ?? []).reduce((s, sec) => s + sec.credit, 0) + pinnedNoTimeCredit;
  // 전체 학점(전공+교양) 기준 필터
  const visibleCombos = minGyoyangCredit > 0
    ? combos.filter((c) => {
        const gyoyang = c.reduce((s, sec) => s + sec.credit, 0);
        return pinnedCredit + gyoyang >= minGyoyangCredit;
      })
    : combos;
  const currentCombo = visibleCombos[comboIdx] ?? [];
  const displayCombo = [...(pinnedCombo ?? []), ...currentCombo];
  const gyoyangNoTimeCredit = noTimeSections.reduce((s, sec) => s + sec.credit, 0);
  const gyoyangCredit = currentCombo.reduce((s, sec) => s + sec.credit, 0) + gyoyangNoTimeCredit;
  const totalCredit = displayCombo.reduce((s, sec) => s + sec.credit, 0) + pinnedNoTimeCredit + gyoyangNoTimeCredit;

  const getTag = (r: Row) => r.crseNo.startsWith("CLTR") ? "교양" : "일반선택";
  const listSorted = useMemo(() => {
    const q = listSearch.toLowerCase();
    const filtered = allRows.filter((r) => {
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
  }, [allRows, listSearch, listSortState]);

  // 현재 다크모드 여부
  const isDark = () =>
    typeof document !== "undefined" && document.documentElement.classList.contains("dark");

  const doCapture = async (comboToCapture: Section[]) => {
    if (!timetableRef.current) return;
    setSaving(true);
    try {
      const domtoimage = (await import("dom-to-image-more")).default;

      // 캡처 대상 combo를 displayCombo 형태로 만들기
      const fullCombo = [...(pinnedCombo ?? []), ...comboToCapture];

      // 임시 TimetableGrid DOM 없이 캡처하려면 ref를 직접 쓰고
      // 현재 표시된 timetableRef를 그대로 씀 (이미 applyProfPicks 반영된 상태라면)
      // → 여기선 간단히 현재 timetableRef DOM을 클론해 찍음
      // (교수 선택 반영은 displayComboForCapture state를 통해 TimetableGrid에 전달)
      void fullCombo; // fullCombo는 captureCombo state를 통해 이미 반영됨

      const el = timetableRef.current;
      const CAPTURE_W = 900;
      const dark = isDark();
      const bg = dark ? "#171717" : "#ffffff";

      const clone = el.cloneNode(true) as HTMLElement;
      clone.style.position = "fixed";
      clone.style.left = "-9999px";
      clone.style.top = "0";
      clone.style.width = `${CAPTURE_W}px`;
      clone.style.height = "auto";
      clone.style.overflow = "visible";
      document.body.appendChild(clone);

      const dataUrl = await domtoimage.toPng(clone, {
        bgcolor: bg,
        scale: 3,
        width: CAPTURE_W,
        height: clone.scrollHeight,
      });
      document.body.removeChild(clone);

      const link = document.createElement("a");
      link.href = dataUrl;
      const termLabel = semTerm === "s" ? "여름계절" : semTerm === "w" ? "겨울계절" : `${semTerm}학기`;
      const prefix = majorLabel ? `${majorLabel} ` : "";
      link.download = `${prefix}${semYear}년 ${termLabel} 시간표.png`;
      document.body.appendChild(link); link.click(); document.body.removeChild(link);
    } finally {
      setSaving(false);
    }
  };

  // 교수가 선택된 시간표를 캡처용으로 잠깐 보여주기 위한 state
  const [captureCombo, setCaptureCombo] = useState<Section[] | null>(null);
  const [capturedPinnedCombo, setCapturedPinnedCombo] = useState<Section[] | null>(null);

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
    // 전공(pinnedCombo) + 교양(currentCombo) 합쳐서 다중교수 스텝 수집
    const fullComboForPick = [...(pinnedCombo ?? []), ...currentCombo];
    const steps = getMultiProfSections(fullComboForPick);

    if (steps.length === 0) {
      await doCapture(currentCombo);
      return;
    }

    profPickResults.current = new Map();
    setProfSteps(steps);
    setProfStepIdx(0);

    afterPickRef.current = async (picks) => {
      // 전공/교양 각각에 교수 선택 반영
      const resolvedPinned = applyProfPicks(pinnedCombo ?? [], picks);
      const resolvedGyoyang = applyProfPicks(currentCombo, picks);
      setCaptureCombo(resolvedGyoyang);
      // pinnedCombo는 visibleCombo 계산에서 captureCombo와 합쳐지므로 별도 state 필요
      setCapturedPinnedCombo(resolvedPinned);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      await doCapture(resolvedGyoyang);
      setCaptureCombo(null);
      setCapturedPinnedCombo(null);
    };
  };

  return (
    <div className="flex flex-1 overflow-hidden relative">
      {/* 교수 선택 팝업 */}
      {profSteps.length > 0 && profStepIdx < profSteps.length && (
        <ProfPickerModal
          courseName={profSteps[profStepIdx].name}
          profs={profSteps[profStepIdx].profs}
          stepIdx={profStepIdx}
          totalSteps={profSteps.length}
          onSelect={handleProfSelect}
          onSkip={handleProfSkip}
        />
      )}

      {/* Left panel */}
      <div className={`${panelOpen ? "w-80" : "w-0"} shrink-0 border-r border-gray-200 bg-white flex flex-col overflow-hidden transition-all duration-200 h-full`}>
        {/* 학기 표시 + 로딩 */}
        <div className="px-3 pt-3 pb-2 shrink-0 flex items-center justify-between border-b border-gray-100">
          <span className="text-sm font-medium text-gray-700">{semYear}년 {semTerm === "s" ? "여름" : semTerm === "w" ? "겨울" : `${semTerm}학기`}</span>
          {loading && <span className="text-gray-400 text-xs animate-pulse">불러오는 중...</span>}
          {fetched && !loading && (
            <span className="text-xs text-gray-400">{allRows.length}개 분반</span>
          )}
        </div>

        {/* 과목 선택 */}
        {(<>
          <div className="px-3 py-2 shrink-0 flex flex-col gap-1.5 border-b border-gray-100">
            <div className="flex gap-1.5">
              <input
                type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="과목명 또는 과목코드 검색..."
                className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
              <button onClick={() => setSortAsc((v) => !v)}
                className="shrink-0 border border-gray-300 rounded px-2 py-1.5 text-xs text-gray-600 hover:bg-gray-50" title="이름 정렬">
                ㄱ{sortAsc ? "▲" : "▼"}
              </button>
            </div>
            <div className="flex gap-3 items-center">
              <label className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer">
                <input type="checkbox" checked={filterSdg} onChange={(e) => setFilterSdg(e.target.checked)} />
                SDG교양
              </label>
              <label className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer">
                <input type="checkbox" checked={filterHmnts} onChange={(e) => setFilterHmnts(e.target.checked)} />
                인문교양
              </label>
              <span className={`text-xs ml-auto ${selected.size >= MAX_SELECT ? "text-red-500 font-bold" : "text-gray-400"}`}>
                {selected.size}/{MAX_SELECT}
              </span>
              {selected.size > 0 && (
                <button onClick={() => setSelected(new Set())} className="text-xs text-gray-400 hover:text-red-500">전체 해제</button>
              )}
            </div>
            <div className="flex items-center gap-1">
              <span className="text-xs text-gray-600 shrink-0">요일</span>
              {["월","화","수","목","금"].map((d, i) => (
                <button key={i} onClick={() => {
                  const next = new Set(filterDayOff);
                  next.has(i) ? next.delete(i) : next.add(i);
                  setFilterDayOff(next);
                }} className={`flex-1 py-1 text-xs rounded border transition-colors ${filterDayOff.has(i) ? "bg-blue-600 text-white border-blue-600" : "border-gray-300 text-gray-600 hover:bg-gray-50"}`}>
                  {d}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-600 shrink-0">최대 학점</label>
              <select
                value={maxCredit}
                onChange={(e) => setMaxCredit(Number(e.target.value))}
                className="flex-1 border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
              >
                <option value={0}>제한 없음</option>
                {Array.from({ length: 16 }, (_, i) => i + 12).map((v) => (
                  <option key={v} value={v}>{v}학점</option>
                ))}
              </select>
              {maxCredit > 0 && (
                <span className="text-xs text-gray-400 shrink-0">
                  전공 {(pinnedCombo ?? []).reduce((s, sec) => s + sec.credit, 0)}학점
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-600 shrink-0">전체 최소</label>
              <select
                value={minGyoyangCredit}
                onChange={(e) => setMinGyoyangCredit(Number(e.target.value))}
                className="flex-1 border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
              >
                <option value={0}>제한 없음</option>
                {Array.from({ length: 17 }, (_, i) => i + 9).map((v) => (
                  <option key={v} value={v}>{v}학점 이상</option>
                ))}
              </select>
            </div>
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
                const courseRows = allRows.filter((r) => r.code === c.code);

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

                return (
                  <div key={c.code} className={`mb-1 rounded ${isSelected ? "bg-blue-50" : ""}`}>
                    <label className={`flex items-start gap-2 px-1 pt-1 pb-0.5 rounded ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer hover:bg-gray-50"} ${isSelected ? "hover:bg-blue-100" : ""}`}>
                      <input type="checkbox" checked={isSelected} disabled={disabled}
                        onChange={(e) => {
                          if (e.target.checked && selected.size >= MAX_SELECT) return;
                          const next = new Set(selected);
                          e.target.checked ? next.add(c.code) : next.delete(c.code);
                          setSelected(next);
                        }}
                        className="mt-0.5 shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-700 leading-tight">{c.name}</p>
                        <p className="text-xs text-gray-400">{c.code} · {c.credit}학점
                          {c.sdg && <span className="ml-1 text-green-600">SDG</span>}
                          {c.hmnts && <span className="ml-1 text-purple-600">인문</span>}
                        </p>
                      </div>
                    </label>
                    {fetched && profMap.size > 0 && (
                      <div className="ml-6 mb-1 flex flex-col gap-0.5">
                        {[...profMap.entries()].map(([prof, { timeStrs, conflict }]) => {
                          const ok = !conflict;
                          const timeLines = [...timeStrs].map(formatTimeStr).filter(Boolean);
                          return (
                            <div key={prof} className={`text-xs px-1.5 py-0.5 rounded ${ok ? "text-green-700 bg-green-50" : "text-red-400 bg-red-50"}`}>
                              <span className={ok ? "" : "line-through"}>{ok ? "✓" : "✗"} {prof}</span>
                              {timeLines.map((t, i) => (
                                <span key={i} className={`block pl-3 ${ok ? "text-green-600" : "text-red-300"}`}>{t}</span>
                              ))}
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
              조합 {visibleCombos.length}개{minGyoyangCredit > 0 && combos.length !== visibleCombos.length ? ` / 전체 ${combos.length}개` : ""}
            </p>
          )}
        </>)}
      </div>

      {/* Right area */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0 min-h-0">
        {/* 오른쪽 상단 탭바 */}
        <div className="flex items-center gap-2 px-4 pt-3 pb-0 shrink-0 border-b border-gray-200 bg-white">
          <button onClick={() => setPanelOpen((v) => !v)}
            className="flex items-center gap-1 text-xs text-gray-500 border border-gray-300 rounded px-2 py-1 hover:bg-gray-50 mr-2">
            {panelOpen ? "◀" : "▶"}
          </button>
          {(["timetable", "list"] as const).map((t) => (
            <button key={t} onClick={() => setLeftTab(t)}
              className={`pb-2 px-1 text-sm border-b-2 transition-colors ${leftTab === t ? "border-blue-500 text-blue-600 font-semibold" : "border-transparent text-gray-400 hover:text-gray-600"}`}>
              {t === "timetable" ? "시간표" : "전체 목록"}
            </button>
          ))}
        </div>

        {/* 시간표 뷰 */}
        {leftTab === "timetable" && (
          <div key={flashKey} className="flex-1 flex flex-col overflow-hidden p-4 gap-2 animate-[fadeIn_0.4s_ease] min-h-0">
            {visibleCombos.length > 0 ? (
              <>
                <div className="flex items-center gap-3 flex-wrap shrink-0">
                  <button onClick={() => { setSlideDir("right"); setComboIdx((i) => (i - 1 + visibleCombos.length) % visibleCombos.length); }} className="px-3 py-1 border border-gray-300 rounded hover:bg-gray-50 text-sm">◀</button>
                  <span className="text-sm text-gray-600 w-24 text-center">{comboIdx + 1} / {visibleCombos.length}</span>
                  <button onClick={() => { setSlideDir("left"); setComboIdx((i) => (i + 1) % visibleCombos.length); }} className="px-3 py-1 border border-gray-300 rounded hover:bg-gray-50 text-sm">▶</button>
                  <span className="text-sm font-semibold text-blue-600">
                    총 {totalCredit}학점 <span className="text-gray-400 font-normal text-xs">(전공 {pinnedCredit} + 교양 {gyoyangCredit})</span>
                  </span>
                </div>
                <div key={`${comboIdx}-${slideDir}`} className={`flex-1 overflow-auto min-h-0 ${slideDir === "left" ? "slide-left" : "slide-right"}`}>
                  <TimetableGrid ref={timetableRef} combo={visibleCombo} />
                </div>
                {((pinnedNoTimeSections?.length ?? 0) > 0 || noTimeSections.length > 0) && (
                  <div className="shrink-0 border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/70 rounded-lg px-4 py-3 flex flex-wrap gap-x-4 gap-y-2">
                    <span className="text-sm font-semibold text-orange-600 dark:text-orange-400 w-full">시간 외</span>
                    {[...(pinnedNoTimeSections ?? []), ...noTimeSections].map((s) => (
                      <span key={s.crseNo} className="text-sm text-orange-700 dark:text-orange-300">{s.name} <span className="text-orange-400 dark:text-orange-500 text-xs">({s.credit}학점)</span></span>
                    ))}
                  </div>
                )}
                <div className="shrink-0 pt-1">
                  <button onClick={saveAsImage} disabled={saving} className="w-full py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors">
                    {saving ? "저장 중..." : "최종 시간표 이미지 저장"}
                  </button>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col overflow-auto min-h-0 gap-2 pb-2">
                {pinnedCombo && pinnedCombo.length > 0 && (
                  <div className="shrink-0 px-1 pt-1">
                    <TimetableGrid combo={pinnedCombo} />
                  </div>
                )}
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
            )}
          </div>
        )}

        {/* 전체 목록 뷰 */}
        {leftTab === "list" && (() => {
          const LIST_COLS: { key: keyof Row | "tag"; label: string }[] = [
            { key: "tag",     label: "교과구분" },
            { key: "crseNo",  label: "강좌번호" },
            { key: "name",    label: "교과목명" },
            { key: "credit",  label: "학점" },
            { key: "prof",    label: "담당교수" },
            { key: "timeStr", label: "강의시간" },
            { key: "rmrk",   label: "비고" },
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
                  className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 w-60"
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
                            className="text-left px-3 py-2 font-semibold text-gray-600 border-b border-gray-200 cursor-pointer select-none whitespace-nowrap hover:bg-gray-100">
                            {c.label}
                            {listSortState?.col === c.key ? (listSortState.dir === "asc" ? " ▲" : " ▼") : ""}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {listSorted.map((r, i) => {
                        const displayTag = r.crseNo.startsWith("CLTR") ? "교양" : "일반선택";
                        const displayTagColor = displayTag === "교양" ? "text-blue-700 bg-blue-50" : "text-amber-700 bg-amber-50";
                        return (
                          <tr key={i} className={`border-b border-gray-100 hover:bg-blue-50 transition-colors ${i % 2 === 0 ? "bg-white" : "bg-gray-50/60"}`}>
                            <td className="px-2 py-1.5 whitespace-nowrap">
                              <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${displayTagColor}`}>{displayTag}</span>
                            </td>
                            <td className="px-2 py-1.5 whitespace-nowrap text-gray-700 text-xs">{r.crseNo}</td>
                            <td className="px-2 py-1.5 text-gray-700 max-w-45">
                              <div className="truncate" title={r.name}>{r.name}</div>
                            </td>
                            <td className="px-2 py-1.5 text-center whitespace-nowrap text-gray-700">{r.credit}</td>
                            <td className="px-2 py-1.5 text-gray-700 max-w-25">
                              <div className="truncate" title={r.prof}>{r.prof}</div>
                            </td>
                            <td className="px-2 py-1.5 text-gray-700 max-w-30">
                              <div className="truncate" title={r.timeStr}>{r.timeStr}</div>
                            </td>
                            <td className="px-2 py-1.5 text-gray-400 max-w-25">
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
