"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { track } from "@vercel/analytics";
import { buildSectionGroups, generateCombos, Section, NoTimeSection } from "@/lib/timetable";
import { Major, MAJOR_LABELS, ENTRY_YEAR_MIN, ENTRY_YEAR_MAX, fetchCoursesByYear, Course } from "@/lib/courses";
import TimetableGrid from "@/components/TimetableGrid";
import GyoyangWizard from "@/components/GyoyangWizard";

type Row = {
  grade: string;
  credit: string;
  crseNo: string;
  name: string;
  dept: string;
  prof: string;
  timeStr: string;
  rmrk: string;
};

type SortState = { col: keyof Row; dir: "asc" | "desc" } | null;

const COLS: { key: keyof Row; label: string }[] = [
  { key: "grade", label: "학년" },
  { key: "crseNo", label: "과목코드" },
  { key: "name", label: "교과목명" },
  { key: "dept", label: "개설학과" },
  { key: "prof", label: "교수" },
  { key: "timeStr", label: "강의시간" },
  { key: "rmrk", label: "비고" },
];

const MAX_SELECT = 10;

export default function Home() {
  const [tab, setTab] = useState<"search" | "wizard" | "gyoyang" | "settings">("search");
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("theme");
    setDarkMode(stored === "dark");
  }, []);

  const toggleDark = () => {
    const next = !darkMode;
    setDarkMode(next);
    if (next) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  };
  const [pinnedCombo, setPinnedCombo] = useState<Section[] | null>(null);
  const [major, setMajor] = useState<Major>("ai");
  const [majorSearch, setMajorSearch] = useState("");
  const [majorDropOpen, setMajorDropOpen] = useState(false);
  const majorDropRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (majorDropRef.current && !majorDropRef.current.contains(e.target as Node)) {
        setMajorDropOpen(false);
        setMajorSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const [semYear, setSemYear] = useState("2026");
  const [semTerm, setSemTerm] = useState("2");
  const [entryYear, setEntryYear] = useState(2026);
  const sem = `${semYear}-${semTerm}`;
  const [courses, setCourses] = useState<Course[]>([]);
  const TOTAL = courses.length;
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<{ current: number; name: string } | null>(null);
  const [sortState, setSortState] = useState<SortState>(null);
  const [statusText, setStatusText] = useState("");

  // wizard
  const [checkMap, setCheckMap] = useState<Map<string, boolean>>(new Map());
  const [combos, setCombos] = useState<Section[][]>([]);
  const [filteredCombos, setFilteredCombos] = useState<Section[][]>([]);
  const [comboIdx, setComboIdx] = useState(0);
  // filterMap: name → true(필수, 교수 무관) | string(필수 + 특정 교수)
  const [filterMap, setFilterMap] = useState<Map<string, true | string>>(new Map());
  const [minCredit, setMinCredit] = useState<string>("");
  const [dayOff, setDayOff] = useState<Set<number>>(new Set());
  const [noMorning, setNoMorning] = useState<string>("");
  const [noEvening, setNoEvening] = useState<string>("");
  const [excludeProfs, setExcludeProfs] = useState<Set<string>>(new Set());
  const [includeProfs, setIncludeProfs] = useState<Set<string>>(new Set());
  const [includeDepts, setIncludeDepts] = useState<Set<string>>(new Set());
  const [profSearch, setProfSearch] = useState<string>("");
  const [leftTab, setLeftTab] = useState<"select" | "filter">("select");
  const [panelOpen, setPanelOpen] = useState(() => typeof window !== "undefined" && window.innerWidth >= 768);
  const [flashKey, setFlashKey] = useState(0);
  const [slideDir, setSlideDir] = useState<"left" | "right">("left");
  // 고정 분반: crseNo → Row / 제외 분반: crseNo Set
  const [pinnedRows, setPinnedRows] = useState<Map<string, Row>>(new Map());
  const [excludedRows, setExcludedRows] = useState<Set<string>>(new Set());
  const [noTimeSections, setNoTimeSections] = useState<NoTimeSection[]>([]);

  // 전공+입학연도 변경 시 과목 목록 fetch
  useEffect(() => {
    fetchCoursesByYear(major, entryYear).then(setCourses);
  }, [major, entryYear]);

  const abortRef = useRef<AbortController | null>(null);

  const doFetch = useCallback(async () => {
    if (loading) return;
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setLoading(true);
    setRows([]);
    setProgress({ current: 0, name: "서버에 요청 중..." });
    setStatusText("");
    setSortState(null);
    track("search", { major, entryYear, sem });

    try {
      const res = await fetch(`/api/sections?sem=${encodeURIComponent(sem)}&major=${major}&entryYear=${entryYear}`, {
        signal: abortRef.current.signal,
      });
      if (!res.ok) {
        const err = await res.json();
        setStatusText(err.error ?? "오류가 발생했습니다.");
        return;
      }

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
          if (json.type === "progress") {
            setProgress({ current: json.current, name: json.name });
            if (json.rows?.length) {
              setRows((prev) => [...prev, ...json.rows]);
            }
          } else if (json.type === "done") {
            setStatusText(`총 ${json.totalRows}개 분반 개설됨 (${sem})`);
            // 새 조회 시 wizard 초기화
            setCheckMap(new Map());
            setCombos([]);
            setFilteredCombos([]);
            setPinnedRows(new Map());
            setExcludedRows(new Set());
          }
        }
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.name !== "AbortError") setStatusText("오류가 발생했습니다.");
    } finally {
      setLoading(false);
      setProgress(null);
    }
  }, [sem, major, entryYear, loading]);

  const sortedRows = (() => {
    if (!sortState) return rows;
    return [...rows].sort((a, b) => {
      const av = a[sortState.col];
      const bv = b[sortState.col];
      const an = Number(av), bn = Number(bv);
      const cmp = !isNaN(an) && !isNaN(bn) ? an - bn : av.localeCompare(bv, "ko");
      return sortState.dir === "asc" ? cmp : -cmp;
    });
  })();

  const toggleSort = (col: keyof Row) => {
    setSortState((prev) => {
      if (!prev || prev.col !== col) return { col, dir: "asc" };
      if (prev.dir === "asc") return { col, dir: "desc" };
      return null;
    });
  };

  const courseGroups = (() => {
    const map = new Map<string, { name: string; grade: string; count: number }>();
    for (const row of rows) {
      const base = row.crseNo.replace(/-\d+$/, "");
      if (!map.has(base)) map.set(base, { name: row.name, grade: row.grade, count: 0 });
      map.get(base)!.count++;
    }
    return map;
  })();

  const checkedCount = [...checkMap.values()].filter(Boolean).length;

  const generateWizard = () => {
    const selected = [...courseGroups.entries()]
      .filter(([base]) => checkMap.get(base))
      .map(([base]) => base);
    // 고정 분반의 과목도 자동 포함
    for (const row of pinnedRows.values()) {
      const base = row.crseNo.replace(/-\d+$/, "");
      if (!selected.includes(base)) selected.push(base);
    }
    if (!selected.length) {
      alert("과목을 하나 이상 선택해주세요.");
      return;
    }
    // 고정 분반이 있는 과목은 해당 분반만, 제외 분반은 제거, 없는 과목은 전체 분반 사용
    const pinnedCrseNos = new Set(pinnedRows.keys());
    const selectedRows = rows.filter((r) => {
      const base = r.crseNo.replace(/-\d+$/, "");
      if (!selected.includes(base)) return false;
      if (excludedRows.has(r.crseNo)) return false;
      const hasPinned = [...pinnedRows.values()].some((p) => p.crseNo.replace(/-\d+$/, "") === base);
      if (hasPinned) return pinnedCrseNos.has(r.crseNo);
      return true;
    });
    const { groups, noTimeSections: nts } = buildSectionGroups(selectedRows);
    setNoTimeSections(nts);
    const all = generateCombos(groups);
    setCombos(all);
    setFilteredCombos(all);
    setPinnedCombo(null);
    setComboIdx(0);
    setFilterMap(new Map());
    setMinCredit("");
    setDayOff(new Set());
    setNoMorning("");
    setNoEvening("");
    setExcludeProfs(new Set());
    setIncludeProfs(new Set());
    setIncludeDepts(new Set());
    setProfSearch("");
    setFlashKey((k) => k + 1);
    setTab("wizard");
    setLeftTab("filter");
    // 모바일에서는 조합 생성 후 패널 닫기
    if (typeof window !== "undefined" && window.innerWidth < 768) setPanelOpen(false);
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Enter") return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "BUTTON" || tag === "SELECT" || tag === "TEXTAREA") return;
      if (tab === "search" && !loading && courses.length > 0) doFetch();
      if (tab === "wizard" && leftTab === "select" && checkedCount > 0) generateWizard();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, leftTab, loading, courses.length, checkedCount]);

  useEffect(() => {
    if (combos.length === 0) { setFilteredCombos([]); return; }
    // filterMap value: true = 과목만 필수, string = 과목+교수 필수
    const required = [...filterMap.entries()];
    const min = parseInt(minCredit);
    const morningLimit = parseInt(noMorning);
    const eveningLimit = parseInt(noEvening);

    setFilteredCombos(
      combos.filter((combo) => {
        if (required.length && !required.every(([name, prof]) =>
          combo.some((sec) =>
            sec.name === name && (prof === true || sec.profs.includes(prof as string))
          )
        )) return false;
        if (!isNaN(min) && min > 0) {
          if (combo.reduce((s, sec) => s + sec.credit, 0) < min) return false;
        }
        if (excludeProfs.size > 0) {
          if (combo.some((sec) => sec.profs.some((p) => excludeProfs.has(p)))) return false;
        }
        if (includeProfs.size > 0) {
          if (![...includeProfs].every((p) => combo.some((sec) => sec.profs.includes(p)))) return false;
        }
        if (includeDepts.size > 0) {
          if (!combo.every((sec) => includeDepts.has(sec.dept))) return false;
        }
        const allSlots = combo.flatMap((sec) => sec.times);
        if (dayOff.size > 0) {
          const usedDays = new Set(allSlots.map((t) => t.day));
          if ([...dayOff].some((d) => usedDays.has(d))) return false;
        }
        if (!isNaN(morningLimit) && morningLimit > 0) {
          if (allSlots.some((t) => t.start < morningLimit)) return false;
        }
        if (!isNaN(eveningLimit) && eveningLimit > 0) {
          if (allSlots.some((t) => t.end > eveningLimit)) return false;
        }
        return true;
      })
    );
    setComboIdx(0);
  }, [combos, filterMap, minCredit, dayOff, noMorning, noEvening, excludeProfs, includeProfs, includeDepts]);

  const currentCombo = filteredCombos[comboIdx] ?? [];
  const noTimeCredit = noTimeSections.reduce((s, sec) => s + sec.credit, 0);
  const totalCredit = currentCombo.reduce((s, sec) => s + sec.credit, 0) + noTimeCredit;
  const namesInCombos = [...new Set(combos.flatMap((c) => c.map((s) => s.name)))];
  // 과목별 교수 목록: name → 교수[]
  const profsByName = new Map<string, string[]>();
  for (const name of namesInCombos) {
    const profs = [...new Set(combos.flatMap((c) => c.filter((s) => s.name === name).flatMap((s) => s.profs)))].sort((a, b) => a.localeCompare(b, "ko"));
    profsByName.set(name, profs);
  }
  const profsInCombos = [...new Set(combos.flatMap((c) => c.flatMap((s) => s.profs)))].sort((a, b) => a.localeCompare(b, "ko"));
  const deptsInCombos = [...new Set(combos.flatMap((c) => c.map((s) => s.dept)).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ko"));
  const filteredProfs = profSearch ? profsInCombos.filter((p) => p.includes(profSearch)) : profsInCombos;
  return (
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-2.5 shrink-0">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" className="w-6 h-6 shrink-0">
          <circle cx="16" cy="16" r="16" fill="#e53e3e"/>
        </svg>
        <h1 className="text-base font-bold text-gray-800">경북대학교 시간표 마법사</h1>
      </header>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200 px-6 flex shrink-0">
        {([
          { key: "search", label: "전공 조회" },
          { key: "wizard", label: "전공 마법사" },
          { key: "gyoyang", label: "교양 마법사" },
          { key: "settings", label: "설정" },
        ] as const).map(({ key, label }) => {
          const disabled = key === "gyoyang" && !pinnedCombo;
          return (
            <button
              key={key}
              onClick={() => { if (!disabled) setTab(key); }}
              title={disabled ? "시간표 마법사에서 ★ 교양 마법사로 이동을 먼저 선택하세요" : undefined}
              className={`px-4 py-2 text-sm border-b-2 transition-colors ${
                tab === key
                  ? "border-blue-500 text-blue-600 font-semibold"
                  : disabled
                  ? "border-transparent text-gray-300 cursor-not-allowed"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {label}
              {key === "gyoyang" && pinnedCombo && (
                <span className="ml-1 text-xs text-amber-500">★</span>
              )}
            </button>
          );
        })}
      </div>

      <main className="flex-1 flex flex-col overflow-hidden">
        {/* ── 과목 조회 탭 ── */}
        {tab === "search" && (
          <div className="flex flex-col flex-1 overflow-hidden p-4 gap-3">
            <div className="flex items-center gap-3 flex-wrap" onKeyDown={(e) => { if (e.key === "Enter" && !loading && courses.length > 0) doFetch(); }}>
              {/* 전공 드롭다운 (검색 가능) */}
              <div ref={majorDropRef} className="relative">
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => { setMajorDropOpen((v) => !v); setMajorSearch(""); }}
                  className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white min-w-48 text-left flex items-center justify-between gap-2 disabled:opacity-50"
                >
                  <span className="truncate">{MAJOR_LABELS[major]}</span>
                  <span className="text-gray-400 shrink-0">▾</span>
                </button>
                {majorDropOpen && (
                  <div className="absolute z-50 top-full left-0 mt-1 w-72 bg-white border border-gray-200 rounded shadow-lg flex flex-col" style={{ maxHeight: 320 }}>
                    <div className="p-1.5 border-b border-gray-100 shrink-0">
                      <input
                        autoFocus
                        type="text"
                        value={majorSearch}
                        onChange={(e) => setMajorSearch(e.target.value)}
                        placeholder="전공 검색..."
                        className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                    </div>
                    <div className="overflow-y-auto flex-1">
                      {(Object.entries(MAJOR_LABELS) as [Major, string][])
                        .filter(([, label]) => !majorSearch || label.includes(majorSearch))
                        .map(([key, label]) => (
                          <button
                            key={key}
                            type="button"
                            onClick={() => { setMajor(key); setRows([]); setStatusText(""); setMajorDropOpen(false); setMajorSearch(""); }}
                            className={`w-full text-left px-3 py-1.5 text-sm hover:bg-blue-50 transition-colors ${key === major ? "bg-blue-100 text-blue-700 font-medium" : "text-gray-700"}`}
                          >
                            {label}
                          </button>
                        ))
                      }
                    </div>
                  </div>
                )}
              </div>
              {/* 입학연도 드롭다운 */}
              <select
                className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                value={entryYear}
                onChange={(e) => { setEntryYear(Number(e.target.value)); setRows([]); setStatusText(""); }}
                disabled={loading}
              >
                {Array.from({ length: ENTRY_YEAR_MAX - ENTRY_YEAR_MIN + 1 }, (_, i) => ENTRY_YEAR_MIN + i).map((y) => (
                  <option key={y} value={y}>{y}학번</option>
                ))}
              </select>
              {/* 조회학기 연도 드롭다운 */}
              <select
                className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                value={semYear}
                onChange={(e) => setSemYear(e.target.value)}
                disabled={loading}
              >
                {Array.from({ length: 15 }, (_, i) => String(2021 + i)).map((y) => (
                  <option key={y} value={y}>{y}년</option>
                ))}
              </select>
              {/* 학기 드롭다운 */}
              <select
                className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                value={semTerm}
                onChange={(e) => setSemTerm(e.target.value)}
                disabled={loading}
              >
                <option value="1">1학기</option>
                <option value="2">2학기</option>
                <option value="s">여름</option>
                <option value="w">겨울</option>
              </select>
              <button
                onClick={doFetch}
                disabled={loading || courses.length === 0}
                title={courses.length === 0 ? "해당 학번의 이수체계 데이터가 없습니다" : undefined}
                className="bg-blue-600 text-white text-sm px-4 py-1.5 rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {loading ? "조회 중..." : courses.length === 0 ? "데이터 없음" : "조회"}
              </button>
              {loading && (
                <button
                  onClick={() => { abortRef.current?.abort(); setLoading(false); setProgress(null); }}
                  className="text-sm px-3 py-1.5 border border-gray-300 rounded hover:bg-gray-50 text-gray-600"
                >
                  취소
                </button>
              )}
              {rows.length > 0 && !loading && (
                <button
                  onClick={() => { setTab("wizard"); setLeftTab("select"); }}
                  className="bg-green-600 text-white text-sm px-4 py-1.5 rounded hover:bg-green-700 transition-colors"
                >
                  시간표 마법사 →
                </button>
              )}
              <span className="text-xs text-gray-500">{statusText}</span>
            </div>

            {loading && progress && (
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-gray-200 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${progress.current === 0 ? 2 : (progress.current / TOTAL) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-500 shrink-0">
                    ({progress.current}/{TOTAL})
                  </span>
                </div>
                <span className="text-xs text-gray-400 truncate">
                  {progress.current === 0 ? "서버에 연결 중..." : progress.name}
                </span>
              </div>
            )}

            <div className="flex-1 overflow-auto border border-gray-200 rounded bg-white">
              <table className="text-sm w-full border-collapse min-w-max">
                <thead className="sticky top-0 bg-gray-50 z-10">
                  <tr>
                    <th className="px-2 py-2 border-b border-gray-200 text-gray-400 font-medium whitespace-nowrap">고정</th>
                    {COLS.map((c) => (
                      <th
                        key={c.key}
                        onClick={() => toggleSort(c.key)}
                        className="text-left px-3 py-2 font-semibold text-gray-600 border-b border-gray-200 cursor-pointer select-none whitespace-nowrap hover:bg-gray-100"
                      >
                        {c.label}
                        {sortState?.col === c.key ? (sortState.dir === "asc" ? " ▲" : " ▼") : ""}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((row, i) => {
                    const isPinned = pinnedRows.has(row.crseNo);
                    const isExcluded = excludedRows.has(row.crseNo);
                    return (
                      <tr
                        key={row.crseNo + i}
                        className={`border-b border-gray-100 hover:bg-blue-50 transition-colors ${
                          isPinned ? "bg-amber-50" : isExcluded ? "bg-red-50 opacity-60" : i % 2 === 0 ? "bg-white" : "bg-gray-50/60"
                        } ${loading ? "row-animate" : ""}`}
                        style={loading ? { animationDelay: `${(i % 20) * 18}ms` } : undefined}
                      >
                        <td className="px-2 py-1.5 text-center whitespace-nowrap">
                          {(() => {
                            const isPinned = pinnedRows.has(row.crseNo);
                            const isExcluded = excludedRows.has(row.crseNo);
                            return (
                              <button
                                onClick={() => {
                                  if (!isPinned && !isExcluded) {
                                    // 기본 → 고정
                                    const next = new Map(pinnedRows);
                                    next.set(row.crseNo, row);
                                    setPinnedRows(next);
                                  } else if (isPinned) {
                                    // 고정 → 제외
                                    const nextPin = new Map(pinnedRows);
                                    nextPin.delete(row.crseNo);
                                    setPinnedRows(nextPin);
                                    const nextExcl = new Set(excludedRows);
                                    nextExcl.add(row.crseNo);
                                    setExcludedRows(nextExcl);
                                  } else {
                                    // 제외 → 기본
                                    const nextExcl = new Set(excludedRows);
                                    nextExcl.delete(row.crseNo);
                                    setExcludedRows(nextExcl);
                                  }
                                }}
                                title={isPinned ? "클릭 시 제외로 전환" : isExcluded ? "클릭 시 기본으로 전환" : "클릭 시 고정"}
                                className={`text-xs px-1.5 py-0.5 rounded border transition-colors ${
                                  isPinned
                                    ? "bg-amber-400 text-white border-amber-400 hover:bg-amber-500"
                                    : isExcluded
                                    ? "bg-red-500 text-white border-red-500 hover:bg-red-600"
                                    : "border-gray-300 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                                }`}
                              >
                                {isPinned ? "★" : isExcluded ? "✕" : "☆"}
                              </button>
                            );
                          })()}
                        </td>
                        {COLS.map((c) => (
                          <td key={c.key} className="px-3 py-1.5 text-gray-700 whitespace-nowrap">
                            {c.key === "timeStr" ? (
                              <div className="overflow-x-auto max-w-40" style={{ scrollbarWidth: "none" }}>
                                {row[c.key]}
                              </div>
                            ) : row[c.key]}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                  {!loading && rows.length === 0 && (
                    <tr>
                      <td colSpan={8} className="text-center text-gray-400 py-12 text-sm">
                        학기를 입력하고 조회하세요
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── 시간표 마법사 탭 ── */}
        {tab === "wizard" && (
          <div className="flex flex-1 overflow-hidden relative">
            {/* Left panel */}
            <div className={`${panelOpen ? "w-72" : "w-0"} shrink-0 border-r border-gray-200 bg-white flex flex-col overflow-hidden transition-all duration-200`} onKeyDown={(e) => { if (e.key === "Enter" && leftTab === "select" && checkedCount > 0) generateWizard(); }}>

              {/* 내부 탭 */}
              <div className="flex border-b border-gray-200 shrink-0">
                <button
                  onClick={() => setLeftTab("select")}
                  className={`flex-1 py-2 text-sm font-medium transition-colors ${
                    leftTab === "select"
                      ? "border-b-2 border-blue-500 text-blue-600"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  과목 선택
                  <span className={`ml-1 text-xs ${checkedCount >= MAX_SELECT ? "text-red-500 font-bold" : "text-gray-400"}`}>
                    ({checkedCount}/{MAX_SELECT})
                  </span>
                </button>
                <button
                  onClick={() => setLeftTab("filter")}
                  className={`flex-1 py-2 text-sm font-medium transition-colors ${
                    leftTab === "filter"
                      ? "border-b-2 border-blue-500 text-blue-600"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  필터
                </button>
              </div>

              {/* 과목 선택 패널 */}
              {leftTab === "select" && (
                <>
                  <div className="px-3 pt-2 pb-1 shrink-0 flex items-center justify-between">
                    <span className="text-xs text-gray-400">최대 {MAX_SELECT}개 선택</span>
                    <button
                      onClick={() => setCheckMap(new Map())}
                      className="text-xs px-2 py-0.5 border border-gray-300 rounded hover:bg-gray-50"
                    >전체 해제</button>
                  </div>
                  <div className="overflow-y-auto flex-1 px-2 pb-1">
                    {[...new Set([...courseGroups.values()].map((v) => v.grade))].sort().map((grade) => (
                      <div key={grade}>
                        <p className="text-xs text-gray-400 px-1 py-1 mt-1">── {grade}학년 ──</p>
                        {[...courseGroups.entries()]
                          .filter(([, v]) => v.grade === grade)
                          .map(([base, v]) => {
                            const pinnedForBase = [...pinnedRows.values()].filter((p) => p.crseNo.replace(/-\d+$/, "") === base);
                            const isPinnedCourse = pinnedForBase.length > 0;
                            const checked = isPinnedCourse || (checkMap.get(base) ?? false);
                            const disabled = !checked && checkedCount >= MAX_SELECT;
                            return (
                              <div key={base}>
                                <label
                                  className={`flex items-center gap-2 px-1 py-1 rounded ${
                                    isPinnedCourse ? "cursor-default" : disabled ? "opacity-40 cursor-not-allowed" : "hover:bg-gray-50 cursor-pointer"
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    disabled={isPinnedCourse || disabled}
                                    onChange={(e) => {
                                      if (isPinnedCourse) return;
                                      if (e.target.checked && checkedCount >= MAX_SELECT) return;
                                      const next = new Map(checkMap);
                                      next.set(base, e.target.checked);
                                      setCheckMap(next);
                                    }}
                                  />
                                  <span className="text-sm text-gray-700 leading-tight">
                                    {v.name.replace(/\s*\(.*?\)\s*$/, "")}
                                    {isPinnedCourse
                                      ? <span className="text-amber-500 text-xs ml-1">★ 고정</span>
                                      : <span className="text-gray-400 text-xs ml-1">({v.count}분반)</span>
                                    }
                                  </span>
                                </label>
                                {isPinnedCourse && (
                                  <div className="ml-6 flex flex-col gap-0.5 mb-0.5">
                                    {pinnedForBase.map((p) => (
                                      <div key={p.crseNo} className="flex items-center justify-between text-xs text-amber-700 bg-amber-50 rounded px-1.5 py-0.5">
                                        <span>{p.prof} · {p.timeStr}</span>
                                        <button
                                          onClick={() => {
                                            const next = new Map(pinnedRows);
                                            next.delete(p.crseNo);
                                            setPinnedRows(next);
                                          }}
                                          className="ml-1 text-amber-400 hover:text-red-500"
                                        >✕</button>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                      </div>
                    ))}
                  </div>
                  <div className="p-2 border-t border-gray-100 shrink-0">
                    <button
                      onClick={generateWizard}
                      disabled={checkedCount === 0 && pinnedRows.size === 0}
                      className="w-full bg-blue-600 text-white text-sm py-2 rounded hover:bg-blue-700 disabled:opacity-40 transition-colors"
                    >
                      조합 생성
                    </button>
                    {combos.length > 0 && (
                      <p className="text-xs text-gray-500 text-center mt-1">전체 조합: {combos.length}개</p>
                    )}
                  </div>
                </>
              )}

              {/* 필터 패널 */}
              {leftTab === "filter" && (
                <>
                  {namesInCombos.length === 0 ? (
                    <div className="flex-1 flex items-center justify-center text-xs text-gray-400 px-4 text-center">
                      먼저 과목 선택 탭에서 조합을 생성하세요
                    </div>
                  ) : (
                    <>
                      <div className="overflow-y-auto flex-1 px-2 pt-2 pb-1 flex flex-col gap-4">
                        {/* 필수 포함 과목 + 교수 */}
                        <div className="px-1">
                          <p className="text-xs text-gray-400 mb-1.5">필수 포함 과목 <span className="text-gray-300">(교수 지정 가능)</span></p>
                          <div className="flex flex-col gap-1">
                            {namesInCombos.map((name) => {
                              const val = filterMap.get(name);
                              const checked = val !== undefined;
                              const profs = profsByName.get(name) ?? [];
                              return (
                                <div key={name}>
                                  <label className="flex items-center gap-2 px-1 py-0.5 hover:bg-gray-50 rounded cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={(e) => {
                                        const next = new Map(filterMap);
                                        if (e.target.checked) next.set(name, true);
                                        else next.delete(name);
                                        setFilterMap(next);
                                      }}
                                    />
                                    <span className="text-sm text-gray-700 leading-tight">{name.replace(/\s*\(.*?\)\s*$/, "")}</span>
                                  </label>
                                  {checked && profs.length > 1 && (
                                    <select
                                      value={val === true ? "" : val}
                                      onChange={(e) => {
                                        const next = new Map(filterMap);
                                        next.set(name, e.target.value === "" ? true : e.target.value);
                                        setFilterMap(next);
                                      }}
                                      className="ml-6 mt-0.5 w-[calc(100%-1.5rem)] border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
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
                            {["월", "화", "수", "목", "금"].map((d, i) => (
                              <button
                                key={i}
                                onClick={() => {
                                  const next = new Set(dayOff);
                                  next.has(i) ? next.delete(i) : next.add(i);
                                  setDayOff(next);
                                }}
                                className={`flex-1 py-1.5 text-sm rounded border transition-colors ${
                                  dayOff.has(i)
                                    ? "bg-blue-600 text-white border-blue-600"
                                    : "border-gray-300 text-gray-600 hover:bg-gray-50"
                                }`}
                              >
                                {d}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* 아침 수업 없음 */}
                        <div className="px-1">
                          <p className="text-xs text-gray-400 mb-1">아침 수업 없음</p>
                          <select
                            value={noMorning}
                            onChange={(e) => setNoMorning(e.target.value)}
                            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                          >
                            <option value="">제한 없음</option>
                            {["9", "10", "11", "12"].map((h) => (
                              <option key={h} value={h}>{h}시 이전 수업 없음</option>
                            ))}
                          </select>
                        </div>

                        {/* 저녁 수업 없음 */}
                        <div className="px-1">
                          <p className="text-xs text-gray-400 mb-1">저녁 수업 없음</p>
                          <select
                            value={noEvening}
                            onChange={(e) => setNoEvening(e.target.value)}
                            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                          >
                            <option value="">제한 없음</option>
                            {["17", "18", "19", "20", "21"].map((h) => (
                              <option key={h} value={h}>{h}시 이후 수업 없음</option>
                            ))}
                          </select>
                        </div>

                        {/* 최소 학점 */}
                        <div className="px-1">
                          <p className="text-xs text-gray-400 mb-1">최소 학점</p>
                          <select
                            value={minCredit}
                            onChange={(e) => setMinCredit(e.target.value)}
                            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                          >
                            <option value="">제한 없음</option>
                            {Array.from({ length: 18 }, (_, i) => String(i + 6)).map((n) => (
                              <option key={n} value={n}>{n}학점 이상</option>
                            ))}
                          </select>
                        </div>

                        {/* 교수 필터 */}
                        <div className="px-1">
                          <p className="text-xs text-gray-400 mb-1.5">교수 필터</p>
                          <input
                            type="text"
                            value={profSearch}
                            onChange={(e) => setProfSearch(e.target.value)}
                            placeholder="교수 검색..."
                            className="w-full border border-gray-300 rounded px-2 py-1 text-sm mb-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
                          />
                          <div className="max-h-36 overflow-y-auto flex flex-col gap-0.5 border border-gray-100 rounded p-1">
                            {filteredProfs.length === 0 && (
                              <p className="text-xs text-gray-300 px-1 py-1">결과 없음</p>
                            )}
                            {filteredProfs.map((prof) => {
                              const isExclude = excludeProfs.has(prof);
                              const isInclude = includeProfs.has(prof);
                              return (
                                <div key={prof} className="flex items-center justify-between px-1 py-0.5 hover:bg-gray-50 rounded">
                                  <span className="text-sm text-gray-700 truncate flex-1">{prof}</span>
                                  <div className="flex gap-1 shrink-0 ml-1">
                                    <button
                                      onClick={() => {
                                        const next = new Set(includeProfs);
                                        const excl = new Set(excludeProfs);
                                        if (isInclude) { next.delete(prof); }
                                        else { next.add(prof); excl.delete(prof); }
                                        setIncludeProfs(next); setExcludeProfs(excl);
                                      }}
                                      className={`text-[11px] px-1.5 py-0.5 rounded border transition-colors ${isInclude ? "bg-blue-600 text-white border-blue-600" : "border-gray-300 text-gray-500 hover:bg-gray-100"}`}
                                    >포함</button>
                                    <button
                                      onClick={() => {
                                        const next = new Set(excludeProfs);
                                        const incl = new Set(includeProfs);
                                        if (isExclude) { next.delete(prof); }
                                        else { next.add(prof); incl.delete(prof); }
                                        setExcludeProfs(next); setIncludeProfs(incl);
                                      }}
                                      className={`text-[11px] px-1.5 py-0.5 rounded border transition-colors ${isExclude ? "bg-red-500 text-white border-red-500" : "border-gray-300 text-gray-500 hover:bg-gray-100"}`}
                                    >제외</button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          {(includeProfs.size > 0 || excludeProfs.size > 0) && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {[...includeProfs].map((p) => (
                                <span key={p} className="text-[11px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">{p} ✓</span>
                              ))}
                              {[...excludeProfs].map((p) => (
                                <span key={p} className="text-[11px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded">{p} ✗</span>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* 개설 전공 필터 */}
                        {deptsInCombos.length > 0 && (
                          <div className="px-1">
                            <p className="text-xs text-gray-400 mb-1.5">개설 전공 선택 <span className="text-gray-300">(선택 전공 과목만)</span></p>
                            <div className="flex flex-col gap-0.5">
                              {deptsInCombos.map((dept) => (
                                <label key={dept} className="flex items-center gap-2 px-1 py-0.5 hover:bg-gray-50 rounded cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={includeDepts.has(dept)}
                                    onChange={(e) => {
                                      const next = new Set(includeDepts);
                                      e.target.checked ? next.add(dept) : next.delete(dept);
                                      setIncludeDepts(next);
                                    }}
                                  />
                                  <span className="text-sm text-gray-700">{dept}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        )}

                      </div>
                      <div className="p-2 border-t border-gray-100 shrink-0">
                        <p className="text-xs text-gray-500 text-center">
                          {filteredCombos.length}개 / 전체 {combos.length}개
                        </p>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>

            {/* Right: timetable */}
            <div key={flashKey} className="flex-1 flex flex-col overflow-hidden p-4 gap-2 animate-[fadeIn_0.4s_ease] min-w-0 min-h-0">
              {/* 패널 토글 버튼 */}
              <button
                onClick={() => setPanelOpen((v) => !v)}
                className="self-start flex items-center gap-1 text-xs text-gray-500 border border-gray-300 rounded px-2 py-1 hover:bg-gray-50 shrink-0"
              >
                {panelOpen ? "◀ 패널 닫기" : "▶ 패널 열기"}
              </button>
              {filteredCombos.length > 0 ? (
                <>
                  <div className="flex items-center gap-3 flex-wrap shrink-0">
                    <button
                      onClick={() => { setSlideDir("right"); setComboIdx((i) => (i - 1 + filteredCombos.length) % filteredCombos.length); }}
                      className="px-3 py-1 border border-gray-300 rounded hover:bg-gray-50 text-sm"
                    >◀</button>
                    <span className="text-sm text-gray-600 w-20 text-center">
                      {comboIdx + 1} / {filteredCombos.length}
                    </span>
                    <button
                      onClick={() => { setSlideDir("left"); setComboIdx((i) => (i + 1) % filteredCombos.length); }}
                      className="px-3 py-1 border border-gray-300 rounded hover:bg-gray-50 text-sm"
                    >▶</button>
                    <span className="text-sm font-semibold text-blue-600">
                      총 {totalCredit}학점
                    </span>
                    <span className="text-xs text-gray-400 ml-auto truncate max-w-sm">
                      {currentCombo.map((s) => s.name.replace(/\s*\(.*?\)\s*$/, "")).join(" · ")}
                    </span>
                  </div>
                  <div key={`${comboIdx}-${slideDir}`} className={`flex-1 overflow-auto min-h-0 ${slideDir === "left" ? "slide-left" : "slide-right"}`}>
                    <TimetableGrid combo={currentCombo} />
                  </div>
                  {noTimeSections.length > 0 && (
                    <div className="shrink-0 border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/70 rounded-lg px-4 py-3 flex flex-wrap gap-x-4 gap-y-2">
                      <span className="text-sm font-semibold text-orange-600 dark:text-orange-400 w-full">시간 외</span>
                      {noTimeSections.map((s) => (
                        <span key={s.crseNo} className="text-sm text-orange-700 dark:text-orange-300">{s.name} <span className="text-orange-400 dark:text-orange-500 text-xs">({s.credit}학점)</span></span>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-3 shrink-0 pt-1">
                    <button
                      onClick={() => { setPinnedCombo(currentCombo); setTab("gyoyang"); }}
                      className="w-full py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold rounded-lg transition-colors"
                    >
                      ★ 이 시간표로 교양 마법사 시작
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center gap-2 text-gray-400 text-sm">
                  {combos.length === 0
                    ? "과목을 선택하고 조합 생성을 눌러주세요"
                    : <>
                        <span>필터 조건에 맞는 조합이 없습니다</span>
                        {(() => {
                          const hints: string[] = [];
                          if (filterMap.size > 0) hints.push(`필수과목 (${[...filterMap.keys()].map((n) => n.replace(/\s*\(.*?\)\s*$/, "")).join(", ")})`);
                          if (dayOff.size > 0) hints.push(`공강 (${["월","화","수","목","금"].filter((_, i) => dayOff.has(i)).join("")})`);
                          if (noMorning) hints.push(`${noMorning}시 이전 없음`);
                          if (noEvening) hints.push(`${noEvening}시 이후 없음`);
                          if (minCredit) hints.push(`최소 ${minCredit}학점`);
                          if (includeProfs.size > 0) hints.push(`교수 포함 (${[...includeProfs].join(", ")})`);
                          if (excludeProfs.size > 0) hints.push(`교수 제외 (${[...excludeProfs].join(", ")})`);
                          if (includeDepts.size > 0) hints.push(`전공 (${[...includeDepts].join(", ")})`);
                          return hints.length > 0
                            ? <span className="text-xs text-red-400 text-center px-4">{hints.join(" · ")}</span>
                            : null;
                        })()}
                      </>
                  }
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── 교양 마법사 탭 ── 항상 마운트, 탭 전환 시 숨기기만 해서 상태 유지 */}
        <div className={`flex flex-1 overflow-hidden ${tab === "gyoyang" ? "" : "hidden"}`}>
          {pinnedCombo !== null && (
            <GyoyangWizard pinnedCombo={pinnedCombo} pinnedNoTimeSections={noTimeSections} initialSem={sem} />
          )}
        </div>

        {/* ── 설정 탭 ── */}
        {tab === "settings" && (
          <div className="flex-1 p-6 flex flex-col gap-6">
            <div className="bg-white border border-gray-200 rounded-lg p-4 max-w-md">
              <h2 className="text-sm font-semibold text-gray-700 mb-4">화면</h2>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-700">다크 모드</p>
                  <p className="text-xs text-gray-400 mt-0.5">어두운 배경으로 전환합니다</p>
                </div>
                <button
                  onClick={toggleDark}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${darkMode ? "bg-blue-600" : "bg-gray-300"}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${darkMode ? "translate-x-6" : "translate-x-1"}`} />
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="border-t border-gray-200 bg-white px-6 py-1.5 text-xs text-gray-400 flex gap-2 shrink-0">
        <span>insu0531@knu.ac.kr</span>
        <span>·</span>
        <span>본 서비스는 참고용으로만 사용하세요. 실제 수강신청 전 학교 포털을 반드시 확인하세요.</span>
      </footer>
    </div>
  );
}
