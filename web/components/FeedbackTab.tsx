"use client";

import { useState, useRef, useEffect } from "react";
import { Major, MAJOR_LABELS, ENTRY_YEAR_MIN, ENTRY_YEAR_MAX } from "@/lib/courses";

const FORM_ACTION =
  "https://docs.google.com/forms/d/e/1FAIpQLSc6VyJCdBAmc2olMVcSBrC2FN0iNMoCqPPXIfQHzE_Ew1145g/formResponse";

const CATEGORIES = ["기능 추가 문의", "버그 신고", "UI/UX(디자인) 개선", "응원"] as const;

export default function FeedbackTab() {
  const [major, setMajor] = useState<Major | null>(null);
  const [majorSearch, setMajorSearch] = useState("");
  const [majorDropOpen, setMajorDropOpen] = useState(false);
  const majorDropRef = useRef<HTMLDivElement>(null);

  const [entryYear, setEntryYear] = useState<number | null>(null);
  const [category, setCategory] = useState<string>("");
  const [content, setContent] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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

  const filteredMajors = Object.entries(MAJOR_LABELS).filter(([, label]) =>
    label.includes(majorSearch)
  ) as [Major, string][];

  const [showConfirm, setShowConfirm] = useState(false);

  const handleSubmitClick = () => {
    if (!category) { setErrorMsg("카테고리를 선택해주세요."); return; }
    if (!agreed) { setErrorMsg("개인정보 수집·이용에 동의해주세요."); return; }
    setShowConfirm(true);
  };

  const handleConfirm = async () => {
    setShowConfirm(false);
    setStatus("sending");
    const body = new FormData();
    if (major) body.append("entry.431703091", MAJOR_LABELS[major]);
    if (entryYear) body.append("entry.308308418", String(entryYear));
    body.append("entry.879413792", category);
    body.append("entry.195170706", content);

    try {
      await fetch(FORM_ACTION, { method: "POST", body, mode: "no-cors" });
      setStatus("done");
      setContent("");
      setCategory("");
      setAgreed(false);
    } catch {
      setStatus("error");
    }
  };

  return (
    <div className="flex-1 overflow-auto p-6 flex justify-center">
      <div className="w-full max-w-lg flex flex-col gap-5">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">피드백/응원</h2>
          <p className="text-xs text-gray-400 mt-0.5">버그 신고, 기능 제안, 응원 메시지를 보내주세요.</p>
        </div>

        {/* 전공 */}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">전공</label>
          <div className="relative" ref={majorDropRef}>
            <button
              type="button"
              onClick={() => setMajorDropOpen((v) => !v)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm text-left flex justify-between items-center hover:bg-gray-50"
            >
              <span className={major ? "text-gray-800" : "text-gray-400"}>{major ? MAJOR_LABELS[major] : "선택"}</span>
              <span className="text-gray-400 text-xs">{majorDropOpen ? "▲" : "▼"}</span>
            </button>
            {majorDropOpen && (
              <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded shadow-lg max-h-60 overflow-y-auto">
                <div className="p-2 border-b border-gray-100">
                  <input
                    type="text"
                    value={majorSearch}
                    onChange={(e) => setMajorSearch(e.target.value)}
                    placeholder="전공 검색..."
                    className="w-full text-sm px-2 py-1 border border-gray-200 rounded focus:outline-none"
                    autoFocus
                  />
                </div>
                {filteredMajors.map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => { setMajor(key); setMajorDropOpen(false); setMajorSearch(""); }}
                    className={`w-full text-left px-3 py-1.5 text-sm hover:bg-indigo-50 ${major === key ? "text-indigo-600 font-medium" : "text-gray-700"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 학번 */}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">학번 (입학년도)</label>
          <select
            value={entryYear ?? ""}
            onChange={(e) => setEntryYear(e.target.value ? Number(e.target.value) : null)}
            className="border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
          >
            <option value="">선택</option>
            {Array.from({ length: ENTRY_YEAR_MAX - ENTRY_YEAR_MIN + 1 }, (_, i) => ENTRY_YEAR_MIN + i)
              .map((y) => (
                <option key={y} value={y}>{y}학번</option>
              ))}
          </select>
        </div>

        {/* 카테고리 */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-gray-700">카테고리 <span className="text-red-400">*</span></label>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(cat)}
                className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                  category === cat
                    ? "bg-indigo-600 text-white border-indigo-600"
                    : "border-gray-300 text-gray-600 hover:bg-gray-50"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* 내용 */}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">내용</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="자유롭게 작성해주세요."
            rows={5}
            className="border border-gray-300 rounded px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-indigo-400"
          />
        </div>

        {/* 개인정보 안내 */}
        <div className="bg-gray-50 border border-gray-200 rounded p-3 text-xs text-gray-500 leading-relaxed">
          <p className="font-semibold text-gray-600 mb-1">개인정보 수집·이용 안내</p>
          <p>· 수집 항목: 전공, 입학년도, 문의 내용</p>
          <p>· 수집 목적: 서비스 개선 및 문의 답변</p>
          <p>· 보유 기간: 목적 달성 후 파기</p>
          <p className="mt-1">위 내용에 동의하지 않으실 경우 제출하지 않으셔도 됩니다.</p>
        </div>

        {/* 동의 체크박스 */}
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
          개인정보 수집·이용에 동의합니다.
        </label>

        {/* 제출 버튼 */}
        {status === "done" ? (
          <div className="flex flex-col items-center gap-2 py-6 animate-[fadeIn_0.4s_ease]">
            <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center text-3xl animate-[bounceIn_0.5s_ease]">
              ✓
            </div>
            <p className="text-green-600 font-semibold text-base">제출 완료!</p>
            <p className="text-gray-400 text-sm">소중한 의견 감사합니다.</p>
            <button
              onClick={() => setStatus("idle")}
              className="mt-2 text-xs text-gray-400 hover:text-gray-600 underline"
            >
              다시 작성하기
            </button>
          </div>
        ) : (
          <button
            onClick={handleSubmitClick}
            disabled={status === "sending"}
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            {status === "sending" ? "전송 중..." : "제출하기"}
          </button>
        )}
        {status === "error" && (
          <p className="text-xs text-red-500 text-center">전송에 실패했습니다. 다시 시도해주세요.</p>
        )}

        {/* 유효성 오류 모달 */}
        {errorMsg && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
            <div className="bg-white rounded-xl shadow-xl px-6 py-5 flex flex-col gap-4 w-80 max-w-[90vw]">
              <p className="text-sm font-semibold text-gray-800 text-center">{errorMsg}</p>
              <button
                onClick={() => setErrorMsg(null)}
                className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg"
              >
                확인
              </button>
            </div>
          </div>
        )}

        {/* 제출 확인 모달 */}
        {showConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
            <div className="bg-white rounded-xl shadow-xl px-6 py-5 flex flex-col gap-4 w-80 max-w-[90vw]">
              <p className="text-sm font-semibold text-gray-800 text-center">제출하시겠습니까?</p>
              <p className="text-xs text-gray-500 text-center">제출 후에는 수정이 불가능합니다.</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowConfirm(false)}
                  className="flex-1 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
                >
                  취소
                </button>
                <button
                  onClick={handleConfirm}
                  className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg"
                >
                  예
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
