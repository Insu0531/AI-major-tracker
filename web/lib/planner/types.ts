// 시간표 검색(/new) 공용 타입

/** [요일(0=월..6=일), 시작(분), 종료(분)] */
export type Slot = [number, number, number];

/** scripts/collect-sections.mjs 가 만드는 분반 1개 */
export type RawSection = {
  id: string;
  code: string;
  name: string;
  type: string;
  credit: number;
  grade: string;
  college: string;
  dept: string;
  deptCd: string;
  profs: string[];
  time: string;
  slots: Slot[];
  campus: string;
  room: string;
  remark: string;
  tags: string[];
  capacity: number | null;
  applied: number | null;
  basket: number | null;
};

export type Snapshot = {
  v: number;
  sem: string;
  collectedAt: string;
  count: number;
  sections: RawSection[];
};

export type SnapshotIndex = {
  v: number;
  updatedAt: string;
  semesters: Record<string, { sem: string; collectedAt: string; count: number }>;
};

export type Category = "major" | "major2" | "gyoyang" | "kyoshik" | "ilban" | "other";

export const CATEGORY_LABEL: Record<Category, string> = {
  major: "내 전공",
  major2: "복수전공",
  gyoyang: "교양",
  kyoshik: "교직",
  ilban: "일반선택",
  other: "타학과 전공",
};

/** 과목(과목코드 단위)과 그 분반들 */
export type Course = {
  code: string;
  name: string;
  credit: number;
  type: string;
  category: Category;
  grade: string;
  dept: string;
  isGrad: boolean;
  tags: string[];
  sections: RawSection[];
};

export type CartMode = "must" | "maybe";

export type CartItem = {
  code: string;
  mode: CartMode;
  /** 고정한 분반 id (있으면 이 분반만 사용) */
  pinned: string | null;
  /** 제외한 분반 id */
  excluded: string[];
};

export type SortKey = "recommended" | "freeDays" | "lateStart" | "earlyEnd" | "gaps" | "credit";

export const SORT_LABEL: Record<SortKey, string> = {
  recommended: "추천순",
  freeDays: "공강 많은 순",
  lateStart: "늦게 시작",
  earlyEnd: "일찍 끝남",
  gaps: "빈 시간 적은 순",
  credit: "학점 높은 순",
};

export type Conditions = {
  minCredit: number;   // 0 = 제한 없음
  maxCredit: number;   // 0 = 제한 없음
  daysOff: number[];   // 수업 없어야 하는 요일
  startAfter: number;  // 분, 0 = 제한 없음 (이 시각 이전 수업 없음)
  endBefore: number;   // 분, 0 = 제한 없음 (이 시각 이후 수업 없음)
  excludeProfs: string[];
  /** 꼭 들어야 하는 교수님: 시간표에 이 교수님 수업이 하나 이상 들어가야 함 */
  includeProfs: string[];
  /** 12~13시 비우기 */
  lunchFree: boolean;
  /** 쉬는 시간 없이 이어지는 수업 최대 길이(분), 0 = 제한 없음 */
  maxStreak: number;
  /** 수업 사이 빈 시간 최대(분), 0 = 제한 없음 */
  maxGap: number;
  /** 하루 최대 과목 수, 0 = 제한 없음 */
  maxPerDay: number;
  /** 원격강좌 분반 빼기 */
  noRemote: boolean;
  sort: SortKey;
};

export const DEFAULT_CONDITIONS: Conditions = {
  minCredit: 0,
  maxCredit: 21,
  daysOff: [],
  startAfter: 0,
  endBefore: 0,
  excludeProfs: [],
  includeProfs: [],
  lunchFree: false,
  maxStreak: 0,
  maxGap: 0,
  maxPerDay: 0,
  noRemote: false,
  sort: "recommended",
};

/* ── 엔진 입출력 (Worker로 전달되므로 직렬화 가능한 값만) ── */

export type EngineSection = { id: string; profs: string[]; room: string; applied: number | null; capacity: number | null; remote: boolean };

/** 같은 시간대 분반 묶음 = 시간표상 하나의 선택지 */
export type EngineOption = {
  key: string;
  slots: Slot[];
  sections: EngineSection[];
};

export type EngineGroup = {
  code: string;
  name: string;
  credit: number;
  must: boolean;
  options: EngineOption[];
};

export type ComboMetrics = {
  credit: number;
  freeDays: number;     // 월~금 중 수업 없는 날
  avgStart: number;     // 분
  avgEnd: number;       // 분
  gapMinutes: number;   // 수업 사이 빈 시간 합
  competition: number;  // 신청/정원 평균 (데이터 없으면 0)
  courseCount: number;
};

export type EngineResult = {
  /** 그룹별 선택된 option 인덱스, -1 = 미포함(후보 과목) */
  picks: number[];
  metrics: ComboMetrics;
};

export type EngineResponse = {
  id: number;
  results: EngineResult[];
  total: number;
  truncated: boolean;
  ms: number;
  /** 필터 후 분반이 하나도 남지 않은 필수 과목 */
  emptyMust: string[];
};
