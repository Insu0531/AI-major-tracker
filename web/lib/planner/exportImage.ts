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
 * 모양은 사이트 아이덴티티: 회백색 배경·옅은 가로선(30분 점선, 세로선 없음)·왼쪽 띠가 있는 둥근 블록,
 * 요일·과목명은 제목 서체(Paperlogy), 나머지는 Pretendard, 왼쪽 위 빈칸에 KNU 로고.
 * 시간 미정 과목이 있으면 아래에 한 줄씩 덧붙인다. (이미지에 제목은 넣지 않는다 — 규격 유지)
 */
export async function renderTimetablePng(items: TimetableItem[]): Promise<Blob> {
  const HEAD = 60, LABEL = 62, COL = 214, HOUR = 135, GAP = 4, PAD = 12;
  // 사이트 디자인 토큰 (planner.css): 따뜻한 회백색 배경, 옅은 선, KNU 레드
  const C = { bg: "#f6f5f1", grid: "#fdfcfa", line: "#e4e1da", half: "#e9e6df", head: "#2b2925", hour: "#8a877f", text: "#ffffff", sub: "#4b4842", accent: "#a8262c" };
  const BODY = `"Pretendard Variable", Pretendard, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif`;
  const HEADF = `Paperlogy, ${BODY}`; // 사이트 제목 서체
  const body = (w: number, s: number) => `${w} ${s}px ${BODY}`;
  const head = (s: number) => `800 ${s}px ${HEADF}`;
  // 화면에서 쓰는 웹폰트가 캔버스에도 적용되도록 미리 불러 둔다
  try { await Promise.all([document.fonts.load(head(28)), document.fonts.load(body(500, 22)), document.fonts.load(body(600, 20))]); } catch { /* 기본 서체로 */ }

  const [h0, h1] = hourRange(items);
  const days = dayCount(items);
  const noTime = items.filter((i) => i.slots.length === 0);
  const FOOT = noTime.length ? 24 + noTime.length * 44 : 0;
  const W = LABEL + COL * days;
  const bodyH = HOUR * (h1 - h0);
  const H = HEAD + bodyH + FOOT;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);
  // 시간표 판 (머리줄 아래, 시간 열 오른쪽)
  ctx.fillStyle = C.grid;
  ctx.fillRect(LABEL, HEAD, W - LABEL, bodyH);

  // 왼쪽 위 빈칸: KNU 로고
  ctx.fillStyle = C.accent;
  ctx.font = head(19);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("KNU", LABEL / 2, HEAD / 2 + 1);

  // 요일 머리줄 (제목 서체)
  ctx.fillStyle = C.head;
  ctx.font = head(26);
  for (let d = 0; d < days; d++) ctx.fillText(DAY[d], LABEL + COL * d + COL / 2, HEAD / 2 + 2);

  // 격자: 정시 옅은 실선 + 30분 점선 (세로 칸선은 없음)
  ctx.fillStyle = C.line;
  for (let h = 1; h < h1 - h0; h++) ctx.fillRect(LABEL, HEAD + h * HOUR, W - LABEL, 2);
  ctx.strokeStyle = C.half;
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 8]);
  for (let h = 0; h < h1 - h0; h++) {
    const y = HEAD + h * HOUR + HOUR / 2 + 0.5;
    ctx.beginPath(); ctx.moveTo(LABEL + 8, y); ctx.lineTo(W - 8, y); ctx.stroke();
  }
  ctx.setLineDash([]);

  // 시각 (24시간제, 두 자리) — 정시 선 높이에 맞춰
  ctx.font = body(600, 20);
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.fillStyle = C.hour;
  for (let h = h0; h < h1; h++) ctx.fillText(String(h).padStart(2, "0"), LABEL - 12, HEAD + (h - h0) * HOUR + (h === h0 ? 18 : 0));

  // 블록: 각진 단색 (음영·둥근 모서리 없음, 사용자 요청)
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  for (const it of items) {
    for (const [d, s, e] of mergeSlots(it.slots)) {
      const x = LABEL + COL * d + GAP;
      const y = HEAD + ((s - h0 * 60) / 60) * HOUR + GAP;
      const w = COL - GAP * 2;
      const h = ((e - s) / 60) * HOUR - GAP * 2;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
      ctx.fillStyle = it.color;
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = C.text;
      let ty = y + 14;
      const tx = x + PAD;
      ctx.font = head(28);
      for (const line of wrap(ctx, it.name, w - PAD * 2).slice(0, 3)) { ctx.fillText(line, tx, ty); ty += 36; }
      ty += 4;
      ctx.font = body(500, 22);
      ctx.globalAlpha = 0.92;
      for (const text of [it.prof, it.room].filter(Boolean)) {
        for (const line of wrap(ctx, text, w - PAD * 2).slice(0, 2)) {
          if (ty + 26 > y + h) break;
          ctx.fillText(line, tx, ty);
          ty += 28;
        }
      }
      ctx.restore();
    }
  }

  // 시간 미정
  if (noTime.length) {
    let y = HEAD + bodyH + 24;
    ctx.font = body(500, 24);
    ctx.fillStyle = C.sub;
    for (const it of noTime) {
      ctx.fillText(`시간 미정 · ${it.name} (${it.credit}학점)`, 18, y);
      y += 44;
    }
  }

  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
  if (!blob) throw new Error("이미지를 만들지 못했어요");
  return blob;
}

/** 이미지 저장(다운로드). exportTimetable({ title, items }) 한 줄이면 끝. */
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
  const blob = await renderTimetablePng(items);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${(fileName ?? title).replace(/[\\/:*?"<>|]/g, "")}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
