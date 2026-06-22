"use client";

// 수강신청 사이트 바로가기 (수강신청 모달 공용)
const SUGANG_URL = "https://sugang.knu.ac.kr";

export default function SugangLink() {
  return (
    <a
      href={SUGANG_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5"
    >
      수강신청 사이트 바로가기
      <span aria-hidden>↗</span>
    </a>
  );
}
