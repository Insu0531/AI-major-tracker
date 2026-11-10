import type { Slot } from "./types";
import { mergeSlots } from "./data";

export type TimetableItem = {
  code: string;
  name: string;
  prof: string;
  room: string;
  credit: number;
  slots: Slot[];
  color: string;
};

const DAY = ["월", "화", "수", "목", "금", "토", "일"];

/** 시간표 표시 범위(시) — 화면과 이미지가 같은 규칙을 쓴다 */
export function hourRange(items: TimetableItem[]): [number, number] {
  let lo = 9, hi = 18;
  for (const it of items) for (const [, s, e] of it.slots) { lo = Math.min(lo, Math.floor(s / 60)); hi = Math.max(hi, Math.ceil(e / 60)); }
  return [lo, hi];
}

export function dayCount(items: TimetableItem[]): number {
  let max = 4;
  for (const it of items) for (const [d] of it.slots) max = Math.max(max, d);
  return max + 1;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = [];
  let cur = "";
  for (const ch of text) {
    if (ctx.measureText(cur + ch).width > width && cur) { lines.push(cur); cur = ch; } else cur += ch;
  }
  if (cur) lines.push(cur);
  return lines;
}

/**
 * 시간표를 PNG로 저장. DOM 캡처 없이 데이터로 직접 그린다.
 *
 * 규격(사용자가 준 시간표 앱 캡처 기준, 1px 단위 그대로):
 *   요일 머리줄 60 · 시간 열 62 · 요일 칸 214 · 1시간 135 → 월~금, 9~18시면 1132 × 1275
 *   어두운 배경, 회색 격자선, 블록은 칸을 꽉 채우고 과목명(굵게) + 강의실만, 시각은 12시간제(1, 2, 3 …)
 *   토요일 수업이 있으면 칸이 하나 늘고, 9시 이전·18시 이후 수업이 있으면 위아래로 늘어난다.
 *   시간 미정 과목이 있으면 아래에 한 줄씩 덧붙인다.
 *
 * title/subtitle은 파일 이름에만 쓴다 (이미지에는 넣지 않음 — 규격 유지).
 */
export async function exportTimetable({
  title,
  items,
  fileName,
}: {
  title: string;
  subtitle?: string;
  items: TimetableItem[];
  fileName?: string;
  dark?: boolean;
}): Promise<void> {
  const HEAD = 60, LABEL = 62, COL = 214, HOUR = 135, LINE = 2;
  const C = { bg: "#121212", line: "#2f2f2f", head: "#9c9c9c", hour: "#b4b4b4", text: "#ffffff" };
  const [h0, h1] = hourRange(items);
  const days = dayCount(items);
  const noTime = items.filter((i) => i.slots.length === 0);
  const FOOT = noTime.length ? 24 + noTime.length * 44 : 0;
  const W = LABEL + COL * days;
  const H = HEAD + HOUR * (h1 - h0) + FOOT;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const font = (w: number, s: number) => `${w} ${s}px "Apple SD Gothic Neo", Pretendard, "Malgun Gothic", sans-serif`;

  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = "middle";

  // 요일 머리줄
  ctx.font = font(400, 28);
  ctx.textAlign = "center";
  ctx.fillStyle = C.head;
  for (let d = 0; d < days; d++) ctx.fillText(DAY[d], LABEL + COL * d + COL / 2, HEAD / 2 + 1);

  // 시각 (12시간제) — 칸 위쪽에 오른쪽 정렬
  ctx.textAlign = "right";
  ctx.textBaseline = "top";
  ctx.fillStyle = C.hour;
  for (let h = h0; h < h1; h++) ctx.fillText(String(((h + 11) % 12) + 1), LABEL - 8, HEAD + (h - h0) * HOUR + 6);

  // 격자선
  ctx.fillStyle = C.line;
  for (let h = 0; h <= h1 - h0; h++) ctx.fillRect(0, HEAD + h * HOUR - LINE / 2, W, LINE);
  ctx.fillRect(0, HEAD - LINE / 2, W, LINE);
  for (let d = 0; d <= days; d++) ctx.fillRect(LABEL + COL * d - LINE / 2, 0, LINE, HEAD + HOUR * (h1 - h0));

  // 블록
  ctx.textAlign = "left";
  for (const it of items) {
    for (const [d, s, e] of mergeSlots(it.slots)) {
      const x = LABEL + COL * d + LINE / 2;
      const y = HEAD + ((s - h0 * 60) / 60) * HOUR + LINE / 2;
      const w = COL - LINE;
      const h = ((e - s) / 60) * HOUR - LINE;
      ctx.fillStyle = it.color;
      ctx.fillRect(x, y, w, h);
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
      ctx.fillStyle = C.text;
      let ty = y + 8;
      ctx.font = font(700, 32);
      for (const line of wrap(ctx, it.name, w - 12)) { ctx.fillText(line, x + 6, ty); ty += 40; }
      ctx.font = font(400, 27);
      for (const line of wrap(ctx, it.room, w - 12)) { if (ty > y + h) break; ctx.fillText(line, x + 6, ty); ty += 35; }
      ctx.restore();
    }
  }

  // 시간 미정
  if (noTime.length) {
    let y = HEAD + HOUR * (h1 - h0) + 24;
    ctx.font = font(400, 26);
    ctx.fillStyle = C.head;
    for (const it of noTime) {
      ctx.fillText(`시간 미정 · ${it.name} (${it.credit}학점)`, 16, y);
      y += 44;
    }
  }

  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
  if (!blob) throw new Error("이미지를 만들지 못했어요");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${(fileName ?? title).replace(/[\\/:*?"<>|]/g, "")}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
