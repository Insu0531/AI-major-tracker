export type Course = {
  grade: string;
  code: string;
  name: string;
  credit: string;
};

export type Major = "ai" | "elec" | "mech" | "space" | "energy" | "energy_re" | "energy_cv" | "nursing" | "physics";

export const MAJOR_LABELS: Record<Major, string> = {
  ai: "전자공학부 인공지능전공",
  nursing: "간호학과",
  mech: "기계공학부",
  physics: "물리학과",
  energy: "에너지공학부",
  energy_re: "에너지공학부-신재생에너지전공",
  energy_cv: "에너지공학부-에너지변환전공",
  space: "우주공학부",
  elec: "전자공학부",
};

export const MAJOR_META: Record<Major, { deptCd: string; baseDeptCd?: string }> = {
  ai:        { deptCd: "1O0109" },
  elec:      { deptCd: "1O01" },
  mech:      { deptCd: "1601" },
  space:     { deptCd: "1003" },
  energy:    { deptCd: "1611" },
  energy_re: { deptCd: "161101", baseDeptCd: "1611" },
  energy_cv: { deptCd: "161102", baseDeptCd: "1611" },
  nursing: { deptCd: "1C01" },
  physics: { deptCd: "130A" },
};

/** /public/courses/{major}/{entryYear}.json 에서 과목 목록 fetch (클라이언트용) */
export async function fetchCoursesByYear(major: Major, entryYear: number): Promise<Course[]> {
  try {
    const res = await fetch(`/courses/${major}/${entryYear}.json`);
    if (!res.ok) return [];
    return await res.json() as Course[];
  } catch {
    return [];
  }
}

export const ENTRY_YEAR_MIN = 2021;
export const ENTRY_YEAR_MAX = 2050;

export const SEMESTER_CODES: Record<string, string> = {
  "1": "CMBS001400001",
  "2": "CMBS001400002",
  "s": "CMBS001400004",
  "w": "CMBS001400003",
};

export function parseSemester(text: string): { year: string; semCode: string } | null {
  const m = text.trim().match(/^(\d{4})-([12sw])$/i);
  if (!m) return null;
  const semCode = SEMESTER_CODES[m[2].toLowerCase()];
  return { year: m[1], semCode };
}
