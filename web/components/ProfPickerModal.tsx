"use client";

import { Section } from "@/lib/timetable";

export type ProfStep = { name: string; profs: string[] };

export function getMultiProfSections(combo: Section[]): ProfStep[] {
  return combo
    .filter((sec) => sec.profs.length > 1)
    .map((sec) => ({ name: sec.name, profs: sec.profs }));
}

export function applyProfPicks(combo: Section[], picks: Map<string, string>): Section[] {
  return combo.map((sec) => {
    const picked = picks.get(sec.name);
    if (!picked || sec.profs.length <= 1) return sec;
    return { ...sec, profs: [picked] };
  });
}

export default function ProfPickerModal({
  courseName,
  profs,
  stepIdx,
  totalSteps,
  onSelect,
  onSkip,
}: {
  courseName: string;
  profs: string[];
  stepIdx: number;
  totalSteps: number;
  onSelect: (prof: string) => void;
  onSkip: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-[#262626] rounded-xl shadow-2xl p-6 w-80 max-w-[90vw] flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400">{stepIdx + 1} / {totalSteps}</span>
          <button onClick={onSkip} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">건너뛰기</button>
        </div>
        <div>
          <p className="text-xs text-gray-400 mb-0.5">교수 선택</p>
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 leading-tight">{courseName}</p>
        </div>
        <div className="flex flex-col gap-2">
          {profs.map((prof) => (
            <button
              key={prof}
              onClick={() => onSelect(prof)}
              className="w-full py-2.5 rounded-lg border border-gray-200 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-200 hover:bg-blue-50 dark:hover:bg-[#1e3a5f] hover:border-blue-400 transition-colors text-left px-4"
            >
              {prof}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
