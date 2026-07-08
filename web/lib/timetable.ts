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

const DAY_NAMES = ["월", "화", "수", "목", "금", "토"];
function fmtHour(h: number): string {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return `${hh}:${String(mm).padStart(2, "0")}`;
}

// 강의시간 문자열을 요일순 정렬 + 같은 요일의 연속 슬롯 병합
// 예: "화 14:00~15:00, 화 15:00~16:00, 화 16:00~18:00" → "화 14:00~18:00"
export function formatTimeStr(timeStr: string): string {
  const slots = parseTimes(timeStr);
  const byDay = new Map<number, { start: number; end: number }[]>();
  for (const s of slots) {
    if (!byDay.has(s.day)) byDay.set(s.day, []);
    byDay.get(s.day)!.push({ start: s.start, end: s.end });
  }
  const parts: string[] = [];
  for (const [day, segs] of [...byDay.entries()].sort((a, b) => a[0] - b[0])) {
    segs.sort((a, b) => a.start - b.start);
    const merged: { start: number; end: number }[] = [];
    for (const seg of segs) {
      if (merged.length && seg.start <= merged[merged.length - 1].end) {
        merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, seg.end);
      } else {
        merged.push({ ...seg });
      }
    }
    for (const m of merged) parts.push(`${DAY_NAMES[day]} ${fmtHour(m.start)}~${fmtHour(m.end)}`);
  }
  return parts.join(", ");
}

export type Section = {
  name: string;
  profs: string[];
  dept: string;
  timeStr: string;
  times: TimeSlot[];
  credit: number;
  crseNo: string;
  location: string;
  profToCrseNo?: Record<string, string>;
  profToLocation?: Record<string, string>;
};

export type SectionGroup = Section[];

export type NoTimeSection = { name: string; credit: number; crseNo: string; profs?: string[]; profToCrseNo?: Record<string, string> };

export function buildSectionGroups(
  rows: { grade: string; credit: string; crseNo: string; name: string; dept: string; prof: string; timeStr: string; location?: string }[]
): { groups: SectionGroup[]; noTimeSections: NoTimeSection[] } {
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
  const noTimeSections: NoTimeSection[] = [];

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
          location: row.location ?? "",
          profToCrseNo: { [row.prof]: row.crseNo },
          profToLocation: { [row.prof]: row.location ?? "" },
        });
      } else {
        const sec = slotMap.get(key)!;
        if (!sec.profs.includes(row.prof)) {
          sec.profs.push(row.prof);
          if (sec.profToCrseNo) sec.profToCrseNo[row.prof] = row.crseNo;
          if (sec.profToLocation) sec.profToLocation[row.prof] = row.location ?? "";
        }
      }
    }
    if (slotMap.size > 0) {
      groups.push([...slotMap.values()]);
    } else {
      // 모든 분반에 강의시간이 없는 과목
      const base = groupRows[0]?.crseNo.replace(/-\d+$/, "") ?? "";
      const profs: string[] = [];
      const profToCrseNo: Record<string, string> = {};
      for (const row of groupRows) {
        const p = row.prof?.trim();
        if (p && !profs.includes(p)) {
          profs.push(p);
          profToCrseNo[p] = row.crseNo;
        }
      }
      noTimeSections.push({ name, credit, crseNo: base, profs, profToCrseNo });
    }
  }
  return { groups, noTimeSections };
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
  // 크기 k의 유효 조합이 하나라도 있으면, 크기 k보다 작은 조합은 "실제 분반(crseNo) 집합"이
  // 어떤 최대 크기 조합의 부분집합인 경우에만 제외한다.
  // (과목 인덱스가 아니라 분반 단위로 판정 — 같은 과목이라도 최대 조합에 들어가지 못하는
  //  다른 분반은 독립적인 경우의 수로 남겨야 하기 때문)
  const validBySize: Map<number, Section[][]> = new Map();

  for (let size = n; size >= 1; size--) {
    const found: Section[][] = [];
    for (const idxSubset of combinations(n, size)) {
      const sub = idxSubset.map((i) => selectedGroups[i]);
      for (const combo of cartesian(sub)) {
        if (!hasOverlap(combo)) found.push(combo);
      }
    }
    if (found.length > 0) validBySize.set(size, found);
  }

  if (validBySize.size === 0) return [];

  const maxSize = Math.max(...validBySize.keys());
  const result: Section[][] = [];

  // 최대 크기 조합은 전부 포함
  for (const combo of validBySize.get(maxSize)!) {
    result.push(combo);
  }

  // 작은 크기는 분반 집합이 어떤 최대 크기 조합의 부분집합이 아닌 경우에만 포함
  const maxCrseSets = validBySize.get(maxSize)!.map((c) => new Set(c.map((s) => s.crseNo)));
  for (let size = maxSize - 1; size >= 1; size--) {
    const entries = validBySize.get(size);
    if (!entries) continue;
    for (const combo of entries) {
      const subsumed = maxCrseSets.some((maxSet) =>
        combo.every((s) => maxSet.has(s.crseNo))
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
