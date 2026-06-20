import { NextRequest } from "next/server";
import { parseSemester } from "@/lib/courses";
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

const CACHE_TTL = 60 * 60 * 24 * 180; // 6개월

const KNU_API =
  "https://knuin.knu.ac.kr/public/web/stddm/lsspr/syllabus/lectPlnInqr/selectListLectPlnInqr";

const HEADERS = {
  "Content-Type": "application/json",
  "Accept": "application/json, text/javascript, */*; q=0.01",
  "X-Requested-With": "XMLHttpRequest",
  "isajax": "true",
  "Referer": "https://knuin.knu.ac.kr/public/stddm/lectPlnInqr.knu",
  "Origin": "https://knuin.knu.ac.kr",
};

function makePayload(year: string, semCode: string) {
  return {
    search: {
      estblYear: year, estblSmstrSctcd: semCode,
      sbjetCd: "", sbjetNm: "", estblDprtnCd: "",
      sbjetSctcd: "", sbjetSctcd2: "", sbjetRelmCd: "01", // 교양
      crgePrfssNm: "", bldngCd: "", bldngNm: "", bldngSn: "",
      lssnsLcttmUntcd: "", rmtCrseYn: "", rltmCrseYn: "",
      flplnCrseYn: "", prctsExrmnYn: "", dgGbDstrcRmtCrseYn: "",
      pstinNtnnvRmtCrseYn: "", riseRmtCrseYn: "", cltreHmntsCltreYn: "",
      knuFtrDesigYn: "", sdgCltreYn: "", sugrdEvltnYn: "",
      lctreLnggeSctcd: "ko", rprsnLctreLnggeSctcd: "",
      isApi: "Y", gubun: "01", contents: "",
    },
  };
}

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const sem = req.nextUrl.searchParams.get("sem") ?? "";

  const parsed = parseSemester(sem);
  if (!parsed) {
    return new Response(JSON.stringify({ error: "학기 형식 오류" }), { status: 400 });
  }
  const { year, semCode } = parsed;

  const cacheKey = `gyoyang:${sem}`;
  const encoder = new TextEncoder();

  // 캐시 히트
  try {
    const cached = await redis.get<object[]>(cacheKey);
    if (cached && Array.isArray(cached)) {
      const stream = new ReadableStream({
        start(controller) {
          const send = (obj: object) =>
            controller.enqueue(encoder.encode("data: " + JSON.stringify(obj) + "\n\n"));
          send({ type: "done", rows: cached, cached: true });
          controller.close();
        },
      });
      return new Response(stream, {
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" },
      });
    }
  } catch { /* 캐시 오류 시 KNU API 호출 */ }

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: object) =>
        controller.enqueue(encoder.encode("data: " + JSON.stringify(obj) + "\n\n"));

      try {
        const res = await fetch(KNU_API, {
          method: "POST",
          headers: HEADERS,
          body: JSON.stringify(makePayload(year, semCode)),
          signal: AbortSignal.timeout(30000),
        });
        if (!res.ok) { send({ type: "error", message: "KNU API 오류" }); controller.close(); return; }

        const json = await res.json();
        const raw: Record<string, string>[] = Array.isArray(json) ? json : (json?.data ?? []);

        const rows = raw
          .filter((r) => r.sbjetSctnm === "교양")
          .map((r) => ({
            grade: r.estblGrade ?? "",
            crseNo: r.crseNo ?? "",
            name: r.sbjetNm ?? "",
            code: r.sbjetCd ?? "",
            credit: r.crdit ?? "",
            dept: r.estblDprtnNm ?? "",
            prof: r.totalPrfssNm ?? "",
            timeStr: r.lssnsRealTimeInfo ?? "",
            rmrk: r.rmrk ? String(r.rmrk).replace(/<[^>]*>/g, "").trim() : "",
          }));

        send({ type: "done", rows });

        // 캐시 저장
        await redis.set(cacheKey, rows, { ex: CACHE_TTL }).catch(() => {});
      } catch {
        send({ type: "error", message: "조회 실패" });
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" },
  });
}
