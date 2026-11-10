import type { TimetableItem } from "./exportImage";

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
};

const SAVED_KEY = "knu_planner_saved_v1";

export const loadPlans = () => readLocal<SavedPlan[]>(SAVED_KEY, []);

export function savePlan(plan: Omit<SavedPlan, "id" | "savedAt">): SavedPlan | null {
  const entry: SavedPlan = { ...plan, id: `p_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, savedAt: new Date().toISOString() };
  return writeLocal(SAVED_KEY, [entry, ...loadPlans()]) ? entry : null;
}

export function deletePlan(id: string) {
  writeLocal(SAVED_KEY, loadPlans().filter((p) => p.id !== id));
}
