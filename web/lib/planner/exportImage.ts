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
 *   토요일 수업이 있으면 칸이 하나 늘고, 9시 이전·18시 이후 수업이 있으면 위아래로 늘어난다.
 * 모양(색·서체·블록)은 사이트 화면과 같게: 밝은 배경, 옅은 격자, 둥근 블록, Pretendard.
 * 시간 미정 과목이 있으면 아래에 한 줄씩 덧붙인다. title은 파일 이름에만 쓴다.
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
  const HEAD = 60, LABEL = 62, COL = 214, HOUR = 135, GAP = 3, RADIUS = 12;
  // 사이트 토큰과 같은 색 (planner.css: --surface, --line, --ink-2, --ink-3)
  const C = { bg: "#fdfcfa", line: "#e6e3dc", half: "#f0eee9", head: "#4b4842", hour: "#7c7973", text: "#ffffff", sub: "#4b4842" };
  const FONT = `"Pretendard Variable", Pretendard, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif`;
  const font = (w: number, s: number) => `${w} ${s}px ${FONT}`;
  // 화면에 이미 쓰고 있는 웹폰트가 캔버스에도 적용되도록 미리 불러 둔다
  try { await Promise.all([document.fonts.load(font(700, 30)), document.fonts.load(font(500, 25))]); } catch { /* 기본 서체로 */ }

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

  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);

  // 요일 머리줄
  ctx.font = font(700, 26);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = C.head;
  for (let d = 0; d < days; d++) ctx.fillText(DAY[d], LABEL + COL * d + COL / 2, HEAD / 2 + 2);

  // 격자: 정시 선 + 30분 옅은 선 + 요일 경계
  const bodyH = HOUR * (h1 - h0);
  for (let h = 0; h < h1 - h0; h++) {
    ctx.fillStyle = C.half;
    ctx.fillRect(LABEL, HEAD + h * HOUR + HOUR / 2, W - LABEL, 1);
  }
  ctx.fillStyle = C.line;
  for (let h = 0; h <= h1 - h0; h++) ctx.fillRect(LABEL, HEAD + h * HOUR, W - LABEL, 2);
  for (let d = 0; d < days; d++) ctx.fillRect(LABEL + COL * d, HEAD, 2, bodyH);

  // 시각 (사이트와 같은 24시간제) — 정시 선 바로 아래 오른쪽 정렬
  ctx.font = font(500, 22);
  ctx.textAlign = "right";
  ctx.textBaseline = "top";
  ctx.fillStyle = C.hour;
  for (let h = h0; h < h1; h++) ctx.fillText(String(h), LABEL - 10, HEAD + (h - h0) * HOUR + 8);

  // 블록 (둥근 모서리, 칸 안쪽 여백)
  ctx.textAlign = "left";
  for (const it of items) {
    for (const [d, s, e] of mergeSlots(it.slots)) {
      const x = LABEL + COL * d + GAP + 2;
      const y = HEAD + ((s - h0 * 60) / 60) * HOUR + GAP;
      const w = COL - GAP * 2 - 2;
      const h = ((e - s) / 60) * HOUR - GAP * 2;
      ctx.fillStyle = it.color;
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, RADIUS);
      ctx.fill();
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
      ctx.fillStyle = C.text;
      let ty = y + 12;
      ctx.font = font(700, 30);
      for (const line of wrap(ctx, it.name, w - 24).slice(0, 3)) { ctx.fillText(line, x + 12, ty); ty += 38; }
      ctx.font = font(500, 23);
      ctx.globalAlpha = 0.9;
      for (const text of [it.prof, it.room].filter(Boolean)) {
        for (const line of wrap(ctx, text, w - 24).slice(0, 2)) {
          if (ty + 28 > y + h) break;
          ctx.fillText(line, x + 12, ty);
          ty += 30;
        }
      }
      ctx.restore();
    }
  }

  // 시간 미정
  if (noTime.length) {
    let y = HEAD + bodyH + 24;
    ctx.font = font(500, 24);
    ctx.fillStyle = C.sub;
    for (const it of noTime) {
      ctx.fillText(`시간 미정 · ${it.name} (${it.credit}학점)`, 18, y);
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
