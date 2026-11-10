/**
 * 사용 패턴 분석 (PostHog).
 *
 * - NEXT_PUBLIC_POSTHOG_KEY 가 없으면 아무것도 보내지 않는다 (로컬 개발 · 키 발급 전).
 * - 개인을 알아볼 수 있는 정보는 보내지 않는다: 로그인 없음, 익명 ID만 사용, 세션 녹화 끔.
 *   IP 저장은 PostHog 프로젝트 설정에서 "Discard client IP data"를 켜서 막는다 (README/CLAUDE.md 참고).
 * - 사용자가 메뉴에서 "사용 통계 보내지 않기"를 켜면 수집을 멈춘다 (localStorage `knu_analytics_optout`).
 */
import type { PostHog } from "posthog-js";

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://eu.i.posthog.com";
const OPTOUT_KEY = "knu_analytics_optout";

let ph: PostHog | null = null;
let starting: Promise<void> | null = null;
const queue: [string, Record<string, unknown> | undefined][] = [];

export const analyticsEnabled = () => !!KEY;

export function isOptedOut(): boolean {
  try { return localStorage.getItem(OPTOUT_KEY) === "1"; } catch { return false; }
}

export function setOptOut(optOut: boolean) {
  try { localStorage.setItem(OPTOUT_KEY, optOut ? "1" : "0"); } catch { /* 무시 */ }
  if (!ph) { if (!optOut) void initAnalytics(); return; }
  if (optOut) ph.opt_out_capturing(); else ph.opt_in_capturing();
}

export function initAnalytics(): Promise<void> {
  if (!KEY || typeof window === "undefined" || isOptedOut()) return Promise.resolve();
  if (starting) return starting;
  starting = import("posthog-js").then(({ default: posthog }) => {
    posthog.init(KEY, {
      api_host: HOST,
      person_profiles: "identified_only", // 익명 이벤트만 (개인 프로필 만들지 않음)
      persistence: "localStorage",        // 쿠키 사용 안 함
      autocapture: true,                  // 클릭·입력 등 기본 상호작용
      capture_pageview: true,
      capture_pageleave: true,
      disable_session_recording: true,
      mask_all_text: false,
      mask_all_element_attributes: false,
    });
    ph = posthog;
    for (const [e, p] of queue.splice(0)) ph.capture(e, p);
  });
  return starting;
}

/** 이벤트 기록. 초기화 전에 들어온 이벤트는 모아 두었다가 보낸다. */
export function track(event: string, props?: Record<string, unknown>) {
  if (!KEY || isOptedOut()) return;
  if (ph) ph.capture(event, props);
  else { queue.push([event, props]); void initAnalytics(); }
}
