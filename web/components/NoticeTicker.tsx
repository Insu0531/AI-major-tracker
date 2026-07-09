"use client";

import { useState } from "react";

export default function NoticeTicker({ text }: { text: string }) {
  const [closed, setClosed] = useState(false);
  if (closed) return null;

  return (
    <div className="relative flex items-center h-8 bg-amber-500 text-white text-sm shrink-0 overflow-hidden">
      <div className="flex whitespace-nowrap marquee-track">
        <span className="px-8">{text}</span>
        <span className="px-8" aria-hidden="true">{text}</span>
      </div>
      <button
        onClick={() => setClosed(true)}
        aria-label="공지 닫기"
        className="absolute right-2 top-1/2 -translate-y-1/2 text-white/80 hover:text-white text-xs px-1"
      >
        ✕
      </button>
    </div>
  );
}
