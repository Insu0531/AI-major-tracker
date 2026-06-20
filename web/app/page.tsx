"use client";

import { useState, useRef, useCallback } from "react";
import { buildSectionGroups, generateCombos, Section, SectionGroup } from "@/lib/timetable";
import { COURSES } from "@/lib/courses";
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

const TOTAL = COURSES.length;
const MAX_SELECT = 10;

export default function Home() {
  const [tab, setTab] = useState<"search" | "wizard">("search");
  const [sem, setSem] = useState("2026-1");
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
  const [leftTab, setLeftTab] = useState<"select" | "filter">("select");

  const abortRef = useRef<AbortController | null>(null);

  const doFetch = useCallback(async () => {
    if (loading) return;
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setLoading(true);
    setRows([]);
    setProgress({ current: 1, name: "서버에 요청 중..." });
    setStatusText("");
    setSortState(null);

    try {
      const res = await fetch(`/api/sections?sem=${encodeURIComponent(sem)}`, {
        signal: abortRef.current.signal,
      });
      if (!res.ok) {
        const err = await res.json();
        setStatusText(err.error ?? "오류가 발생했습니다.");
        return;
      }
      const json = await res.json();
      setRows(json.data ?? []);
      setStatusText(`총 ${(json.data ?? []).length}개 분반 개설됨 (${sem})`);
    } catch (e: unknown) {
      if (e instanceof Error && e.name !== "AbortError") setStatusText("오류가 발생했습니다.");
    } finally {
      setLoading(false);
      setProgress(null);
    }
  }, [sem, loading]);

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
    setTab("wizard");
    setLeftTab("select");
  };

  const applyFilter = () => {
    const required = [...filterMap.entries()].filter(([, v]) => v).map(([k]) => k);
    if (!required.length) {
      setFilteredCombos(combos);
    } else {
      setFilteredCombos(
        combos.filter((combo) =>
          required.every((r) => combo.some((sec) => sec.name === r))
        )
      );
    }
    setComboIdx(0);
  };

  const currentCombo = filteredCombos[comboIdx] ?? [];
  const totalCredit = currentCombo.reduce((s, sec) => s + sec.credit, 0);
  const namesInCombos = [...new Set(combos.flatMap((c) => c.map((s) => s.name)))];
  void progress; void TOTAL;

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center shrink-0">
        <h1 className="text-base font-bold text-gray-800">경북대 AI전공 개설과목 조회</h1>
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
              <input
                className="border border-gray-300 rounded px-3 py-1.5 text-sm w-32 focus:outline-none focus:ring-1 focus:ring-blue-400"
                value={sem}
                onChange={(e) => setSem(e.target.value)}
                placeholder="2026-1"
                onKeyDown={(e) => e.key === "Enter" && doFetch()}
                disabled={loading}
              />
              <span className="text-xs text-gray-400">(2026-1 / 2026-2 / 2026-s / 2026-w)</span>
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

            {loading && (
              <div className="flex flex-col gap-1">
                <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                  <div className="bg-blue-500 h-2 rounded-full animate-pulse w-full" />
                </div>
                <span className="text-xs text-gray-500">과목 정보를 가져오는 중... (약 10~20초)</span>
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
          <div className="flex flex-1 overflow-hidden">
            {/* Left panel */}
            <div className="w-72 shrink-0 border-r border-gray-200 bg-white flex flex-col overflow-hidden">

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
                  필수 포함 필터
                  {[...filterMap.values()].some(Boolean) && (
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

              {/* 필수 포함 필터 패널 */}
              {leftTab === "filter" && (
                <>
                  <div className="px-3 pt-2 pb-1 shrink-0">
                    <p className="text-xs text-gray-400">체크한 과목이 모두 포함된 조합만 표시</p>
                  </div>
                  {namesInCombos.length === 0 ? (
                    <div className="flex-1 flex items-center justify-center text-xs text-gray-400 px-4 text-center">
                      먼저 과목 선택 탭에서 조합을 생성하세요
                    </div>
                  ) : (
                    <>
                      <div className="overflow-y-auto flex-1 px-2 pb-1">
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
                      <div className="p-2 border-t border-gray-100 shrink-0">
                        <button
                          onClick={applyFilter}
                          className="w-full bg-gray-100 hover:bg-gray-200 text-sm py-2 rounded transition-colors"
                        >
                          필터 적용
                        </button>
                        {filteredCombos.length !== combos.length && (
                          <p className="text-xs text-gray-500 text-center mt-1">
                            필터 결과: {filteredCombos.length}개
                          </p>
                        )}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>

            {/* Right: timetable */}
            <div className="flex-1 flex flex-col overflow-hidden p-4 gap-2">
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
