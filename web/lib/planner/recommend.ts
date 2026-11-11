/**
 * 빈 시간에 넣기 좋은 과목 추천 (규칙 기반 점수) — 교양 탭(교양·일반선택), 전공 탭(내 전공·복수전공)
 *
 * 지금 보고 있는 시간표에 "겹치지 않고 + 조건을 지키며" 들어가는 분반만 후보로 두고, 아래 규칙으로 점수를 매긴다.
 * 점수와 함께 사람이 읽을 수 있는 추천 이유를 돌려준다.
 *
 *  공강 유지   이미 수업 있는 요일에만 들어가면 +30, 비어 있던 평일을 새로 쓰면 요일당 -15, 주말은 -25
 *  다양성      같은 시간대 분반은 최대 2개까지만 추천
 *  빈 시간 채움 같은 날 앞뒤 수업과 30분 안으로 이어지면 +10
 *  긴 공강     넣은 뒤 그날 수업 사이 빈 시간이 2시간을 넘으면 -10
 *  시간대      9시 이전 시작 -8, 18시 이후 종료 -6
 *  정원 여유   (1 - 신청/정원) × 10, 마감 분반은 제외
 *  영역        SDG +3, 인문교양 +3
 */
import { isFull, sectionAllowed, type SectionFilter } from "./data";
import type { Category, Conditions, Course, RawSection, Slot } from "./types";

export type Recommendation = {
  course: Course;
  section: RawSection;
  score: number;
  reasons: string[];
};

const DAY = ["월", "화", "수", "목", "금", "토", "일"];

function overlaps(a: Slot[], b: Slot[]) {
  return a.some(([d, s, e]) => b.some(([d2, s2, e2]) => d === d2 && s < e2 && s2 < e));
}

function maxGapOfDay(segs: [number, number][]): number {
  const sorted = [...segs].sort((a, b) => a[0] - b[0]);
  let gap = 0, end = sorted[0]?.[1] ?? 0;
  for (let i = 1; i < sorted.length; i++) {
    gap = Math.max(gap, sorted[i][0] - end);
    end = Math.max(end, sorted[i][1]);
  }
  return gap;
}

