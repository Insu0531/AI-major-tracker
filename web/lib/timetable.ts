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
  timeStr: string;
  times: TimeSlot[];
  credit: number;
  crseNo: string;
};

export type SectionGroup = Section[];

export function buildSectionGroups(
  rows: { grade: string; credit: string; crseNo: string; name: string; prof: string; timeStr: string }[]
): SectionGroup[] {
  // 과목코드 앞부분으로 그룹핑
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
    // 같은 (name, timeStr)은 교수만 합침
    const slotMap = new Map<string, Section>();
    for (const row of groupRows) {
      const times = parseTimes(row.timeStr);
      if (!times.length) continue;
      const key = `${row.name}|${row.timeStr}`;
      if (!slotMap.has(key)) {
        slotMap.set(key, {
          name,
          profs: [row.prof],
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
  // 큰 크기부터 시도, 유효 조합 찾으면 그 크기에서 멈춤
  for (let size = n; size >= 1; size--) {
    const results: Section[][] = [];
    for (const idxSubset of combinations(n, size)) {
      const sub = idxSubset.map((i) => selectedGroups[i]);
      for (const combo of cartesian(sub)) {
        if (!hasOverlap(combo)) results.push(combo);
      }
    }
    if (results.length > 0) return results;
  }
  return [];
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
