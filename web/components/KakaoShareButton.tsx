"use client";

import { shareToKakao } from "@/lib/kakaoShare";

export default function KakaoShareButton({ className = "" }: { className?: string }) {
  return (
    <button
      onClick={shareToKakao}
      title="카카오톡으로 공유하기"
      className={`flex items-center gap-1 text-sm font-medium text-[#3c1e1e] bg-[#FEE500] hover:bg-[#f5dc00] rounded-lg px-3 py-1 transition-colors shrink-0 ${className}`}
    >
      <span aria-hidden>💬</span> 카톡 공유
    </button>
  );
}
