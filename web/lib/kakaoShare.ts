// 카카오 JS 키는 REST API 키와 달리 브라우저에 노출되도록 설계된 값이라 그대로 커밋해도 안전함
export const KAKAO_JS_KEY = "07a79b3fad293703357001660a68ce13";

// 실제 배포 도메인과 다르면 이 상수만 수정
export const SITE_URL = "https://knuclass.vercel.app";

declare global {
  interface Window {
    Kakao?: {
      init: (key: string) => void;
      isInitialized: () => boolean;
      Share: {
        sendDefault: (options: Record<string, unknown>) => void;
        uploadImage: (opts: { file: File[] }) => Promise<{ infos: { original: { url: string; width: number; height: number } } }>;
      };
    };
  }
}

export function shareToKakao() {
  const kakao = window.Kakao;
  if (!kakao?.isInitialized?.()) return;
  kakao.Share.sendDefault({
    objectType: "text",
    text: "KNU 시간표 마법사\n\n전공, 교양 조합을 자동으로 만들고,\n마음에 드는 시간표를 저장할 수 있어요.",
    link: { mobileWebUrl: SITE_URL, webUrl: SITE_URL },
  });
}

/**
 * 시간표 이미지를 카카오톡으로 공유.
 * 1) 카카오 SDK가 준비돼 있으면: 이미지를 카카오 서버에 올리고(uploadImage) 그 이미지가 들어간 피드 카드로 공유
 * 2) 안 되면: 휴대폰 기본 공유 창(사진 첨부, 카카오톡 선택 가능)
 * 3) 그것도 안 되면 "download"를 돌려줘서 호출한 쪽이 이미지 저장으로 대신하게 한다
 */
export async function shareTimetableImage(
  png: Blob,
  { title, description, fileName }: { title: string; description: string; fileName: string },
  /** 카카오 공유가 안 돼 다른 방법으로 넘어갈 때 (이유: "sdk" = SDK 미준비, 그 밖엔 카카오 오류 메시지) — 화면에 알리고 기록하려고 */
  onKakaoFail?: (reason: string) => void,
): Promise<"kakao" | "native" | "download"> {
  const file = new File([png], `${fileName.replace(/[\\/:*?"<>|]/g, "")}.png`, { type: "image/png" });
  const kakao = window.Kakao;
  if (!(kakao?.isInitialized?.() && kakao.Share.uploadImage)) onKakaoFail?.("sdk");
  else {
    try {
      const { infos } = await kakao.Share.uploadImage({ file: [file] });
      const link = { mobileWebUrl: SITE_URL, webUrl: SITE_URL };
      kakao.Share.sendDefault({
        objectType: "feed",
        content: {
          title,
          description,
          imageUrl: infos.original.url,
          imageWidth: infos.original.width,
          imageHeight: infos.original.height,
          link,
        },
        buttons: [{ title: "나도 시간표 짜기", link }],
      });
      return "kakao";
    } catch (e) {
      // 예: 카카오 개발자 콘솔에 사이트 도메인이 없으면 {code:-401, msg:"domain mismatched!"}
      const err = e as { msg?: string; message?: string; code?: number };
      onKakaoFail?.(String(err?.code ?? "") + " " + (err?.msg ?? err?.message ?? "unknown"));
    }
  }
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title, text: `${description}\n${SITE_URL}` });
      return "native";
    } catch (e) {
      if ((e as Error).name === "AbortError") return "native"; // 사용자가 공유 창을 닫음
    }
  }
  return "download";
}
