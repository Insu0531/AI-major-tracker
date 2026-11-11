/**
 * 결과가 0개일 때 "어떤 조건 하나를 풀면 시간표가 생기는지" 계산 (메인 스레드, 조건마다 노드 상한을 작게)
 * 켜진 조건·꼭 넣을 과목·고정 분반을 하나씩 풀어 엔진을 돌려 보고, 결과가 생기는 것만 결과 많은 순으로 돌려준다.
 */
import { buildEngineGroups, type SectionFilter } from "./data";
import { runEngine } from "./engine";
import { DAY_NAMES } from "./data";
import type { CartItem, Conditions, Course } from "./types";

export type Relaxation = { key: string; label: string; cond?: Partial<Conditions>; cart?: CartItem[]; total: number };

export function findRelaxations(cart: CartItem[], courseByCode: Map<string, Course>, filter: SectionFilter, c: Conditions, max = 5): Relaxation[] {
  const cands: Omit<Relaxation, "total">[] = [];
  for (const d of c.daysOff) cands.push({ key: `off${d}`, label: `${DAY_NAMES[d]}요일 공강 해제`, cond: { daysOff: c.daysOff.filter((x) => x !== d) } });
  if (c.maxCredit) cands.push({ key: "max", label: `최대 ${c.maxCredit} → ${c.maxCredit + 3}학점`, cond: { maxCredit: c.maxCredit + 3 } });
  if (c.minCredit) cands.push({ key: "min", label: `최소 ${c.minCredit}학점 조건 해제`, cond: { minCredit: 0 } });
  if (c.blockedSlots?.length) cands.push({ key: "blk", label: "빼고 싶은 시간 지우기", cond: { blockedSlots: [] } });
  if (c.requiredSlots?.length) cands.push({ key: "req", label: "꼭 넣을 시간 지우기", cond: { requiredSlots: [] } });
  if (c.lunchFree) cands.push({ key: "lunch", label: "점심시간 비우기 해제", cond: { lunchFree: false } });
  if (c.maxStreak) cands.push({ key: "streak", label: "3시간 연강 조건 해제", cond: { maxStreak: 0 } });
  if (c.maxGap) cands.push({ key: "gap", label: "2시간 공강 조건 해제", cond: { maxGap: 0 } });
  if (c.maxPerDay) cands.push({ key: "perday", label: "하루 3과목 조건 해제", cond: { maxPerDay: 0 } });
  if (c.noRemote) cands.push({ key: "remote", label: "원격강좌 빼기 해제", cond: { noRemote: false } });
  for (const p of c.includeProfs ?? []) cands.push({ key: `inc${p}`, label: `꼭 들을 교수님 ${p} 해제`, cond: { includeProfs: c.includeProfs.filter((x) => x !== p) } });
  if (c.excludeProfs.length) cands.push({ key: "exc", label: "피하고 싶은 교수님 해제", cond: { excludeProfs: [] } });
  for (const it of cart) {
    const name = courseByCode.get(it.code)?.name ?? it.code;
    if (it.pinned) cands.push({ key: `pin${it.code}`, label: `${name} 분반 고정 해제`, cart: cart.map((x) => (x.code === it.code ? { ...x, pinned: null, mode: "maybe" } : x)) });
    else if (it.mode === "must") cands.push({ key: `must${it.code}`, label: `${name} 꼭 넣기 해제`, cart: cart.map((x) => (x.code === it.code ? { ...x, mode: "maybe" } : x)) });
  }
  const baseGroups = buildEngineGroups(cart, courseByCode, filter);
  const out: Relaxation[] = [];
  for (const r of cands) {
    const groups = r.cart ? buildEngineGroups(r.cart, courseByCode, filter) : baseGroups;
    const res = runEngine(groups, { ...c, ...r.cond }, 150_000);
    if (res.total > 0) out.push({ ...r, total: res.total });
  }
  return out.sort((a, b) => b.total - a.total).slice(0, max);
}
