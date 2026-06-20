"use client";

import { useState, useRef, useCallback } from "react";
import { buildSectionGroups, generateCombos, Section, SectionGroup } from "@/lib/timetable";
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

const COLS: { key: keyof Row; label: string; w: string }[] = [
  { key: "grade", label: "학년", w: "w-12" },
  { key: "crseNo", label: "과목코드", w: "w-32" },
  { key: "name", label: "교과목명", w: "w-56" },
  { key: "dept", label: "개설학과", w: "w-44" },
  { key: "prof", label: "교수", w: "w-28" },
  { key: "timeStr", label: "강의시간", w: "w-64" },
];

export default function Home() {
  const [tab, setTab] = useState<"search" | "wizard">("search");
  const [sem, setSem] = useState("2026-1");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");
  const [sortState, setSortState] = useState<SortState>(null);

  // wizard
  const [checkMap, setCheckMap] = useState<Map<string, boolean>>(new Map());
  const [combos, setCombos] = useState<Section[][]>([]);
  const [filteredCombos, setFilteredCombos] = useState<Section[][]>([]);
  const [comboIdx, setComboIdx] = useState(0);
  const [filterMap, setFilterMap] = useState<Map<string, boolean>>(new Map());
  const abortRef = useRef<AbortController | null>(null);

  const doFetch = useCallback(async () => {
    if (loading) return;
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setLoading(true);
    setRows([]);
    setProgress("조회 중...");
    try {
      const res = await fetch(`/api/sections?sem=${encodeURIComponent(sem)}`, {
        signal: abortRef.current.signal,
      });
      if (!res.ok) {
        const err = await res.json();
        setProgress(err.error ?? "오류가 발생했습니다.");
        return;
      }
      const json = await res.json();
      setRows(json.data);
      setProgress(`총 ${json.data.length}개 분반`);
    } catch (e: unknown) {
      if (e instanceof Error && e.name !== "AbortError") setProgress("오류가 발생했습니다.");
    } finally {
      setLoading(false);
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

  // 과목 그룹핑 (체크박스용)
  const courseGroups = (() => {
    const map = new Map<string, { name: string; grade: string; count: number }>();
    for (const row of rows) {
      const base = row.crseNo.replace(/-\d+$/, "");
      if (!map.has(base)) map.set(base, { name: row.name, grade: row.grade, count: 0 });
      map.get(base)!.count++;
    }
    return map;
  })();

  const generateWizard = () => {
    const selected = [...courseGroups.entries()]
      .filter(([base]) => checkMap.get(base))
      .map(([base]) => base);
    if (!selected.length) return;

    const selectedRows = rows.filter((r) => selected.includes(r.crseNo.replace(/-\d+$/, "")));
    const groups: SectionGroup[] = buildSectionGroups(selectedRows);
    const all = generateCombos(groups);

    setCombos(all);
    setFilteredCombos(all);
    setComboIdx(0);
    setFilterMap(new Map());
    setTab("wizard");
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

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-4">
        <h1 className="text-base font-bold text-gray-800">경북대 AI전공 개설과목 조회</h1>
        <span className="text-xs text-gray-400 ml-auto">made by insu0531 · 참고용으로만 사용하세요</span>
      </header>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200 px-6 flex">
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
              />
              <span className="text-xs text-gray-400">(2026-1 / 2026-2 / 2026-s / 2026-w)</span>
              <button
                onClick={doFetch}
                disabled={loading}
                className="bg-blue-600 text-white text-sm px-4 py-1.5 rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {loading ? "조회 중..." : "조회"}
              </button>
              {rows.length > 0 && (
                <button
                  onClick={generateWizard}
                  className="bg-green-600 text-white text-sm px-4 py-1.5 rounded hover:bg-green-700 transition-colors"
                >
                  시간표 마법사 →
                </button>
              )}
              <span className="text-xs text-gray-500 ml-2">{progress}</span>
            </div>

            <div className="flex-1 overflow-auto border border-gray-200 rounded bg-white">
              <table className="text-sm w-full border-collapse">
                <thead className="sticky top-0 bg-gray-50 z-10">
                  <tr>
                    {COLS.map((c) => (
                      <th
                        key={c.key}
                        onClick={() => toggleSort(c.key)}
                        className={`text-left px-3 py-2 font-semibold text-gray-600 border-b border-gray-200 cursor-pointer select-none whitespace-nowrap hover:bg-gray-100 ${c.w}`}
                      >
                        {c.label}
                        {sortState?.col === c.key ? (sortState.dir === "asc" ? " ▲" : " ▼") : ""}
                      </th>
                    ))}
                    <th className="px-3 py-2 text-left font-semibold text-gray-600 border-b border-gray-200 text-xs whitespace-nowrap">
                      마법사 선택
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((row, i) => {
                    const base = row.crseNo.replace(/-\d+$/, "");
                    const checked = checkMap.get(base) ?? false;
                    return (
                      <tr
                        key={i}
                        className={`border-b border-gray-100 hover:bg-blue-50 transition-colors ${
                          i % 2 === 0 ? "bg-white" : "bg-gray-50/60"
                        }`}
                      >
                        {COLS.map((c) => (
                          <td key={c.key} className="px-3 py-1.5 text-gray-700 truncate max-w-xs">
                            {row[c.key]}
                          </td>
                        ))}
                        <td className="px-3 py-1.5 text-center">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              const next = new Map(checkMap);
                              next.set(base, e.target.checked);
                              setCheckMap(next);
                            }}
                          />
                        </td>
                      </tr>
                    );
                  })}
                  {!loading && rows.length === 0 && (
                    <tr>
                      <td colSpan={7} className="text-center text-gray-400 py-12 text-sm">
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
            <div className="w-64 shrink-0 border-r border-gray-200 bg-white flex flex-col overflow-hidden">
              <div className="p-3 border-b border-gray-100">
                <p className="text-xs font-bold text-gray-700 mb-1">과목 선택</p>
                <div className="flex gap-1">
                  <button
                    onClick={() => setCheckMap(new Map([...courseGroups.keys()].map((k) => [k, true])))}
                    className="text-xs px-2 py-0.5 border border-gray-300 rounded hover:bg-gray-50"
                  >전체 선택</button>
                  <button
                    onClick={() => setCheckMap(new Map())}
                    className="text-xs px-2 py-0.5 border border-gray-300 rounded hover:bg-gray-50"
                  >전체 해제</button>
                </div>
              </div>

              <div className="overflow-y-auto flex-1 px-2 py-1">
                {[...new Set([...courseGroups.values()].map((v) => v.grade))].sort().map((grade) => (
                  <div key={grade}>
                    <p className="text-xs text-gray-400 px-1 py-1 mt-1">── {grade}학년 ──</p>
                    {[...courseGroups.entries()]
                      .filter(([, v]) => v.grade === grade)
                      .map(([base, v]) => (
                        <label key={base} className="flex items-center gap-1.5 px-1 py-0.5 hover:bg-gray-50 rounded cursor-pointer">
                          <input
                            type="checkbox"
                            checked={checkMap.get(base) ?? false}
                            onChange={(e) => {
                              const next = new Map(checkMap);
                              next.set(base, e.target.checked);
                              setCheckMap(next);
                            }}
                          />
                          <span className="text-xs text-gray-700 leading-tight">
                            {v.name.replace(/\s*\(.*?\)\s*$/, "")} ({v.count}분반)
                          </span>
                        </label>
                      ))}
                  </div>
                ))}
              </div>

              <div className="p-2 border-t border-gray-100">
                <button
                  onClick={generateWizard}
                  className="w-full bg-blue-600 text-white text-sm py-1.5 rounded hover:bg-blue-700 transition-colors"
                >
                  조합 생성
                </button>
                {combos.length > 0 && (
                  <p className="text-xs text-gray-500 text-center mt-1">전체 조합: {combos.length}개</p>
                )}
              </div>

              {/* Filter */}
              {namesInCombos.length > 0 && (
                <div className="border-t border-gray-200 p-2">
                  <p className="text-xs font-bold text-gray-700 mb-0.5">필수 포함 필터</p>
                  <p className="text-xs text-gray-400 mb-1">체크한 과목이 모두 포함된 조합만</p>
                  <div className="overflow-y-auto max-h-32 mb-1">
                    {namesInCombos.map((name) => (
                      <label key={name} className="flex items-center gap-1.5 px-1 py-0.5 hover:bg-gray-50 rounded cursor-pointer">
                        <input
                          type="checkbox"
                          checked={filterMap.get(name) ?? false}
                          onChange={(e) => {
                            const next = new Map(filterMap);
                            next.set(name, e.target.checked);
                            setFilterMap(next);
                          }}
                        />
                        <span className="text-xs text-gray-700">{name.replace(/\s*\(.*?\)\s*$/, "")}</span>
                      </label>
                    ))}
                  </div>
                  <button
                    onClick={applyFilter}
                    className="w-full text-xs bg-gray-100 hover:bg-gray-200 py-1 rounded transition-colors"
                  >
                    필터 적용
                  </button>
                  {filteredCombos.length !== combos.length && (
                    <p className="text-xs text-gray-500 text-center mt-0.5">
                      필터 결과: {filteredCombos.length}개
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Right: timetable */}
            <div className="flex-1 flex flex-col overflow-hidden p-4 gap-2">
              {filteredCombos.length > 0 ? (
                <>
                  <div className="flex items-center gap-3 flex-wrap">
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

      <footer className="border-t border-gray-200 bg-white px-6 py-1.5 text-xs text-gray-400 flex gap-4">
        <span>made by insu0531</span>
        <span>· 본 서비스는 참고용으로만 사용하세요. 실제 수강신청 전 학교 포털을 반드시 확인하세요.</span>
      </footer>
    </div>
  );
}
