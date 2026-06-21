import { Section, NoTimeSection } from "@/lib/timetable";

export type SavedTimetable = {
  id: string;
  name: string;
  savedAt: string; // ISO string
  sem: string;     // e.g. "2026-1"
  major: string;
  majorLabel: string;
  pinnedCombo: Section[];
  pinnedNoTimeSections: NoTimeSection[];
  gyoyangCombo?: Section[];
  gyoyangNoTimeSections?: NoTimeSection[];
};

const STORAGE_KEY = "knu_saved_timetables";

export function loadSavedTimetables(): SavedTimetable[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SavedTimetable[]) : [];
  } catch {
    return [];
  }
}

export function saveTimetable(entry: Omit<SavedTimetable, "id" | "savedAt">): SavedTimetable {
  const list = loadSavedTimetables();
  const existingNames = new Set(list.map((t) => t.name));

  let name = entry.name;
  if (existingNames.has(name)) {
    let n = 1;
    while (existingNames.has(`${entry.name} (${n})`)) n++;
    name = `${entry.name} (${n})`;
  }

  const newEntry: SavedTimetable = {
    ...entry,
    name,
    id: `tt_${Date.now()}`,
    savedAt: new Date().toISOString(),
  };
  list.unshift(newEntry);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  return newEntry;
}

export function deleteTimetable(id: string): void {
  const list = loadSavedTimetables().filter((t) => t.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export function renameTimetable(id: string, name: string): void {
  const list = loadSavedTimetables().map((t) => (t.id === id ? { ...t, name } : t));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}
