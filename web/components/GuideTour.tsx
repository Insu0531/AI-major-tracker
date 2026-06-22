"use client";

import { useState, useEffect, useLayoutEffect, useCallback } from "react";

export type TourStep = {
  selector: string;   // 강조할 요소 (data-tour 속성 등 CSS 셀렉터)
  title: string;
  body: string;
};

type Rect = { top: number; left: number; width: number; height: number };

const PAD = 6;          // 스포트라이트 여백
const TIP_W = 320;      // 말풍선 너비
const GAP = 12;         // 말풍선과 대상 사이 간격

export default function GuideTour({
  steps,
  run,
  onClose,
  onClose3Days,
}: {
  steps: TourStep[];
  run: boolean;
  onClose: () => void;
  onClose3Days?: () => void;
}) {
  const [idx, setIdx] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);

  // 투어를 새로 켤 때마다 첫 단계로 + 포커스 해제(포커스된 버튼이 Enter로 재실행되는 것 방지)
  useEffect(() => {
    if (run) {
      setIdx(0);
      (document.activeElement as HTMLElement | null)?.blur();
    }
  }, [run]);

  const measure = useCallback(() => {
    const step = steps[idx];
    if (!step) return;
    const el = document.querySelector(step.selector) as HTMLElement | null;
    if (!el) { setRect(null); return; }
    const r = el.getBoundingClientRect();
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [steps, idx]);

  // 단계 변경 시: 레이아웃 안정화 후 측정
  useLayoutEffect(() => {
    if (!run) return;
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => { raf2 = requestAnimationFrame(measure); });
    return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2); };
  }, [run, idx, measure]);

  // 리사이즈/스크롤 시 재측정
  useEffect(() => {
    if (!run) return;
    const handler = () => measure();
    window.addEventListener("resize", handler);
    window.addEventListener("scroll", handler, true);
    return () => {
      window.removeEventListener("resize", handler);
      window.removeEventListener("scroll", handler, true);
    };
  }, [run, measure]);

  // 키보드 조작 (캡처 단계에서 가로채 페이지 전역 핸들러/포커스된 버튼 재실행 방지)
  useEffect(() => {
    if (!run) return;
    const last = steps.length - 1;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape" && e.key !== "Enter" && e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        // 마지막(안내) 단계가 아니면 건너뛰기 → 마지막 단계로 이동
        if (idx >= last) onClose(); else setIdx(last);
      } else if (e.key === "Enter" || e.key === "ArrowRight") {
        if (idx >= last) onClose(); else setIdx((i) => i + 1);
      } else if (e.key === "ArrowLeft") {
        setIdx((i) => Math.max(0, i - 1));
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [run, idx, steps.length, onClose]);

  if (!run || steps.length === 0) return null;

  const step = steps[idx];
  const isFirst = idx === 0;
  const isLast = idx === steps.length - 1;

  const next = () => { if (isLast) onClose(); else setIdx((i) => i + 1); };
  const prev = () => { if (!isFirst) setIdx((i) => i - 1); };
  // 건너뛰기: 마지막(안내) 단계로 이동, 이미 마지막이면 닫기
  const skip = () => { if (isLast) onClose(); else setIdx(steps.length - 1); };

  // 말풍선 위치 계산
  const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  let tipTop: number;
  let tipLeft: number;
  let placeBelow = true;

  if (rect) {
    placeBelow = rect.top + rect.height + GAP + 160 < vh;
    tipTop = placeBelow ? rect.top + rect.height + GAP : Math.max(GAP, rect.top - GAP - 170);
    tipLeft = rect.left + rect.width / 2 - TIP_W / 2;
    tipLeft = Math.max(GAP, Math.min(tipLeft, vw - TIP_W - GAP));
  } else {
    // 대상을 못 찾으면 화면 중앙
    tipTop = vh / 2 - 90;
    tipLeft = vw / 2 - TIP_W / 2;
  }

  return (
    <div className="fixed inset-0 z-[2000]">
      {/* 클릭 차단 레이어 */}
      <div className="absolute inset-0" onClick={(e) => e.stopPropagation()} />

      {/* 스포트라이트 */}
      {rect && (
        <div
          className="pointer-events-none rounded-lg transition-all duration-200"
          style={{
            position: "fixed",
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            boxShadow: "0 0 0 9999px rgba(17,24,39,0.62)",
            border: "2px solid #818cf8",
          }}
        />
      )}
      {/* 대상이 없을 때도 화면을 살짝 어둡게 */}
      {!rect && <div className="absolute inset-0 bg-gray-900/60" />}

      {/* 말풍선 */}
      <div
        className="fixed bg-white rounded-xl shadow-2xl border border-gray-100 p-4 flex flex-col gap-2"
        style={{ top: tipTop, left: tipLeft, width: TIP_W }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-indigo-500">
            {idx + 1} / {steps.length}
          </span>
          {!isLast && (
            <button
              onClick={skip}
              className="text-gray-300 hover:text-gray-500 text-sm leading-none"
              title="건너뛰기 (Esc)"
            >
              건너뛰기 ✕
            </button>
          )}
        </div>

        <h4 className="text-base font-bold text-gray-800">{step.title}</h4>
        <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{step.body}</p>

        {/* 진행 점 */}
        <div className="flex items-center gap-1 mt-1">
          {steps.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === idx ? "w-4 bg-indigo-500" : "w-1.5 bg-gray-200"
              }`}
            />
          ))}
        </div>

        <div className="flex items-center justify-between mt-2">
          <button
            onClick={prev}
            disabled={isFirst}
            className="text-sm px-3 py-1.5 rounded border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-0 disabled:cursor-default transition"
          >
            이전
          </button>
          <button
            onClick={next}
            className="text-sm px-4 py-1.5 rounded bg-indigo-600 text-white font-medium hover:bg-indigo-700 transition"
          >
            {isLast ? "시작하기" : "다음"}
          </button>
        </div>
        {isLast && onClose3Days && (
          <p className="text-center mt-1">
            <button onClick={onClose3Days} className="text-xs text-gray-400 hover:text-gray-500 underline">
              3일간 다시보지 않기
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
