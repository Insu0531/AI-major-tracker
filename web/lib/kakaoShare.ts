// 카카오 JS 키는 REST API 키와 달리 브라우저에 노출되도록 설계된 값이라 그대로 커밋해도 안전함
export const KAKAO_JS_KEY = "07a79b3fad293703357001660a68ce13";

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
    text: "전공 시간표 짜느라 매 학기 고생하셨나요? 경북대학교 시간표 마법사로 전공 조합을 자동으로 만들고, 마음에 드는 시간표를 골라 저장까지 한 번에 끝내보세요.",
    link: { mobileWebUrl: SITE_URL, webUrl: SITE_URL },
  });
}
