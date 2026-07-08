"use client";

import { Section, NoTimeSection } from "@/lib/timetable";

export type ProfStep = { name: string; profs: string[]; isNoTime?: boolean };

export function getMultiProfSections(combo: Section[]): ProfStep[] {
  return combo
    .filter((sec) => sec.profs.length > 1)
    .map((sec) => ({ name: sec.name, profs: sec.profs }));
}

export function getMultiProfNoTimeSections(nts: NoTimeSection[]): ProfStep[] {
  return nts
    .filter((s) => (s.profs?.length ?? 0) > 1)
    .map((s) => ({ name: s.name, profs: s.profs!, isNoTime: true }));
}

export function applyProfPicksNoTime(nts: NoTimeSection[], picks: Map<string, string>): NoTimeSection[] {
  return nts.map((s) => {
    const picked = picks.get(s.name);
    if (!picked || (s.profs?.length ?? 0) <= 1) return s;
    const crseNo = s.profToCrseNo?.[picked] ?? s.crseNo;
    return { ...s, profs: [picked], crseNo };
  });
}

export function applyProfPicks(combo: Section[], picks: Map<string, string>): Section[] {
  return combo.map((sec) => {
    const picked = picks.get(sec.name);
    if (!picked || sec.profs.length <= 1) return sec;
    const crseNo = sec.profToCrseNo?.[picked] ?? sec.crseNo;
    const location = sec.profToLocation?.[picked] ?? sec.location;
    return { ...sec, profs: [picked], crseNo, location };
  });
}

export default function ProfPickerModal({
  courseName,
  profs,
  stepIdx,
  totalSteps,
  onSelect,
  onSkip,
  isNoTime,
}: {
  courseName: string;
  profs: string[];
  stepIdx: number;
  totalSteps: number;
  onSelect: (prof: string) => void;
  onSkip: () => void;
  isNoTime?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-[#262626] rounded-xl shadow-2xl p-6 w-80 max-w-[90vw] flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400">{stepIdx + 1} / {totalSteps}</span>
          <button onClick={onSkip} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">건너뛰기</button>
        </div>
        <div>
          <p className="text-xs mb-0.5">
            {isNoTime
              ? <span className="text-orange-500 font-medium">시간 외 · 교수 선택</span>
              : <span className="text-gray-400">교수 선택</span>
            }
          </p>
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 leading-tight">{courseName}</p>
        </div>
        <div className="flex flex-col gap-2">
          {profs.map((prof) => (
            <button
              key={prof}
              onClick={() => onSelect(prof)}
              className="w-full py-2.5 rounded-lg border border-gray-200 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-200 hover:bg-indigo-50 dark:hover:bg-[#1e1b4b] hover:border-indigo-400 transition-colors text-left px-4"
            >
              {prof}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
