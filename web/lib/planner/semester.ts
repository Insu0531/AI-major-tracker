// 학기 표기·순서·기본 학기 (scripts/collect-sections.mjs의 defaultSems와 같은 규칙)

export const TERMS = ["1", "s", "2", "w"] as const;
export const TERM_LABEL: Record<string, string> = { "1": "1학기", s: "여름계절", "2": "2학기", w: "겨울계절" };

export const semLabel = (sem: string) => {
  const [y, t] = sem.split("-");
  return `${y}년 ${TERM_LABEL[t] ?? t}`;
};

/** 시간순 정렬 키: 1학기 < 여름계절 < 2학기 < 겨울계절 < 다음 해 1학기 */
export const semOrder = (sem: string) => {
  const [y, t] = sem.split("-");
  return Number(y) * 10 + TERMS.indexOf(t as (typeof TERMS)[number]);
};

export const sortSems = (sems: string[]) => [...sems].sort((a, b) => semOrder(a) - semOrder(b));

/**
 * 지금 수강신청을 준비할 학기 (학사일정상 신청 시기에 '얼추' 맞춤)
 * 4~6월 여름계절 · 7~9월 2학기 · 10~11월 겨울계절 · 12~3월 1학기
 */
export function recommendedSem(now = new Date()): string {
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  if (m >= 4 && m <= 6) return `${y}-s`;
  if (m >= 7 && m <= 9) return `${y}-2`;
  if (m >= 10 && m <= 11) return `${y}-w`;
  if (m === 12) return `${y + 1}-1`;
  return `${y}-1`;
}

/** 추천 학기 데이터가 아직 없으면, 그 이전 학기 중 가장 최근 것 */
export function pickDefaultSem(available: string[], now = new Date()): string | null {
  if (!available.length) return null;
  const rec = recommendedSem(now);
  if (available.includes(rec)) return rec;
  const sorted = sortSems(available);
  const before = sorted.filter((s) => semOrder(s) <= semOrder(rec));
  return before.length ? before[before.length - 1] : sorted[0];
}

/**
 * 실제로 불러올 학기 데이터. 고른 학기 데이터가 아직 없으면(예: 2027년 1학기)
 * 같은 학기의 가장 최근 해(2026년 1학기) → 없으면 그 이전 가장 최근 학기 → 없으면 가장 최근 학기로 대신 보여 준다.
 */
export function dataSemFor(target: string, available: string[]): string | null {
  if (!available.length) return null;
  if (available.includes(target)) return target;
  const term = target.split("-")[1];
  const sorted = sortSems(available);
  const sameTerm = sorted.filter((s) => s.endsWith(`-${term}`) && semOrder(s) < semOrder(target));
  if (sameTerm.length) return sameTerm[sameTerm.length - 1];
  const before = sorted.filter((s) => semOrder(s) < semOrder(target));
  return before.length ? before[before.length - 1] : sorted[sorted.length - 1];
}
