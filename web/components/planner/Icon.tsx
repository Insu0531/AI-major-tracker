/**
 * 아이콘 한 벌 (선 굵기 2, 24 격자, 글자 크기를 따라감). 예전엔 ‹ › × ▾ ✓ ↻ 같은 글자 기호를 섞어 써서 굵기·크기가 제각각이었다.
 * 장식용이라 aria-hidden — 뜻은 버튼의 글자나 aria-label로 전달한다.
 */
const PATHS = {
  close: "M6 6l12 12M18 6L6 18",
  left: "M15 5l-7 7 7 7",
  right: "M9 5l7 7-7 7",
  down: "M5 9l7 7 7-7",
  up: "M5 15l7-7 7 7",
  check: "M5 12.5l4.5 4.5L19 7.5",
  plus: "M12 5v14M5 12h14",
  refresh: "M20 12a8 8 0 1 1-2.34-5.66M20 4v5h-5",
  spark: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z",
  arrowUp: "M12 19V5M6 11l6-6 6 6",
  arrowDown: "M12 5v14M6 13l6 6 6-6",
} as const;

export type IconName = keyof typeof PATHS;

export default function Icon({ name, size = "1em", className }: { name: IconName; size?: number | string; className?: string }) {
  return (
    <svg className={`pl-icon${className ? ` ${className}` : ""}`} width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
      <path d={PATHS[name]} />
    </svg>
  );
}
