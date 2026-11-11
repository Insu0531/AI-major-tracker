import type { TimetableItem } from "./exportImage";
import { colorFor } from "./data";
import { loadSavedTimetables, deleteTimetable, renameTimetable } from "@/lib/timetableStorage";
import type { Section, NoTimeSection } from "@/lib/timetable";

/** localStorage 접근은 모두 여기서 (실패해도 앱은 계속 동작) */
export function readLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeLocal(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export type SavedPlan = {
  id: string;
  name: string;
  sem: string;
  savedAt: string;
  items: (TimetableItem & { sectionIds: string[] })[];
  /** 예전 사이트 라이브러리(localStorage `knu_saved_timetables`)에서 온 항목 */
  legacy?: boolean;
  /** 계정(서버)에 저장된 항목 */
  cloud?: boolean;
  /** 이 학기 대표 시간표 (계정 저장본만) */
  featured?: boolean;
};

/* 계정으로 옮긴 기존 사이트 저장본은 목록에서 숨김 (원본 저장 데이터는 지우지 않음) */
const MIGRATED_KEY = "knu_planner_migrated_v1";
export const markMigrated = (ids: string[]) => writeLocal(MIGRATED_KEY, [...new Set([...readLocal<string[]>(MIGRATED_KEY, []), ...ids])]);
const migrated = () => new Set(readLocal<string[]>(MIGRATED_KEY, []));

const SAVED_KEY = "knu_planner_saved_v1";

/** 기존 사이트 라이브러리(`knu_saved_timetables`) → 새 형식으로 변환 (원본은 그대로 둠) */
function fromLegacy(): SavedPlan[] {
  const toItem = (sec: Section | NoTimeSection) => {
    const code = sec.crseNo.replace(/-\d+$/, "");
    const times = "times" in sec ? sec.times : [];
    return {
      code,
      name: sec.name,
      credit: sec.credit,
      prof: (sec.profs ?? []).join(", "),
      room: "location" in sec ? sec.location.replace(/^(산격동 캠퍼스|상주캠퍼스|동인동 캠퍼스)\s*/, "").replace(/\n/g, " ") : "",
      slots: times.map((t) => [t.day, Math.round(t.start * 60), Math.round(t.end * 60)] as [number, number, number]),
      color: colorFor(code),
      sectionIds: [sec.crseNo],
    };
  };
  try {
    return loadSavedTimetables().map((t) => ({
      id: t.id,
      name: t.name,
      sem: t.sem,
      savedAt: t.savedAt,
      legacy: true,
      items: [...t.pinnedCombo, ...(t.gyoyangCombo ?? []), ...t.pinnedNoTimeSections, ...(t.gyoyangNoTimeSections ?? [])].map(toItem),
    }));
  } catch {
    return [];
  }
}

/** 새로 저장한 것 + 기존 사이트에서 저장한 것 (최신순) */
export const loadPlans = (): SavedPlan[] => {
  const done = migrated();
  return [...readLocal<SavedPlan[]>(SAVED_KEY, []), ...fromLegacy()]
    .filter((p) => !done.has(p.id))
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
};

const loadOwn = () => readLocal<SavedPlan[]>(SAVED_KEY, []);

export function savePlan(plan: Omit<SavedPlan, "id" | "savedAt">): SavedPlan | null {
  const entry: SavedPlan = { ...plan, id: `p_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, savedAt: new Date().toISOString() };
  return writeLocal(SAVED_KEY, [entry, ...loadOwn()]) ? entry : null;
}

export function deletePlan(plan: SavedPlan) {
  if (plan.legacy) deleteTimetable(plan.id);
  else writeLocal(SAVED_KEY, loadOwn().filter((p) => p.id !== plan.id));
}

export function renamePlan(plan: SavedPlan, name: string) {
  if (plan.legacy) renameTimetable(plan.id, name);
  else writeLocal(SAVED_KEY, loadOwn().map((p) => (p.id === plan.id ? { ...p, name } : p)));
}