export function recommendFill({
  courses,
  cartCodes,
  busy,
  currentCredit,
  cond,
  filter,
  categories = ["gyoyang", "ilban"],
  includeGrad = false,
  perSection = false,
  limit = 8,
}: {
  courses: Course[];
  cartCodes: Set<string>;
  busy: Slot[];
  currentCredit: number;
  cond: Conditions;
  filter: SectionFilter;
  categories?: Category[];
  includeGrad?: boolean;
  /** true면 과목마다 최고 분반 하나가 아니라, 들어가는 분반을 전부 돌려준다 (검색 추천용, 같은 과목끼리 붙여서) */
  perSection?: boolean;
  limit?: number;
}): Recommendation[] {
  const usedDays = new Set(busy.map(([d]) => d));
  const byDay = new Map<number, [number, number][]>();
  for (const [d, s, e] of busy) {
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d)!.push([s, e]);
  }

  const out: Recommendation[] = [];
  for (const course of courses) {
    if (!categories.includes(course.category) || (course.isGrad && !includeGrad) || cartCodes.has(course.code)) continue;
    if (cond.maxCredit && currentCredit + course.credit > cond.maxCredit) continue;

    let best: Recommendation | null = null;
    for (const sec of course.sections) {
      if (!sec.slots.length || isFull(sec) || !sectionAllowed(sec, filter)) continue;
      if (cond.noRemote && sec.tags.includes("원격")) continue;
      if (sec.profs.some((p) => cond.excludeProfs.includes(p))) continue;
      if (overlaps(sec.slots, busy)) continue;
      if (overlaps(sec.slots, cond.blockedSlots ?? [])) continue;
      if (sec.slots.some(([d, s, e]) => cond.daysOff.includes(d) || (cond.lunchFree && s < 780 && e > 720))) continue;

      let score = 0;
      const reasons: string[] = [];
      const secDays = [...new Set(sec.slots.map(([d]) => d))];
      const newWeekdays = secDays.filter((d) => d <= 4 && !usedDays.has(d));
      const newWeekend = secDays.filter((d) => d >= 5 && !usedDays.has(d));
      if (newWeekdays.length === 0 && newWeekend.length === 0) { score += 30; reasons.push("공강 요일 그대로"); }
      score -= 15 * newWeekdays.length + 25 * newWeekend.length;

      let adjacent = false, longGap = false;
      for (const [d, s, e] of sec.slots) {
        const segs = byDay.get(d) ?? [];
        if (segs.some(([s2, e2]) => Math.abs(s - e2) <= 30 || Math.abs(s2 - e) <= 30)) adjacent = true;
        if (segs.length && maxGapOfDay([...segs, [s, e]]) > 120) longGap = true;
      }
      if (adjacent) { score += 10; reasons.push("앞뒤 수업과 이어짐"); }
      if (longGap) score -= 10;

      const earliest = Math.min(...sec.slots.map(([, s]) => s));
      const latest = Math.max(...sec.slots.map(([, , e]) => e));
      if (earliest < 540) score -= 8;
      if (latest > 1080) score -= 6;

      if (sec.capacity) {
        const ratio = (sec.applied ?? 0) / sec.capacity;
        score += (1 - Math.min(ratio, 1)) * 10;
        if (ratio < 0.7) reasons.push(`정원 여유 ${sec.applied ?? 0}/${sec.capacity}`);
      }
      if (course.tags.includes("SDG")) { score += 3; reasons.push("SDG"); }
      if (course.tags.includes("인문교양")) { score += 3; reasons.push("인문교양"); }
      if (sec.tags.includes("원격")) reasons.push("원격강좌");

      const rec = { course, section: sec, score, reasons };
      if (perSection) out.push(rec);
      else if (!best || score > best.score) best = rec;
    }
    if (best) out.push(best);
  }
  if (perSection) {
    // 과목별 최고 점수 순으로 과목을 세우고, 과목 안에서는 분반 점수순
    const top = new Map<string, number>();
    for (const r of out) top.set(r.course.code, Math.max(top.get(r.course.code) ?? -Infinity, r.score));
    return out
      .sort((a, b) => top.get(b.course.code)! - top.get(a.course.code)! || a.course.code.localeCompare(b.course.code) || b.score - a.score)
      .slice(0, limit);
  }
  // 같은 시간대만 줄줄이 나오지 않게, 시간대마다 최대 2개
  const perSlot = new Map<string, number>();
  const picked: Recommendation[] = [];
  for (const r of out.sort((a, b) => b.score - a.score)) {
    const key = JSON.stringify(r.section.slots);
    if ((perSlot.get(key) ?? 0) >= 2) continue;
    perSlot.set(key, (perSlot.get(key) ?? 0) + 1);
    picked.push(r);
    if (picked.length >= limit) break;
  }
  return picked;
}

export const daysText = (slots: Slot[]) => [...new Set(slots.map(([d]) => DAY[d]))].join("");

/**
 * 후보(점수순) 중에서 n개를 무작위로 고른다. 순위가 높을수록 뽑힐 확률이 높고(가중치 1/(순위+3)),
 * 같은 seed면 같은 결과 → 화면이 다시 그려질 때마다 바뀌지 않고, "다른 추천 보기"를 눌렀을 때만 바뀐다.
 */
export function sampleRecs(pool: Recommendation[], n: number, seed: number): Recommendation[] {
  let a = seed >>> 0;
  const rand = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const left = pool.map((r, i) => ({ r, w: 1 / (i + 3) }));
  const out: Recommendation[] = [];
  while (out.length < n && left.length) {
    let x = rand() * left.reduce((s, o) => s + o.w, 0);
    let k = 0;
    while (k < left.length - 1 && (x -= left[k].w) > 0) k++;
    out.push(left[k].r);
    left.splice(k, 1);
  }
  // 고른 것들은 다시 점수순으로 보여 줌
  return out.sort((p, q) => q.score - p.score);
}

/** 검색어 매칭 (과목명·코드·학과·교수, 공백 무시). 3단계 검색과 검색 추천이 같은 규칙을 쓴다 */
export const normQuery = (q: string) => q.trim().replace(/\s/g, "").toLowerCase();
export const courseMatches = (c: Course, t: string) =>
  `${c.name}${c.code}${c.dept}${c.sections.map((s) => s.profs.join("")).join("")}`.replace(/\s/g, "").toLowerCase().includes(t);
