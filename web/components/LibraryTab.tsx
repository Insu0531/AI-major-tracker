"use client";

import { useState, useEffect, useRef } from "react";
import { SavedTimetable, loadSavedTimetables, deleteTimetable, renameTimetable } from "@/lib/timetableStorage";
import { Section, NoTimeSection } from "@/lib/timetable";
import TimetableGrid from "@/components/TimetableGrid";

// Matches TimetableGrid internals: LABEL_W=36, MIN_COL_W=52, 5 days, rowH=52, START_H=9
const NATURAL_W = 296;
const NATURAL_H = 730;   // enough for TimetableGrid h-full to not overflow-scroll
const SCALE = 0.9;
const THUMB_W = Math.round(NATURAL_W * SCALE);       // 266
const THUMB_H = Math.round((28 + 10 * 52) * SCALE); // 493 — clips at ~7pm

export default function LibraryTab() {
  const [list, setList] = useState<SavedTimetable[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [preview, setPreview] = useState<SavedTimetable | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);

  useEffect(() => { setList(loadSavedTimetables()); }, []);

  const handleDelete = (id: string) => {
    deleteTimetable(id);
    setList(loadSavedTimetables());
    setDeleteConfirm(null);
  };

  const handleBulkDelete = () => {
    selected.forEach((id) => deleteTimetable(id));
    setList(loadSavedTimetables());
    setSelected(new Set());
    setSelectMode(false);
    setBulkDeleteConfirm(false);
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelected(new Set());
  };

  const handleRename = (id: string) => {
    if (editName.trim()) { renameTimetable(id, editName.trim()); setList(loadSavedTimetables()); }
    setEditingId(null);
  };

  const semLabel = (sem: string) => {
    const [year, term] = sem.split("-");
    const m: Record<string, string> = { "1": "1학기", "2": "2학기", s: "여름", w: "겨울" };
    return `${year}년 ${m[term] ?? term}`;
  };

  if (list.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-gray-400">
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none"><rect x="8" y="6" width="32" height="36" rx="4" stroke="#d1d5db" strokeWidth="2.5"/><path d="M16 16h16M16 22h16M16 28h10" stroke="#d1d5db" strokeWidth="2" strokeLinecap="round"/></svg>
        <p className="text-sm">저장된 시간표가 없습니다.</p>
        <p className="text-xs text-gray-300">마법사 탭에서 시간표를 저장해보세요.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-4">
      <div className="flex items-center justify-between mb-4">
        {selectMode ? (
          <>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={selected.size === list.length && list.length > 0}
                onChange={(e) => setSelected(e.target.checked ? new Set(list.map((t) => t.id)) : new Set())}
                className="w-4 h-4 rounded accent-indigo-600 cursor-pointer"
              />
              <span className="text-sm text-gray-600">
                {selected.size > 0 ? `${selected.size}개 선택됨` : "전체 선택"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => selected.size > 0 && setBulkDeleteConfirm(true)}
                disabled={selected.size === 0}
                className="text-xs px-3 py-1.5 bg-red-500 hover:bg-red-600 disabled:opacity-40 text-white rounded-lg transition-colors"
              >
                {selected.size > 0 ? `${selected.size}개 삭제` : "삭제"}
              </button>
              <button onClick={exitSelectMode} className="text-xs px-3 py-1.5 border border-gray-300 text-gray-600 hover:bg-gray-50 rounded-lg transition-colors">
                취소
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-base font-bold text-gray-800">저장된 시간표 <span className="text-xs font-normal text-gray-400">{list.length}개</span></h2>
            <button onClick={() => setSelectMode(true)} className="text-xs px-3 py-1.5 border border-gray-300 text-gray-600 hover:bg-gray-50 rounded-lg transition-colors">
              선택 삭제
            </button>
          </>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        {list.map((t) => {
          const fullCombo: Section[] = [...(t.pinnedCombo ?? []), ...(t.gyoyangCombo ?? [])];
          const isSelected = selected.has(t.id);

          return (
            <div
              key={t.id}
              style={{ width: THUMB_W }}
              className={`bg-white border rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all flex flex-col ${isSelected ? "border-indigo-500 ring-2 ring-indigo-400" : "border-gray-200"}`}
            >
              {/* 시간표 썸네일 */}
              <div
                className="overflow-hidden relative bg-white cursor-pointer"
                style={{ width: THUMB_W, height: THUMB_H }}
                onClick={() => selectMode ? toggleSelect(t.id) : setPreview(t)}
              >
                <div className="pointer-events-none" style={{
                  width: NATURAL_W,
                  height: NATURAL_H,
                  transform: `scale(${SCALE})`,
                  transformOrigin: "top left",
                  position: "absolute",
                  top: 0,
                  left: 0,
                }}>
                  <TimetableGrid combo={fullCombo} />
                </div>
                {/* 선택 모드 오버레이 */}
                {selectMode && (
                  <div className={`absolute inset-0 transition-colors ${isSelected ? "bg-indigo-600/20" : "bg-black/0 hover:bg-black/5"}`}>
                    <div className={`absolute top-2 right-2 w-5 h-5 rounded-full border-2 flex items-center justify-center ${isSelected ? "bg-indigo-600 border-indigo-600" : "bg-white border-gray-400"}`}>
                      {isSelected && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                    </div>
                  </div>
                )}
              </div>

              {/* 이름 + 보기/삭제 */}
              <div className="px-2.5 pt-2 pb-2.5 border-t border-gray-100 flex flex-col gap-2">
                {!selectMode && editingId === t.id ? (
                  <>
                    <input
                      autoFocus
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleRename(t.id); if (e.key === "Escape") setEditingId(null); }}
                      className="border border-indigo-300 rounded px-2 py-1 text-xs w-full focus:outline-none focus:ring-1 focus:ring-indigo-400"
                    />
                    <div className="flex gap-1.5">
                      <button onClick={() => handleRename(t.id)} className="flex-1 py-1 text-xs bg-indigo-600 hover:bg-indigo-700 text-white rounded transition-colors">저장</button>
                      <button onClick={() => setEditingId(null)} className="flex-1 py-1 text-xs border border-gray-200 text-gray-500 hover:bg-gray-50 rounded transition-colors">취소</button>
                    </div>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => !selectMode && (setEditingId(t.id), setEditName(t.name))}
                      className={`text-left text-xs font-semibold leading-snug transition-colors ${selectMode ? "text-gray-700 cursor-default" : "text-gray-700 hover:text-indigo-600"}`}
                      title={selectMode ? undefined : "클릭하여 이름 수정"}
                    >
                      {t.name}
                    </button>
                    {!selectMode && (
                      <div className="flex gap-1.5">
                        <button onClick={() => setPreview(t)} className="flex-1 py-1 text-xs bg-indigo-600 hover:bg-indigo-700 text-white rounded transition-colors">보기</button>
                        <button onClick={() => setDeleteConfirm(t.id)} className="flex-1 py-1 text-xs border border-gray-200 hover:border-red-300 hover:text-red-500 text-gray-400 rounded transition-colors">삭제</button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 삭제 확인 모달 */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-xl shadow-xl px-6 py-5 flex flex-col gap-4 w-80 max-w-[90vw]">
            <p className="text-sm font-semibold text-gray-800 text-center">시간표를 삭제하시겠습니까?</p>
            <p className="text-xs text-gray-500 text-center">삭제 후 복구할 수 없습니다.</p>
            <div className="flex gap-2">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">취소</button>
              <button onClick={() => handleDelete(deleteConfirm)} className="flex-1 py-2 bg-red-500 hover:bg-red-600 text-white text-sm font-semibold rounded-lg">삭제</button>
            </div>
          </div>
        </div>
      )}

      {/* 일괄삭제 확인 모달 */}
      {bulkDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-xl shadow-xl px-6 py-5 flex flex-col gap-4 w-80 max-w-[90vw]">
            <p className="text-sm font-semibold text-gray-800 text-center">{selected.size}개의 시간표를 삭제하시겠습니까?</p>
            <p className="text-xs text-gray-500 text-center">삭제 후 복구할 수 없습니다.</p>
            <div className="flex gap-2">
              <button onClick={() => setBulkDeleteConfirm(false)} className="flex-1 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">취소</button>
              <button onClick={handleBulkDelete} className="flex-1 py-2 bg-red-500 hover:bg-red-600 text-white text-sm font-semibold rounded-lg">삭제</button>
            </div>
          </div>
        </div>
      )}

      {/* 시간표 미리보기 모달 */}
      {preview && <PreviewModal timetable={preview} onClose={() => setPreview(null)} semLabel={semLabel} />}
    </div>
  );
}

function PreviewModal({ timetable, onClose, semLabel }: { timetable: SavedTimetable; onClose: () => void; semLabel: (s: string) => string }) {
  const timetableRef = useRef<HTMLDivElement | null>(null);
  const [saving, setSaving] = useState(false);
  const [regOpen, setRegOpen] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const fullCombo: Section[] = [...(timetable.pinnedCombo ?? []), ...(timetable.gyoyangCombo ?? [])];
  const noTimeSections: NoTimeSection[] = [
    ...(timetable.pinnedNoTimeSections ?? []),
    ...(timetable.gyoyangNoTimeSections ?? []),
  ];

  const regCourses = [
    ...fullCombo.map((s) => ({ crseNo: s.crseNo, name: s.name, credit: s.credit })),
    ...noTimeSections.map((s) => ({ crseNo: s.crseNo, name: s.name, credit: s.credit })),
  ];

  const saveImage = async () => {
    if (!timetableRef.current) return;
    setSaving(true);
    try {
      const domtoimage = (await import("dom-to-image-more")).default;
      const el = timetableRef.current;
      const isDark = document.documentElement.classList.contains("dark");
      const clone = el.cloneNode(true) as HTMLElement;
      clone.style.cssText = "position:fixed;left:-9999px;top:0;width:900px;height:auto;overflow:visible;";
      document.body.appendChild(clone);
      const dataUrl = await domtoimage.toPng(clone, { bgcolor: isDark ? "#171717" : "#ffffff", scale: 3, width: 900, height: clone.scrollHeight });
      document.body.removeChild(clone);
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = `${timetable.name}.png`;
      document.body.appendChild(link); link.click(); document.body.removeChild(link);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl flex flex-col w-[96vw] max-w-3xl max-h-[92vh]">
        {/* 헤더 */}
        <div className="px-5 pt-4 pb-3 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div>
            <p className="font-bold text-gray-800">{timetable.name}</p>
            <p className="text-xs text-gray-400 mt-0.5">{timetable.majorLabel} · {semLabel(timetable.sem)}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl px-1">✕</button>
        </div>

        {/* 시간표 */}
        <div className="flex-1 overflow-auto px-4 py-3 min-h-0">
          <div ref={timetableRef}>
            <TimetableGrid combo={fullCombo} />
            {noTimeSections.length > 0 && (
              <div className="mt-3 border border-orange-200 bg-orange-50 rounded-lg px-4 py-3 flex flex-wrap gap-x-4 gap-y-2">
                <span className="text-sm font-semibold text-orange-600 w-full">시간 외</span>
                {noTimeSections.map((s, i) => (
                  <span key={i} className="text-sm text-orange-700">
                    {s.name}{s.profs?.length === 1 && <span className="text-orange-500"> · {s.profs[0]}</span>}
                    <span className="text-orange-400 text-xs"> ({s.credit}학점)</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 하단 버튼 */}
        <div className="px-5 pb-4 pt-3 border-t border-gray-100 shrink-0">
          <div className="flex gap-2">
            <button onClick={saveImage} disabled={saving}
              className="flex-1 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors">
              {saving ? "저장 중..." : "이미지 저장"}
            </button>
            <button onClick={() => setRegOpen(true)}
              className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition-colors">
              수강신청하기
            </button>
          </div>
        </div>
      </div>

      {/* 수강신청 코드 모달 */}
      {regOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl flex flex-col max-w-lg w-[92vw] max-h-[80vh]">
            <div className="px-6 pt-5 pb-3 border-b border-gray-100 flex items-center justify-between shrink-0">
              <div>
                <p className="text-base font-bold text-gray-800">수강신청 과목 목록</p>
                <p className="text-xs text-gray-400 mt-0.5">과목코드를 클립보드에 복사하세요</p>
              </div>
              <button onClick={() => { setRegOpen(false); setCopiedCode(null); }} className="text-gray-400 hover:text-gray-600 text-xl px-1">✕</button>
            </div>
            <div className="overflow-y-auto flex-1 px-6 py-4 flex flex-col gap-2">
              {regCourses.map((c) => {
                const code = c.crseNo.replace(/-/g, "");
                const isCopied = copiedCode === code;
                return (
                  <div key={c.crseNo} className="flex items-center gap-3">
                    <button
                      onClick={() => { navigator.clipboard.writeText(code).then(() => { setCopiedCode(code); setTimeout(() => setCopiedCode(null), 2000); }); }}
                      className={`shrink-0 w-28 py-1.5 rounded-lg text-sm font-mono font-bold transition-all duration-200 ${isCopied ? "bg-green-500 text-white" : "bg-indigo-50 hover:bg-indigo-100 text-indigo-600 border border-indigo-200"}`}
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
              <p className="text-xs text-gray-400 text-center">코드를 눌러 하나씩 복사하세요.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
