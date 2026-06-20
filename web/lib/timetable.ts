export type TimeSlot = { day: number; start: number; end: number };

const DAY_KOR: Record<string, number> = {
  월: 0, 화: 1, 수: 2, 목: 3, 금: 4, 토: 5,
};

export function parseTimes(timeStr: string): TimeSlot[] {
  const slots: TimeSlot[] = [];
  const parts = timeStr.split(",").map((s) => s.trim()).filter(Boolean);
  for (const part of parts) {
    const m = part.match(/([월화수목금토])\s+(\d+):(\d+)\s*~\s*(\d+):(\d+)/);
    if (!m) continue;
    const day = DAY_KOR[m[1]];
    const start = parseInt(m[2]) + parseInt(m[3]) / 60;
    const end = parseInt(m[4]) + parseInt(m[5]) / 60;
    if (day !== undefined) slots.push({ day, start, end });
  }
  return slots;
}

export type Section = {
  name: string;
  profs: string[];
  dept: string;
  timeStr: string;
  times: TimeSlot[];
  credit: number;
  crseNo: string;
};

export type SectionGroup = Section[];

export function buildSectionGroups(
  rows: { grade: string; credit: string; crseNo: string; name: string; dept: string; prof: string; timeStr: string }[]
): SectionGroup[] {
  const groupMap = new Map<string, { name: string; credit: number; rows: typeof rows }>();
  for (const row of rows) {
    const base = row.crseNo.replace(/-\d+$/, "");
    if (!groupMap.has(base)) {
      const credit = parseInt(row.credit?.split("-")[0] ?? "0");
      groupMap.set(base, { name: row.name, credit, rows: [] });
    }
    groupMap.get(base)!.rows.push(row);
  }

  const groups: SectionGroup[] = [];
  for (const { name, credit, rows: groupRows } of groupMap.values()) {
    const slotMap = new Map<string, Section>();
    for (const row of groupRows) {
      const times = parseTimes(row.timeStr);
      if (!times.length) continue;
      const key = `${row.name}|${row.timeStr}`;
      if (!slotMap.has(key)) {
        slotMap.set(key, {
          name,
          profs: [row.prof],
          dept: row.dept,
          timeStr: row.timeStr,
          times,
          credit,
          crseNo: row.crseNo,
        });
      } else {
        const sec = slotMap.get(key)!;
        if (!sec.profs.includes(row.prof)) sec.profs.push(row.prof);
      }
    }
    if (slotMap.size > 0) groups.push([...slotMap.values()]);
  }
  return groups;
}

function hasOverlap(combo: Section[]): boolean {
  const slots: TimeSlot[] = [];
  for (const sec of combo) {
    for (const t of sec.times) {
      for (const s of slots) {
        if (t.day === s.day && t.start < s.end && t.end > s.start) return true;
      }
      slots.push(t);
    }
  }
  return false;
}

function* cartesian<T>(groups: T[][]): Generator<T[]> {
  if (groups.length === 0) { yield []; return; }
  for (const item of groups[0]) {
    for (const rest of cartesian(groups.slice(1))) {
      yield [item, ...rest];
    }
  }
}

export function generateCombos(selectedGroups: SectionGroup[]): Section[][] {
  const n = selectedGroups.length;

  // 크기별로 유효 조합 수집
  // 크기 k의 유효 조합이 하나라도 있으면, 크기 k보다 작은 조합은 해당 과목 인덱스 집합이
  // 크기 k 조합의 부분집합인 경우에만 제외 (다른 인덱스 조합은 독립적으로 포함)
  const validBySize: Map<number, { idxSet: Set<number>; combo: Section[] }[]> = new Map();

  for (let size = n; size >= 1; size--) {
    const found: { idxSet: Set<number>; combo: Section[] }[] = [];
    for (const idxSubset of combinations(n, size)) {
      const sub = idxSubset.map((i) => selectedGroups[i]);
      for (const combo of cartesian(sub)) {
        if (!hasOverlap(combo)) {
          found.push({ idxSet: new Set(idxSubset), combo });
        }
      }
    }
    if (found.length > 0) validBySize.set(size, found);
  }

  if (validBySize.size === 0) return [];

  const maxSize = Math.max(...validBySize.keys());
  const result: Section[][] = [];

  // 최대 크기 조합은 전부 포함
  for (const { combo } of validBySize.get(maxSize)!) {
    result.push(combo);
  }

  // 작은 크기는 최대 크기 조합의 부분집합 인덱스가 아닌 경우에만 포함
  const maxIdxSets = validBySize.get(maxSize)!.map((v) => v.idxSet);
  for (let size = maxSize - 1; size >= 1; size--) {
    const entries = validBySize.get(size);
    if (!entries) continue;
    for (const { idxSet, combo } of entries) {
      const subsumed = maxIdxSets.some((maxSet) =>
        [...idxSet].every((i) => maxSet.has(i))
      );
      if (!subsumed) result.push(combo);
    }
  }

  return result;
}

function* combinations(n: number, k: number): Generator<number[]> {
  const indices = Array.from({ length: k }, (_, i) => i);
  yield [...indices];
  while (true) {
    let i = k - 1;
    while (i >= 0 && indices[i] === i + n - k) i--;
    if (i < 0) return;
    indices[i]++;
    for (let j = i + 1; j < k; j++) indices[j] = indices[j - 1] + 1;
    yield [...indices];
  }
}
