"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { buildSectionGroups, generateCombos, Section, SectionGroup, TimeSlot } from "@/lib/timetable";
import TimetableGrid from "@/components/TimetableGrid";
import GYOYANG_LIST from "@/lib/gyoyang.json";

type GyoyangCourse = { code: string; name: string; credit: string; sdg: boolean; hmnts: boolean };
const ALL_COURSES: GyoyangCourse[] = GYOYANG_LIST as GyoyangCourse[];
const MAX_SELECT = 6;

type Row = { grade: string; crseNo: string; name: string; code: string; credit: string; dept: string; prof: string; timeStr: string; rmrk: string };

function slotsOverlap(a: TimeSlot[], b: TimeSlot[]): boolean {
  for (const x of a) for (const y of b) {
    if (x.day === y.day && x.start < y.end && x.end > y.start) return true;
  }
  return false;
}

export default function GyoyangWizard({ pinnedCombo, initialSem }: { pinnedCombo: Section[] | null; initialSem?: string }) {
  const [semYear, setSemYear] = useState(() => initialSem?.split("-")[0] ?? "2026");
  const [semTerm, setSemTerm] = useState(() => initialSem?.split("-")[1] ?? "1");
  const sem = `${semYear}-${semTerm}`;

  // 검색/필터
  const [search, setSearch] = useState("");
  const [filterSdg, setFilterSdg] = useState(false);
  const [filterHmnts, setFilterHmnts] = useState(false);
  const [sortAsc, setSortAsc] = useState(true);

  // 선택된 교양 과목 코드 목록
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // 전체 조회 결과 (학기 전체 교양)
  const [allRows, setAllRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false); // 이 학기 조회 완료 여부

  // 조합
  const [combos, setCombos] = useState<Section[][]>([]);
  const [comboIdx, setComboIdx] = useState(0);
  const [panelOpen, setPanelOpen] = useState(() => typeof window !== "undefined" && window.innerWidth >= 768);
  const [flashKey, setFlashKey] = useState(0);
  const [slideDir, setSlideDir] = useState<"left" | "right">("left");
  const [saving, setSaving] = useState(false);
  const timetableRef = useRef<HTMLDivElement | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  // 학기 전체 교양 조회
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

  // 학기 변경(또는 최초 마운트) 시 자동 조회
  useEffect(() => {
    setAllRows([]);
    setFetched(false);
    setCombos([]);
    setSelected(new Set());
    doFetch();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sem]);

  // 이번 학기 개설된 과목 코드 집합
  const openCodes = new Set(allRows.map((r) => r.code));

  // 전공 시간표와 겹치는 과목 코드 집합
  const pinnedSlots = pinnedCombo?.flatMap((s) => s.times) ?? [];
  const conflictCodes = new Set(
    fetched && pinnedSlots.length > 0
      ? [...openCodes].filter((code) =>
          allRows
            .filter((r) => r.code === code)
            .every((r) => {
              const sec = buildSectionGroups([r]).flat()[0];
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
    if (search) {
      const q = search.toLowerCase();
      if (!c.name.toLowerCase().includes(q) && !c.code.toLowerCase().includes(q)) return false;
    }
    return true;
  }).sort((a, b) => {
    const cmp = a.name.localeCompare(b.name, "ko");
    return sortAsc ? cmp : -cmp;
  });

  // 선택 과목 변경 시 조합 생성
  useEffect(() => {
    if (allRows.length === 0 || selected.size === 0) { setCombos([]); return; }

    const selectedRows = allRows.filter((r) => selected.has(r.code));
    const groups: SectionGroup[] = buildSectionGroups(selectedRows);

    // 피닝된 전공 시간표와 겹치는 분반 제거
    const pinnedSlots = pinnedCombo?.flatMap((s) => s.times) ?? [];
    const filteredGroups = pinnedSlots.length > 0
      ? groups.map((group) => group.filter((sec) => !slotsOverlap(sec.times, pinnedSlots))).filter((g) => g.length > 0)
      : groups;

    const all = generateCombos(filteredGroups);
    setCombos(all);
    setComboIdx(0);
    setFlashKey((k) => k + 1);
    if (typeof window !== "undefined" && window.innerWidth < 768) setPanelOpen(false);
  }, [allRows, selected, pinnedCombo]);

  const currentCombo = combos[comboIdx] ?? [];
  const displayCombo = [...(pinnedCombo ?? []), ...currentCombo];
  const totalCredit = displayCombo.reduce((s, sec) => s + sec.credit, 0);

  const saveAsImage = async () => {
    if (!timetableRef.current) return;
    setSaving(true);
    try {
      const domtoimage = (await import("dom-to-image-more")).default;
      const el = timetableRef.current;
      const CAPTURE_W = 900;
      const clone = el.cloneNode(true) as HTMLElement;
      clone.style.position = "fixed";
      clone.style.left = "-9999px";
      clone.style.top = "0";
      clone.style.width = `${CAPTURE_W}px`;
      clone.style.height = "auto";
      clone.style.overflow = "visible";
      document.body.appendChild(clone);
      const dataUrl = await domtoimage.toPng(clone, {
        bgcolor: "#ffffff",
        scale: 3,
        width: CAPTURE_W,
        height: clone.scrollHeight,
      });
      document.body.removeChild(clone);
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = `교양시간표_${comboIdx + 1}.png`;
      document.body.appendChild(link); link.click(); document.body.removeChild(link);
    } finally { setSaving(false); }
  };

  return (
    <div className="flex flex-1 overflow-hidden relative">
      {/* Left panel */}
      <div className={`${panelOpen ? "w-80" : "w-0"} shrink-0 border-r border-gray-200 bg-white flex flex-col overflow-hidden transition-all duration-200 h-full`}>
        {/* 학기 표시 + 로딩 */}
        <div className="px-3 pt-3 pb-2 shrink-0 flex items-center justify-between border-b border-gray-100">
          <span className="text-sm font-medium text-gray-700">{semYear}년 {semTerm === "s" ? "여름" : semTerm === "w" ? "겨울" : `${semTerm}학기`}</span>
          {loading && <span className="text-gray-400 text-xs animate-pulse">불러오는 중...</span>}
          {fetched && !loading && (
            <span className="text-xs text-gray-400">
              {filteredList.length}/{[...openCodes].filter((c) => !conflictCodes.has(c)).length}개 선택 가능
            </span>
          )}
        </div>

        {/* 검색 + 필터 */}
        <div className="px-3 py-2 shrink-0 flex flex-col gap-1.5 border-b border-gray-100">
          <div className="flex gap-1.5">
            <input
              type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="과목명 또는 과목코드 검색..."
              className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
            <button
              onClick={() => setSortAsc((v) => !v)}
              className="shrink-0 border border-gray-300 rounded px-2 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
              title="이름 정렬"
            >
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
        </div>

        {/* 과목 목록 */}
        <div className="overflow-y-auto px-2 py-1 flex-1 min-h-0">
          {!fetched ? (
            <p className="text-xs text-gray-400 text-center py-8">{loading ? "교양 과목 불러오는 중..." : "학기를 선택하면 자동으로 불러옵니다"}</p>
          ) : filteredList.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-8">검색 결과 없음</p>
          ) : (
            filteredList.map((c) => {
              const isSelected = selected.has(c.code);
              const disabled = !isSelected && selected.size >= MAX_SELECT;
              // 체크된 경우 교수별 가능/불가 계산
              const profRows = isSelected
                ? allRows.filter((r) => r.code === c.code)
                : [];
              const profMap = new Map<string, boolean>(); // prof → 가능 여부
              for (const r of profRows) {
                const sec = buildSectionGroups([r]).flat()[0];
                const conflict = sec ? slotsOverlap(sec.times, pinnedSlots) : false;
                for (const prof of (r.prof || "미정").split(",").map((p) => p.trim())) {
                  if (!profMap.has(prof)) profMap.set(prof, !conflict);
                  else if (!conflict) profMap.set(prof, true); // 가능한 분반이 하나라도 있으면 가능
                }
              }
              return (
                <div key={c.code}>
                  <label className={`flex items-start gap-2 px-1 py-1 rounded ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer hover:bg-gray-50"} ${isSelected ? "bg-blue-50" : ""}`}>
                    <input
                      type="checkbox" checked={isSelected} disabled={disabled}
                      onChange={(e) => {
                        if (e.target.checked && selected.size >= MAX_SELECT) return;
                        const next = new Set(selected);
                        e.target.checked ? next.add(c.code) : next.delete(c.code);
                        setSelected(next);
                      }}
                      className="mt-0.5 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-700 leading-tight truncate">{c.name}</p>
                      <p className="text-xs text-gray-400">{c.code} · {c.credit}학점
                        {c.sdg && <span className="ml-1 text-green-600">SDG</span>}
                        {c.hmnts && <span className="ml-1 text-purple-600">인문</span>}
                      </p>
                    </div>
                  </label>
                  {isSelected && profMap.size > 0 && (
                    <div className="ml-6 mb-1 flex flex-col gap-0.5">
                      {[...profMap.entries()].map(([prof, ok]) => (
                        <span key={prof} className={`text-xs px-1.5 py-0.5 rounded ${ok ? "text-green-700 bg-green-50" : "text-red-400 bg-red-50 line-through"}`}>
                          {ok ? "✓" : "✗"} {prof}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {fetched && selected.size > 0 && combos.length > 0 && (
          <p className="text-xs text-gray-500 text-center pb-2">조합 {combos.length}개</p>
        )}
      </div>

      {/* Right: timetable */}
      <div key={flashKey} className="flex-1 flex flex-col overflow-hidden p-4 gap-2 animate-[fadeIn_0.4s_ease] min-w-0 min-h-0">
        <button
          onClick={() => setPanelOpen((v) => !v)}
          className="self-start flex items-center gap-1 text-xs text-gray-500 border border-gray-300 rounded px-2 py-1 hover:bg-gray-50 shrink-0"
        >
          {panelOpen ? "◀ 패널 닫기" : "▶ 패널 열기"}
        </button>

        {combos.length > 0 ? (
          <>
            <div className="flex items-center gap-3 flex-wrap shrink-0">
              <button onClick={() => { setSlideDir("right"); setComboIdx((i) => (i - 1 + combos.length) % combos.length); }} className="px-3 py-1 border border-gray-300 rounded hover:bg-gray-50 text-sm">◀</button>
              <span className="text-sm text-gray-600 w-20 text-center">{comboIdx + 1} / {combos.length}</span>
              <button onClick={() => { setSlideDir("left"); setComboIdx((i) => (i + 1) % combos.length); }} className="px-3 py-1 border border-gray-300 rounded hover:bg-gray-50 text-sm">▶</button>
              <span className="text-sm font-semibold text-blue-600">총 {totalCredit}학점</span>
            </div>
            <div key={`${comboIdx}-${slideDir}`} className={`flex-1 overflow-auto min-h-0 ${slideDir === "left" ? "slide-left" : "slide-right"}`}>
              <TimetableGrid ref={timetableRef} combo={displayCombo} />
            </div>
            <div className="shrink-0 pt-1">
              <button onClick={saveAsImage} disabled={saving} className="w-full py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors">
                {saving ? "저장 중..." : "이미지 저장"}
              </button>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400 text-sm gap-2">
            {!fetched ? (
              <p>왼쪽에서 조회 후 과목을 선택하면 조합이 자동 생성됩니다</p>
            ) : selected.size === 0 ? (
              <p>과목을 선택하면 조합이 자동 생성됩니다</p>
            ) : (
              <p>선택한 과목 조합이 없습니다 (전공 시간표와 모두 충돌)</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
