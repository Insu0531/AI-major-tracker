"use client";

import { useEffect, useRef } from "react";

/**
 * 열린 창(.pl-modal[role=dialog] 중 맨 위)에 키보드 접근성:
 *  - Esc로 닫기
 *  - Tab/Shift+Tab이 창 안에서만 돌게(포커스 가두기)
 *  - 열릴 때 창 안 첫 입력·버튼으로 포커스, 닫히면 원래 있던 곳으로 되돌림
 */
export function useDialogKeys(open: boolean, onClose: () => void) {
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const dialog = () => {
      const all = document.querySelectorAll<HTMLElement>('.pl-modal[role="dialog"]');
      return all[all.length - 1] ?? null;
    };
    const focusables = (el: HTMLElement) =>
      [...el.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((x) => !x.hasAttribute("disabled") && x.offsetParent !== null);
    const t = setTimeout(() => {
      const d = dialog();
      if (d && !d.contains(document.activeElement)) (d.querySelector<HTMLElement>("input, textarea, select") ?? focusables(d).find((x) => !x.classList.contains("pl-x")) ?? d).focus();
    }, 30);
    const onKey = (e: KeyboardEvent) => {
      const d = dialog();
      if (!d) return;
      if (e.key === "Escape") { e.preventDefault(); closeRef.current(); return; }
      if (e.key !== "Tab") return;
      const list = focusables(d);
      if (!list.length) return;
      const first = list[0], last = list[list.length - 1];
      if (e.shiftKey && (document.activeElement === first || !d.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => { clearTimeout(t); document.removeEventListener("keydown", onKey); prev?.focus?.(); };
  }, [open]);
}
