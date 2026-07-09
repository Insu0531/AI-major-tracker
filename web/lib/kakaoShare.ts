// Vercel 프로젝트 환경변수(및 로컬 .env.local)에 NEXT_PUBLIC_KAKAO_JS_KEY로 설정
export const KAKAO_JS_KEY = process.env.NEXT_PUBLIC_KAKAO_JS_KEY;

// 실제 배포 도메인과 다르면 이 상수만 수정
export const SITE_URL = "https://knu-class-wizard.vercel.app";

declare global {
  interface Window {
    Kakao?: {
      init: (key: string) => void;
      isInitialized: () => boolean;
      Share: {
        sendDefault: (options: Record<string, unknown>) => void;
      };
    };
  }
}

export function shareToKakao() {
  const kakao = window.Kakao;
  if (!kakao?.isInitialized?.()) return;
  kakao.Share.sendDefault({
    objectType: "text",
    text: "경북대학교 시간표 마법사 — 전공 시간표를 자동으로 짜보세요!",
    link: { mobileWebUrl: SITE_URL, webUrl: SITE_URL },
  });
}
