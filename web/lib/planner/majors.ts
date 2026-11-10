import { MAJOR_LABELS } from "@/lib/courses";

/** 학과 목록 항목. key는 /courses/{key}/{year}.json 폴더 이름 */
export type MajorInfo = { key: string; label: string; years?: number[]; auto?: boolean; level?: "grad" };

export const isGradMajor = (m?: MajorInfo) => m?.level === "grad";

/** 기존 사이트 학과(courses.ts) — 이수체계 파일 2021~2026 */
export const BASE_MAJORS: MajorInfo[] = Object.entries(MAJOR_LABELS).map(([key, label]) => ({ key, label }));

/** 기존 학과 + 자동 수집 학과(scripts/collect-curricula.mjs → majors-extra.json) */
export async function loadMajors(): Promise<MajorInfo[]> {
  let extra: MajorInfo[] = [];
  try {
    const res = await fetch("/data/majors-extra.json", { cache: "no-cache" });
    if (res.ok) extra = ((await res.json()) as MajorInfo[]).map((m) => ({ ...m, auto: true }));
  } catch { /* 자동 수집 학과 없이 진행 */ }
  const names = new Set(BASE_MAJORS.map((m) => m.label.replace(/\s/g, "")));
  return [...BASE_MAJORS, ...extra.filter((m) => !names.has(m.label.replace(/\s/g, "")))];
}

export const isSangjuLabel = (label: string) => label.startsWith("[상주]");
