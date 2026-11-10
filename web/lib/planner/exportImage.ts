import type { Slot } from "./types";

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
 * exportTimetable({ title, items }) 한 줄이면 끝.
 */
export async function exportTimetable({
  title,
  subtitle = "",
  items,
  fileName,
  dark = false,
}: {
  title: string;
  subtitle?: string;
  items: TimetableItem[];
  fileName?: string;
  dark?: boolean;
}): Promise<void> {
  const W = 1080;
  const PAD = 48;
  const HEAD = subtitle ? 120 : 96;
  const LABEL = 44;
  const [h0, h1] = hourRange(items);
  const days = dayCount(items);
  const rowH = 64;
  const gridH = (h1 - h0) * rowH;
  const noTime = items.filter((i) => i.slots.length === 0);
  const footer = noTime.length ? 40 + noTime.length * 30 : 0;
  const H = HEAD + 36 + gridH + footer + PAD;
  const colW = (W - PAD * 2 - LABEL) / days;

  const c = { bg: dark ? "#161615" : "#ffffff", ink: dark ? "#ecebe7" : "#1d1d1b", sub: dark ? "#9b9a94" : "#7a7973", line: dark ? "#2e2d2b" : "#e7e5df" };
  const canvas = document.createElement("canvas");
  const scale = 2;
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);
  const font = (w: number, s: number) => `${w} ${s}px Pretendard, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif`;

  ctx.fillStyle = c.bg;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = c.ink;
  ctx.font = font(700, 30);
  ctx.textBaseline = "top";
  ctx.fillText(title, PAD, PAD - 4);
  if (subtitle) { ctx.fillStyle = c.sub; ctx.font = font(500, 18); ctx.fillText(subtitle, PAD, PAD + 38); }

  const top = HEAD + 36;
  const left = PAD + LABEL;
  // 요일 헤더
  ctx.font = font(600, 17);
  ctx.textAlign = "center";
  for (let d = 0; d < days; d++) { ctx.fillStyle = c.sub; ctx.fillText(DAY[d], left + colW * d + colW / 2, HEAD + 6); }
  // 격자
  ctx.strokeStyle = c.line;
  ctx.lineWidth = 1;
  ctx.textAlign = "right";
  for (let h = h0; h <= h1; h++) {
    const y = top + (h - h0) * rowH + 0.5;
    ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(W - PAD, y); ctx.stroke();
    ctx.fillStyle = c.sub; ctx.font = font(500, 14); ctx.fillText(String(h), left - 10, y - 8);
  }
  for (let d = 0; d <= days; d++) {
    const x = left + colW * d + 0.5;
    ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, top + gridH); ctx.stroke();
  }
  // 블록
  ctx.textAlign = "left";
  for (const it of items) {
    for (const [d, s, e] of it.slots) {
      const x = left + colW * d + 3;
      const y = top + ((s - h0 * 60) / 60) * rowH + 2;
      const w = colW - 6;
      const h = ((e - s) / 60) * rowH - 4;
      ctx.fillStyle = it.color;
      ctx.beginPath(); ctx.roundRect(x, y, w, h, 4); ctx.fill();
      ctx.save();
      ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
      ctx.fillStyle = "#ffffff";
      ctx.font = font(700, 15);
      let ty = y + 8;
      for (const line of wrap(ctx, it.name, w - 14).slice(0, 3)) { ctx.fillText(line, x + 7, ty); ty += 19; }
      ctx.font = font(500, 13);
      ctx.globalAlpha = 0.88;
      for (const line of [it.prof, it.room].filter(Boolean)) {
        for (const l of wrap(ctx, line, w - 14).slice(0, 2)) { if (ty + 16 > y + h) break; ctx.fillText(l, x + 7, ty); ty += 17; }
      }
      ctx.restore();
    }
  }
  if (noTime.length) {
    let y = top + gridH + 28;
    ctx.fillStyle = c.sub; ctx.font = font(600, 16); ctx.fillText("시간 미정", PAD, y); y += 28;
    ctx.fillStyle = c.ink; ctx.font = font(500, 16);
    for (const it of noTime) { ctx.fillText(`${it.name} · ${it.credit}학점${it.prof ? ` · ${it.prof}` : ""}`, PAD, y); y += 30; }
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
