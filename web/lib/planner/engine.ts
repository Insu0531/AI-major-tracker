/**
 * 시간표 조합 엔진 (순수 함수, Web Worker에서 실행)
 *
 * - 필수(must) 과목은 반드시 1개 분반 선택, 후보(maybe) 과목은 선택 또는 미포함
 * - 시간 충돌: 요일별 32비트 마스크 (07:00~23:00, 30분 단위) → AND 한 번으로 검사
 * - 백트래킹 + 가지치기 (학점 상한/하한, 조건 위반 분반 사전 제거)
 * - 결과는 정렬 기준 상위 LIMIT개만 힙으로 유지 (전체 조합을 메모리에 쌓지 않음)
 * - "더 넣을 수 있는데 뺀" 조합은 제외 (후보 과목 중 충돌 없이 추가 가능한 게 남아 있으면 버림)
 */
import type { ComboMetrics, Conditions, EngineGroup, EngineOption, EngineResult, Slot, SortKey } from "./types";

const BASE_MIN = 7 * 60;
const UNIT = 30;
const UNITS = 32;
export const RESULT_LIMIT = 300;
const NODE_LIMIT = 4_000_000;

export function slotsToMask(slots: Slot[]): number[] {
  const mask = [0, 0, 0, 0, 0, 0, 0];
  for (const [day, start, end] of slots) {
    const a = Math.max(0, Math.floor((start - BASE_MIN) / UNIT));
    const b = Math.min(UNITS, Math.ceil((end - BASE_MIN) / UNIT));
    for (let u = a; u < b; u++) mask[day] |= 1 << u;
  }
  return mask;
}

type PreparedOption = { idx: number; mask: number[]; opt: EngineOption };
type PreparedGroup = { g: EngineGroup; origIdx: number; options: PreparedOption[] };

function optionPassesConditions(opt: EngineOption, c: Conditions): EngineOption | null {
  for (const [day, start, end] of opt.slots) {
    if (c.daysOff.includes(day)) return null;
    if (c.startAfter && start < c.startAfter) return null;
    if (c.endBefore && end > c.endBefore) return null;
  }
  if (c.excludeProfs.length) {
    const sections = opt.sections.filter((s) => !s.profs.some((p) => c.excludeProfs.includes(p)));
    if (!sections.length) return null;
    if (sections.length !== opt.sections.length) return { ...opt, sections };
  }
  return opt;
}

export function computeMetrics(chosen: { credit: number; opt: EngineOption }[]): ComboMetrics {
  const byDay = new Map<number, [number, number][]>();
  let credit = 0;
  let ratioSum = 0;
  let ratioN = 0;
  for (const { credit: cr, opt } of chosen) {
    credit += cr;
    for (const [d, s, e] of opt.slots) {
      if (!byDay.has(d)) byDay.set(d, []);
      byDay.get(d)!.push([s, e]);
    }
    let applied = 0, cap = 0;
    for (const s of opt.sections) { applied += s.applied ?? 0; cap += s.capacity ?? 0; }
    if (cap > 0) { ratioSum += applied / cap; ratioN++; }
  }
  let startSum = 0, endSum = 0, gap = 0, weekdaysUsed = 0;
  for (const [d, segs] of byDay) {
    if (d <= 4) weekdaysUsed++;
    segs.sort((a, b) => a[0] - b[0]);
    startSum += segs[0][0];
    let last = segs[0][1];
    for (let i = 1; i < segs.length; i++) {
      if (segs[i][0] > last) gap += segs[i][0] - last;
      last = Math.max(last, segs[i][1]);
    }
    endSum += last;
  }
  const n = byDay.size || 1;
  return {
    credit,
    freeDays: 5 - weekdaysUsed,
    avgStart: byDay.size ? startSum / n : 0,
    avgEnd: byDay.size ? endSum / n : 0,
    gapMinutes: gap,
    competition: ratioN ? ratioSum / ratioN : 0,
    courseCount: chosen.length,
  };
}

/** a가 b보다 "좋으면" 음수 */
export function compareMetrics(a: ComboMetrics, b: ComboMetrics, sort: SortKey): number {
  const by = (...diffs: number[]) => { for (const d of diffs) if (d !== 0) return d; return 0; };
  switch (sort) {
    case "freeDays": return by(b.freeDays - a.freeDays, a.gapMinutes - b.gapMinutes, b.credit - a.credit);
    case "lateStart": return by(b.avgStart - a.avgStart, a.gapMinutes - b.gapMinutes);
    case "earlyEnd": return by(a.avgEnd - b.avgEnd, a.gapMinutes - b.gapMinutes);
    case "gaps": return by(a.gapMinutes - b.gapMinutes, b.freeDays - a.freeDays);
    case "credit": return by(b.credit - a.credit, b.freeDays - a.freeDays, a.gapMinutes - b.gapMinutes);
    case "recommended":
    default: return by(recommendScore(b) - recommendScore(a));
  }
}

function recommendScore(m: ComboMetrics): number {
  const early = Math.max(0, 9.5 * 60 - m.avgStart) / 30;   // 9시 반 이전 시작 패널티
  const late = Math.max(0, m.avgEnd - 18 * 60) / 30;       // 18시 이후 종료 패널티
  return m.credit * 3 + m.freeDays * 8 - m.gapMinutes / 30 - early * 2 - late * 2;
}

