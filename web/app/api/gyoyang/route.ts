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

function makePayload(year: string, semCode: string, extra: Record<string, string> = {}) {
  return {
    search: {
      estblYear: year, estblSmstrSctcd: semCode,
      sbjetCd: "", sbjetNm: "", estblDprtnCd: "",
      sbjetSctcd: "", sbjetSctcd2: "", sbjetRelmCd: "",
      crgePrfssNm: "", bldngCd: "", bldngNm: "", bldngSn: "",
      lssnsLcttmUntcd: "", rmtCrseYn: "", rltmCrseYn: "",
      flplnCrseYn: "", prctsExrmnYn: "", dgGbDstrcRmtCrseYn: "",
      pstinNtnnvRmtCrseYn: "", riseRmtCrseYn: "", cltreHmntsCltreYn: "",
      knuFtrDesigYn: "", sdgCltreYn: "", sugrdEvltnYn: "",
      lctreLnggeSctcd: "ko", rprsnLctreLnggeSctcd: "",
      isApi: "Y", gubun: "01", contents: "",
      ...extra,
    },
  };
}

function getTag(r: Record<string, string>, isFuture = false): string {
  if (r.sdgCltreYn === "Y") return "SDG";
  if (r.cltreHmntsCltreYn === "Y") return "인문교양";
  if (isFuture || r.knuFtrDesigYn === "Y") return "일반선택";
  return "교양";
}

async function fetchRows(year: string, semCode: string, extra: Record<string, string>): Promise<Record<string, string>[]> {
  const res = await fetch(KNU_API, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify(makePayload(year, semCode, extra)),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) return [];
  const json = await res.json();
  return Array.isArray(json) ? json : (json?.data ?? []);
}

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const sem = req.nextUrl.searchParams.get("sem") ?? "";

  const parsed = parseSemester(sem);
  if (!parsed) {
    return new Response(JSON.stringify({ error: "학기 형식 오류" }), { status: 400 });
  }
  const { year, semCode } = parsed;

  const cacheKey = `gyoyang:v2:${sem}`;
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
        // 교양 + KNU미래설계(일반선택) 병렬 조회
        const [gyoyangRaw, futureRaw] = await Promise.all([
          fetchRows(year, semCode, { sbjetRelmCd: "01" }),
          fetchRows(year, semCode, { knuFtrDesigYn: "Y" }),
        ]);

        // crseNo 기준 중복 제거 (교양에 이미 있으면 스킵)
        const seenCrseNo = new Set<string>();
        const toRow = (r: Record<string, string>, isFuture = false) => ({
          grade: r.estblGrade ?? "",
          crseNo: r.crseNo ?? "",
          name: r.sbjetNm ?? "",
          code: r.sbjetCd ?? "",
          credit: r.crdit ?? "",
          dept: r.estblDprtnNm ?? "",
          prof: r.totalPrfssNm ?? "",
          timeStr: r.lssnsRealTimeInfo ?? "",
          rmrk: r.rmrk ? String(r.rmrk).replace(/<[^>]*>/g, "").trim() : "",
          tag: getTag(r, isFuture),
        });

        const rows = [
          ...gyoyangRaw.filter((r) => {
            const no = r.crseNo ?? "";
            if (seenCrseNo.has(no)) return false;
            seenCrseNo.add(no);
            return true;
          }).map((r) => toRow(r, false)),
          ...futureRaw.filter((r) => {
            const no = r.crseNo ?? "";
            if (seenCrseNo.has(no)) return false;
            seenCrseNo.add(no);
            return true;
          }).map((r) => toRow(r, true)),
        ];

        send({ type: "done", rows });
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
