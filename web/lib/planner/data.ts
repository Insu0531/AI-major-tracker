import type { CartItem, Category, Course, EngineGroup, EngineOption, RawSection, Snapshot, SnapshotIndex } from "./types";

export async function loadIndex(): Promise<SnapshotIndex | null> {
  try {
    const res = await fetch("/data/index.json", { cache: "no-cache" });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

export async function loadSnapshot(sem: string): Promise<Snapshot | null> {
  try {
    const res = await fetch(`/data/sections/${sem}.json`);
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

/** 이수체계: 과목코드 → 권장 학년. 그 학번 파일이 없으면 가까운 학번(이전 우선) 것을 쓴다. */
export async function loadCurriculum(major: string, entryYear: number, years?: number[]): Promise<Map<string, string>> {
  const candidates = years?.length
    ? [...years].sort((a, b) => Math.abs(a - entryYear) - Math.abs(b - entryYear) || a - b)
    : [entryYear, entryYear - 1, entryYear - 2, entryYear + 1];
  for (const y of candidates) {
    try {
      const res = await fetch(`/courses/${major}/${y}.json`);
      if (!res.ok) continue;
      const list = (await res.json()) as { code: string; grade: string }[];
      return new Map(list.map((c) => [c.code, c.grade]));
    } catch { /* 다음 연도 */ }
  }
  return new Map();
}

const GYOYANG_TYPES = new Set(["교양", "기본소양", "기초공통"]);

function categorize(s: RawSection, mine: Map<string, string>, extra: Map<string, string>): Category {
  if (mine.has(s.code)) return "major";
  if (extra.has(s.code)) return "major2";
  if (s.type === "교직") return "kyoshik";
  if (s.type === "일반선택" || s.tags.includes("KNU미래설계")) return "ilban";
  if (GYOYANG_TYPES.has(s.type)) return "gyoyang";
  return "other";
}

export function buildCourses(sections: RawSection[], mine: Map<string, string>, extra: Map<string, string>): Course[] {
  const map = new Map<string, Course>();
  for (const s of sections) {
    let c = map.get(s.code);
    if (!c) {
      c = {
        code: s.code,
        name: s.name,
        credit: s.credit,
        type: s.type,
        category: categorize(s, mine, extra),
        grade: mine.get(s.code) ?? extra.get(s.code) ?? s.grade,
        dept: s.dept,
        isGrad: s.college.includes("대학원"),
        tags: [],
        sections: [],
      };
      map.set(s.code, c);
    }
    c.sections.push(s);
    for (const t of s.tags) if (!c.tags.includes(t)) c.tags.push(t);
    if (!s.college.includes("대학원")) c.isGrad = false;
  }
  return [...map.values()];
}

export type SectionFilter = { campuses: string[]; onlyOpen: boolean };

/** 정원이 다 찼는지 (정원 정보가 없으면 판단하지 않음) */
export const isFull = (s: RawSection) => !!s.capacity && (s.applied ?? 0) >= s.capacity;

export function sectionAllowed(s: RawSection, f: SectionFilter): boolean {
  if (f.onlyOpen && isFull(s)) return false;
  // 캠퍼스 정보가 없는(시간 미정 등) 분반은 항상 허용
  return !s.campus || f.campuses.includes(s.campus);
}

/** 장바구니 → 엔진 입력. 같은 시간대 분반은 하나의 선택지로 묶는다. */
export function buildEngineGroups(cart: CartItem[], courseByCode: Map<string, Course>, f: SectionFilter): EngineGroup[] {
  const groups: EngineGroup[] = [];
  for (const item of cart) {
    const course = courseByCode.get(item.code);
    if (!course) continue;
    let secs = course.sections.filter((s) => sectionAllowed(s, f) && !item.excluded.includes(s.id));
    if (item.pinned) secs = secs.filter((s) => s.id === item.pinned);
    const byKey = new Map<string, EngineOption>();
    for (const s of secs) {
      const key = JSON.stringify(s.slots);
      let o = byKey.get(key);
      if (!o) { o = { key, slots: s.slots, sections: [] }; byKey.set(key, o); }
      o.sections.push({ id: s.id, profs: s.profs, room: s.room, applied: s.applied, capacity: s.capacity, remote: s.tags.includes("원격") });
    }
    groups.push({ code: course.code, name: course.name, credit: course.credit, must: item.mode === "must", options: [...byKey.values()] });
  }
  return groups;
}

export const DAY_NAMES = ["월", "화", "수", "목", "금", "토", "일"];

/** 같은 요일에 붙어 있거나 겹치는 시간을 하나로 합침 (학교 데이터는 연강을 여러 칸으로 나눠 줌) */
export function mergeSlots(slots: [number, number, number][]): [number, number, number][] {
  const sorted = [...slots].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const out: [number, number, number][] = [];
  for (const [d, s, e] of sorted) {
    const last = out[out.length - 1];
    if (last && last[0] === d && s <= last[2]) last[2] = Math.max(last[2], e);
    else out.push([d, s, e]);
  }
  return out;
}

/** 요일 패턴 요약: 분반들의 시간 → "월수 · 화목" */
export function dayPatterns(slotLists: [number, number, number][][]): string {
  const pats = new Set<string>();
  for (const sl of slotLists) {
    if (!sl.length) continue;
    pats.add([...new Set(sl.map(([d]) => d))].sort().map((d) => DAY_NAMES[d]).join(""));
  }
  return [...pats].join(" · ");
}

export const fmtMin = (m: number) => `${Math.floor(m / 60)}:${String(Math.round(m % 60)).padStart(2, "0")}`;

/** [[0,540,630],[2,540,630]] → "월·수 9:00~10:30" (같은 시간대는 요일을 묶음) */
export function formatSlots(slots: [number, number, number][]): string {
  if (!slots.length) return "시간 미정";
  const byTime = new Map<string, number[]>();
  for (const [d, s, e] of mergeSlots(slots)) {
    const k = `${fmtMin(s)}~${fmtMin(e)}`;
    if (!byTime.has(k)) byTime.set(k, []);
    byTime.get(k)!.push(d);
  }
  return [...byTime.entries()].map(([t, ds]) => `${ds.map((d) => DAY_NAMES[d]).join("·")} ${t}`).join(", ");
}

/**
 * 시간표 블록 색: OKLCH 같은 밝기(L 0.605)·채도(C 0.11)에서 색상만 돌려 만든 12색.
 * 화면의 차분한 뉴트럴과 어울리고, 모두 흰 글씨가 읽히는 밝기. 담은 순서대로 배정해 한 시간표 안에서 겹치지 않게 한다.
 */
export const PALETTE = [
  "#bb6660", "#b46e3c", "#a07c25", "#5c9251", "#15977e", "#0092ab",
  "#4a86c1", "#7b77c1", "#9a6daf", "#b2658b", "#808934", "#b9694d"
];
export const colorAt = (i: number) => PALETTE[((i % PALETTE.length) + PALETTE.length) % PALETTE.length];

/** 담은 순서가 없을 때(보관함 등) 쓰는 과목코드 기반 색 */
export function colorFor(code: string): string {
  let h = 0;
  for (let i = 0; i < code.length; i++) h = (h * 31 + code.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