/** 크기 제한 힙: 가장 나쁜 결과가 루트 */
class WorstHeap {
  items: EngineResult[] = [];
  private limit: number;
  private cmp: (a: EngineResult, b: EngineResult) => number;
  constructor(limit: number, cmp: (a: EngineResult, b: EngineResult) => number) {
    this.limit = limit;
    this.cmp = cmp;
  }
  // cmp(a,b) > 0 이면 a가 더 나쁨 → 루트로
  private worse(i: number, j: number) { return this.cmp(this.items[i], this.items[j]) > 0; }
  push(r: EngineResult) {
    if (this.items.length < this.limit) {
      this.items.push(r);
      let i = this.items.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (!this.worse(i, p)) break;
        [this.items[i], this.items[p]] = [this.items[p], this.items[i]];
        i = p;
      }
      return;
    }
    if (this.cmp(r, this.items[0]) >= 0) return; // 루트보다 나쁘거나 같으면 버림
    this.items[0] = r;
    let i = 0;
    for (;;) {
      const l = i * 2 + 1, rr = l + 1;
      let w = i;
      if (l < this.items.length && this.worse(l, w)) w = l;
      if (rr < this.items.length && this.worse(rr, w)) w = rr;
      if (w === i) break;
      [this.items[i], this.items[w]] = [this.items[w], this.items[i]];
      i = w;
    }
  }
}

export function runEngine(groups: EngineGroup[], cond: Conditions) {
  const t0 = Date.now();
  const emptyMust: string[] = [];

  const prepared: PreparedGroup[] = groups.map((g, origIdx) => {
    const options: PreparedOption[] = [];
    g.options.forEach((o, idx) => {
      const ok = optionPassesConditions(o, cond);
      if (ok) options.push({ idx, mask: slotsToMask(ok.slots), opt: ok });
    });
    return { g, origIdx, options };
  });
  for (const p of prepared) if (p.g.must && p.options.length === 0) emptyMust.push(p.g.name);
  if (emptyMust.length) return { results: [], total: 0, truncated: false, ms: Date.now() - t0, emptyMust };

  // 필수 먼저(선택지 적은 순), 후보는 뒤에
  const order = prepared
    .filter((p) => p.options.length > 0)
    .sort((a, b) => (a.g.must === b.g.must ? a.options.length - b.options.length : a.g.must ? -1 : 1));
  const n = order.length;
  const maxC = cond.maxCredit > 0 ? cond.maxCredit : Infinity;
  const minC = cond.minCredit > 0 ? cond.minCredit : 0;
  const suffixCredit = new Array(n + 1).fill(0);
  for (let i = n - 1; i >= 0; i--) suffixCredit[i] = suffixCredit[i + 1] + order[i].g.credit;

  const heap = new WorstHeap(RESULT_LIMIT, (a, b) => -compareMetrics(a.metrics, b.metrics, cond.sort));
  const mask = [0, 0, 0, 0, 0, 0, 0];
  const chosen: (PreparedOption | null)[] = new Array(n).fill(null);
  let total = 0;
  let nodes = 0;
  let truncated = false;

  const fits = (m: number[]) => {
    for (let d = 0; d < 7; d++) if (mask[d] & m[d]) return false;
    return true;
  };

  const leaf = (credit: number) => {
    // 최대성: 빠진 후보 과목 중 학점·시간 모두 들어갈 수 있는 게 있으면 버림
    for (let i = 0; i < n; i++) {
      if (chosen[i] || order[i].g.must) continue;
      if (credit + order[i].g.credit > maxC) continue;
      if (order[i].options.some((o) => fits(o.mask))) return;
    }
    total++;
    const picks = new Array(groups.length).fill(-1);
    const list: { credit: number; opt: EngineOption }[] = [];
    for (let i = 0; i < n; i++) {
      const c = chosen[i];
      if (!c) continue;
      picks[order[i].origIdx] = c.idx;
      list.push({ credit: order[i].g.credit, opt: c.opt });
    }
    heap.push({ picks, metrics: computeMetrics(list) });
  };

  const rec = (i: number, credit: number) => {
    if (truncated) return;
    if (++nodes > NODE_LIMIT) { truncated = true; return; }
    if (credit > maxC) return;
    if (credit + suffixCredit[i] < minC) return;
    if (i === n) { leaf(credit); return; }
    const p = order[i];
    for (const o of p.options) {
      if (!fits(o.mask)) continue;
      for (let d = 0; d < 7; d++) mask[d] |= o.mask[d];
      chosen[i] = o;
      rec(i + 1, credit + p.g.credit);
      for (let d = 0; d < 7; d++) mask[d] &= ~o.mask[d];
      chosen[i] = null;
    }
    if (!p.g.must) rec(i + 1, credit);
  };
  rec(0, 0);

  const results = heap.items.sort((a, b) => compareMetrics(a.metrics, b.metrics, cond.sort));
  return { results, total, truncated, ms: Date.now() - t0, emptyMust };
}
