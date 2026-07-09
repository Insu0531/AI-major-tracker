"use client";

import Script from "next/script";
import { KAKAO_JS_KEY } from "@/lib/kakaoShare";

export default function KakaoInit() {
  if (!KAKAO_JS_KEY) return null;
  return (
    <Script
      src="https://t1.kakaocdn.net/kakao_js_sdk/2.7.4/kakao.min.js"
      strategy="afterInteractive"
      onLoad={() => {
        if (!window.Kakao?.isInitialized?.()) {
          window.Kakao?.init(KAKAO_JS_KEY!);
        }
      }}
    />
  );
}
