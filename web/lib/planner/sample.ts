import type { TimetableItem } from "./exportImage";
import { PALETTE } from "./data";

/** 1단계 소개용 예시 시간표 (실제 데이터 아님, 모양만 보여 줌) */
const S = (code: string, name: string, room: string, ci: number, slots: [number, number, number][]): TimetableItem =>
  ({ code, name, prof: "", room, credit: 3, color: PALETTE[ci], slots });

export const SAMPLE_TIMETABLE: TimetableItem[] = [
  S("EX1", "자료구조", "IT5-345", 0, [[0, 540, 630], [2, 540, 630]]),
  S("EX2", "선형대수", "공대9-112", 6, [[1, 630, 720], [3, 630, 720]]),
  S("EX3", "글쓰기", "인문대 214", 3, [[0, 780, 870], [2, 780, 870]]),
  S("EX4", "컴퓨터구조", "IT1-317", 2, [[1, 840, 960]]),
  S("EX5", "심리학의 이해", "사회대 132", 7, [[3, 900, 1020]]),
];
