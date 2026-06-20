"use client";

import { useState, useRef, useCallback } from "react";
import { buildSectionGroups, generateCombos, Section, SectionGroup } from "@/lib/timetable";
import { COURSES_BY_MAJOR, Major } from "@/lib/courses";
import TimetableGrid from "@/components/TimetableGrid";

type Row = {
  grade: string;
  credit: string;
  crseNo: string;
  name: string;
  dept: string;
  prof: string;
  timeStr: string;
};

type SortState = { col: keyof Row; dir: "asc" | "desc" } | null;

const COLS: { key: keyof Row; label: string }[] = [
  { key: "grade", label: "학년" },
  { key: "crseNo", label: "과목코드" },
  { key: "name", label: "교과목명" },
  { key: "dept", label: "개설학과" },
  { key: "prof", label: "교수" },
  { key: "timeStr", label: "강의시간" },
];

const MAX_SELECT = 10;

export default function Home() {
  const [tab, setTab] = useState<"search" | "wizard">("search");
  const [major, setMajor] = useState<Major>("ai");
  const [semYear, setSemYear] = useState("2026");
  const [semTerm, setSemTerm] = useState("1");
  const sem = `${semYear}-${semTerm}`;
  const COURSES = COURSES_BY_MAJOR[major];
  const TOTAL = COURSES.length;
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
  const [filterMap, setFilterMap] = useState<Map<string, boolean>>(new Map());
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

    try {
      const res = await fetch(`/api/sections?sem=${encodeURIComponent(sem)}&major=${major}`, {
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
          } else if (json.type === "done") {
            setRows(json.data ?? []);
            setStatusText(`총 ${(json.data ?? []).length}개 분반 개설됨 (${sem})`);
            // 새 조회 시 wizard 초기화
            setCheckMap(new Map());
            setCombos([]);
            setFilteredCombos([]);
          }
        }
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.name !== "AbortError") setStatusText("오류가 발생했습니다.");
    } finally {
      setLoading(false);
      setProgress(null);
    }
  }, [sem, major, loading]);

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
    if (!selected.length) {
      alert("과목을 하나 이상 선택해주세요.");
      return;
    }
    const selectedRows = rows.filter((r) => selected.includes(r.crseNo.replace(/-\d+$/, "")));
    const groups: SectionGroup[] = buildSectionGroups(selectedRows);
    const all = generateCombos(groups);
    setCombos(all);
    setFilteredCombos(all);
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

  const applyFilter = () => {
    const required = [...filterMap.entries()].filter(([, v]) => v).map(([k]) => k);
    const min = parseInt(minCredit);
    const morningLimit = parseInt(noMorning);   // 이 시각 이전 시작 수업 제외
    const eveningLimit = parseInt(noEvening);   // 이 시각 이후 끝나는 수업 제외

    setFilteredCombos(
      combos.filter((combo) => {
        // 필수 과목
        if (required.length && !required.every((r) => combo.some((sec) => sec.name === r))) return false;
        // 최소 학점
        if (!isNaN(min) && min > 0) {
          if (combo.reduce((s, sec) => s + sec.credit, 0) < min) return false;
        }
        // 제외 교수 — 조합 내 어떤 section의 profs에라도 포함되면 제외
        if (excludeProfs.size > 0) {
          if (combo.some((sec) => sec.profs.some((p) => excludeProfs.has(p)))) return false;
        }
        // 포함 교수 — 선택한 교수 중 하나라도 조합에 없으면 제외
        if (includeProfs.size > 0) {
          if (![...includeProfs].every((p) => combo.some((sec) => sec.profs.includes(p)))) return false;
        }
        // 개설 전공 — 선택한 전공의 과목만 허용 (모든 과목이 선택 전공 중 하나에 속해야 통과)
        if (includeDepts.size > 0) {
          if (!combo.every((sec) => includeDepts.has(sec.dept))) return false;
        }
        const allSlots = combo.flatMap((sec) => sec.times);
        // 공강 요일
        if (dayOff.size > 0) {
          const usedDays = new Set(allSlots.map((t) => t.day));
          if ([...dayOff].some((d) => usedDays.has(d))) return false;
        }
        // 아침 수업 없음 (morningLimit시 이전에 시작하는 수업 제외)
        if (!isNaN(morningLimit) && morningLimit > 0) {
          if (allSlots.some((t) => t.start < morningLimit)) return false;
        }
        // 저녁 수업 없음 (eveningLimit시 이후에 끝나는 수업 제외)
        if (!isNaN(eveningLimit) && eveningLimit > 0) {
          if (allSlots.some((t) => t.end > eveningLimit)) return false;
        }
        return true;
      })
    );
    setComboIdx(0);
  };

  const currentCombo = filteredCombos[comboIdx] ?? [];
  const totalCredit = currentCombo.reduce((s, sec) => s + sec.credit, 0);
  const namesInCombos = [...new Set(combos.flatMap((c) => c.map((s) => s.name)))];
  const profsInCombos = [...new Set(combos.flatMap((c) => c.flatMap((s) => s.profs)))].sort((a, b) => a.localeCompare(b, "ko"));
  const deptsInCombos = [...new Set(combos.flatMap((c) => c.map((s) => s.dept)).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ko"));
  const filteredProfs = profSearch ? profsInCombos.filter((p) => p.includes(profSearch)) : profsInCombos;
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center shrink-0">
        <h1 className="text-base font-bold text-gray-800">경북대 전공 개설과목 조회</h1>
      </header>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200 px-6 flex shrink-0">
        {(["search", "wizard"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm border-b-2 transition-colors ${
              tab === t
                ? "border-blue-500 text-blue-600 font-semibold"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t === "search" ? "과목 조회" : "시간표 마법사"}
          </button>
        ))}
      </div>

      <main className="flex-1 flex flex-col overflow-hidden">
        {/* ── 과목 조회 탭 ── */}
        {tab === "search" && (
          <div className="flex flex-col flex-1 overflow-hidden p-4 gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              {/* 전공 드롭다운 */}
              <select
                className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                value={major}
                onChange={(e) => { setMajor(e.target.value as Major); setRows([]); setStatusText(""); }}
                disabled={loading}
              >
                <option value="ai">전자공학부 인공지능전공</option>
                <option value="elec">전자공학부</option>
              </select>
              {/* 연도 드롭다운 */}
              <select
                className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                value={semYear}
                onChange={(e) => setSemYear(e.target.value)}
                disabled={loading}
              >
                {Array.from({ length: 15 }, (_, i) => String(2026 + i)).map((y) => (
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
                disabled={loading}
                className="bg-blue-600 text-white text-sm px-4 py-1.5 rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {loading ? "조회 중..." : "조회"}
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

            {/* 마법사 선택 컬럼 제거 */}
            <div className="flex-1 overflow-auto border border-gray-200 rounded bg-white">
              <table className="text-sm w-full border-collapse min-w-max">
                <thead className="sticky top-0 bg-gray-50 z-10">
                  <tr>
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
                  {sortedRows.map((row, i) => (
                    <tr
                      key={i}
                      className={`border-b border-gray-100 hover:bg-blue-50 transition-colors ${
                        i % 2 === 0 ? "bg-white" : "bg-gray-50/60"
                      }`}
                    >
                      {COLS.map((c) => (
                        <td key={c.key} className="px-3 py-1.5 text-gray-700 whitespace-nowrap">
                          {row[c.key]}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {!loading && rows.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center text-gray-400 py-12 text-sm">
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
            <div className={`${panelOpen ? "w-72" : "w-0"} shrink-0 border-r border-gray-200 bg-white flex flex-col overflow-hidden transition-all duration-200`}>

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
                  {([...filterMap.values()].some(Boolean) || parseInt(minCredit) > 0 || dayOff.size > 0 || noMorning || noEvening || excludeProfs.size > 0 || includeProfs.size > 0 || includeDepts.size > 0) && (
                    <span className="ml-1 text-xs text-blue-500">●</span>
                  )}
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
                            const checked = checkMap.get(base) ?? false;
                            const disabled = !checked && checkedCount >= MAX_SELECT;
                            return (
                              <label
                                key={base}
                                className={`flex items-center gap-2 px-1 py-1 rounded ${
                                  disabled ? "opacity-40 cursor-not-allowed" : "hover:bg-gray-50 cursor-pointer"
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  disabled={disabled}
                                  onChange={(e) => {
                                    if (e.target.checked && checkedCount >= MAX_SELECT) return;
                                    const next = new Map(checkMap);
                                    next.set(base, e.target.checked);
                                    setCheckMap(next);
                                  }}
                                />
                                <span className="text-sm text-gray-700 leading-tight">
                                  {v.name.replace(/\s*\(.*?\)\s*$/, "")}
                                  <span className="text-gray-400 text-xs ml-1">({v.count}분반)</span>
                                </span>
                              </label>
                            );
                          })}
                      </div>
                    ))}
                  </div>
                  <div className="p-2 border-t border-gray-100 shrink-0">
                    <button
                      onClick={generateWizard}
                      disabled={checkedCount === 0}
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

                        {/* 필수 포함 과목 */}
                        <div className="px-1">
                          <p className="text-xs text-gray-400 mb-1">필수 포함 과목</p>
                          {namesInCombos.map((name) => (
                            <label key={name} className="flex items-center gap-2 px-1 py-1 hover:bg-gray-50 rounded cursor-pointer">
                              <input
                                type="checkbox"
                                checked={filterMap.get(name) ?? false}
                                onChange={(e) => {
                                  const next = new Map(filterMap);
                                  next.set(name, e.target.checked);
                                  setFilterMap(next);
                                }}
                              />
                              <span className="text-sm text-gray-700">{name.replace(/\s*\(.*?\)\s*$/, "")}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                      <div className="p-2 border-t border-gray-100 shrink-0">
                        <button
                          onClick={applyFilter}
                          className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm py-2 rounded transition-colors"
                        >
                          필터 적용
                        </button>
                        <p className="text-xs text-gray-500 text-center mt-1">
                          {filteredCombos.length}개 / 전체 {combos.length}개
                        </p>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>

            {/* Right: timetable */}
            <div key={flashKey} className="flex-1 flex flex-col overflow-hidden p-4 gap-2 animate-[fadeIn_0.4s_ease] min-w-0">
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
                      onClick={() => setComboIdx((i) => (i - 1 + filteredCombos.length) % filteredCombos.length)}
                      className="px-3 py-1 border border-gray-300 rounded hover:bg-gray-50 text-sm"
                    >◀</button>
                    <span className="text-sm text-gray-600 w-20 text-center">
                      {comboIdx + 1} / {filteredCombos.length}
                    </span>
                    <button
                      onClick={() => setComboIdx((i) => (i + 1) % filteredCombos.length)}
                      className="px-3 py-1 border border-gray-300 rounded hover:bg-gray-50 text-sm"
                    >▶</button>
                    <span className="text-sm font-semibold text-blue-600">
                      총 {totalCredit}학점
                    </span>
                    <span className="text-xs text-gray-400 ml-auto truncate max-w-sm">
                      {currentCombo.map((s) => s.name.replace(/\s*\(.*?\)\s*$/, "")).join(" · ")}
                    </span>
                  </div>
                  <div className="flex-1 overflow-auto">
                    <TimetableGrid combo={currentCombo} />
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
                  {combos.length === 0
                    ? "과목을 선택하고 조합 생성을 눌러주세요"
                    : "필터 조건에 맞는 조합이 없습니다"}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      <footer className="border-t border-gray-200 bg-white px-6 py-1.5 text-xs text-gray-400 flex gap-2 shrink-0">
        <span>made by insu0531</span>
        <span>·</span>
        <span>본 서비스는 참고용으로만 사용하세요. 실제 수강신청 전 학교 포털을 반드시 확인하세요.</span>
      </footer>
    </div>
  );
}
