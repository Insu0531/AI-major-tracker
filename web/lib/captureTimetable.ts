import type { Section } from "./timetable";

/**
 * 시간표 DOM을 PNG로 저장 (라이브러리/교양/교직 공통 로직).
 *
 * 동작:
 *  1. 18시 이후 과목이 없으면 18시까지만 잘라 여백 없이 정사각형으로 저장
 *  2. 18시 이후 과목이 있으면 22시까지 전체를 정사각형으로 저장
 *
 * @param el        캡처할 wrapper 요소 (안에 <TimetableGrid> 가 렌더돼 있어야 함)
 * @param combo     el 안에 실제로 렌더된 combo (세로 크롭 기준 = maxEnd 계산용)
 * @param fileName  저장 파일명 (.png 자동 부여)
 */
export async function captureTimetableImage({
  el,
  combo,
  fileName,
}: {
  el: HTMLElement;
  combo: Section[];
  fileName: string;
}): Promise<void> {
  const domtoimage = (await import("dom-to-image-more")).default;
  const isDark = document.documentElement.classList.contains("dark");
  const bg = isDark ? "#171717" : "#ffffff";

  // 크롭 지점 계산 (클론 생성 전에 먼저 확정)
  const maxEnd = combo.flatMap((s) => s.times).reduce((mx, t) => Math.max(mx, t.end), 0);
  const cutoffH = maxEnd > 0 && maxEnd <= 18 ? 18 : 22;
  const gridBodyH = (cutoffH - 9) * 52; // 468 or 676
  const CAPTURE_W = 28 + gridBodyH; // content height ≈ width → 자연스러운 정사각형

  const clone = el.cloneNode(true) as HTMLElement;
  clone.style.cssText = `position:fixed;left:-9999px;top:0;width:${CAPTURE_W}px;height:auto;overflow:visible;`;
  document.body.appendChild(clone);

  try {
    // 스크롤바 제거: overflow-auto/scroll 요소를 scrollHeight/scrollWidth로 고정
    clone.querySelectorAll<HTMLElement>("*").forEach((child) => {
      // 등장 애니메이션(block-pop 등) 중간 프레임(scale 축소)이 캡처돼 글자가 잘리는 문제 방지:
      // 클론에서는 애니메이션/트랜지션/트랜스폼을 제거해 항상 최종 상태로 캡처
      child.style.animation = "none";
      child.style.transition = "none";
      child.style.transform = "none";
      const cs = window.getComputedStyle(child);
      if (cs.overflowY === "auto" || cs.overflowY === "scroll") {
        child.style.height = `${child.scrollHeight}px`;
        child.style.overflowY = "hidden";
      }
      if (cs.overflowX === "auto" || cs.overflowX === "scroll") {
        child.style.width = `${child.scrollWidth}px`;
        child.style.overflowX = "hidden";
      }
    });

    // 18시 크롭: 그리드 바디를 cutoffH까지만 표시
    if (cutoffH < 22) {
      const gridBody = clone.querySelector<HTMLElement>('[style*="height: 676px"]');
      if (gridBody) {
        gridBody.style.height = `${gridBodyH}px`;
        let anc: HTMLElement | null = gridBody.parentElement;
        while (anc && anc !== clone) {
          if (anc.style.height && parseInt(anc.style.height) >= 600) {
            anc.style.height = `${28 + gridBodyH}px`;
            break;
          }
          anc = anc.parentElement;
        }
      }
    }

    const rawUrl = await domtoimage.toPng(clone, {
      bgcolor: bg,
      scale: 3,
      width: CAPTURE_W,
      height: clone.scrollHeight,
    });

    // 정사각형 보정: 시간 외 블록 등으로 높이가 약간 다를 수 있으므로 canvas로 맞춤
    const img = new Image();
    await new Promise<void>((r) => {
      img.onload = () => r();
      img.src = rawUrl;
    });
    const sq = Math.max(img.width, img.height);
    const canvas = document.createElement("canvas");
    canvas.width = sq;
    canvas.height = sq;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, sq, sq);
    // 시간 외 블록 등으로 세로가 길어져도 정사각형 캔버스 중앙에 배치(여백 좌우/상하 대칭)
    ctx.drawImage(img, (sq - img.width) / 2, (sq - img.height) / 2);
    const dataUrl = canvas.toDataURL("image/png");

    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = fileName.endsWith(".png") ? fileName : `${fileName}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } finally {
    if (clone.parentNode) document.body.removeChild(clone);
  }
}
