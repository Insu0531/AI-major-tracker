import { NextRequest } from "next/server";
import { parseSemester } from "@/lib/courses";
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

const CACHE_TTL = 60 * 60 * 24 * 180;

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
      estblYear: year,
      estblSmstrSctcd: semCode,
      sbjetCd: "", sbjetNm: "", estblDprtnCd: "",
      sbjetSctcd: "STCU000800007",
      sbjetRelmCd: "",
      sbjetSctcd2: "", crgePrfssNm: "", bldngCd: "", bldngNm: "", bldngSn: "",
      lssnsLcttmUntcd: "", rmtCrseYn: "", rltmCrseYn: "",
      flplnCrseYn: "", prctsExrmnYn: "", dgGbDstrcRmtCrseYn: "",
      pstinNtnnvRmtCrseYn: "", riseRmtCrseYn: "", cltreHmntsCltreYn: "",
      knuFtrDesigYn: "", sdgCltreYn: "", sugrdEvltnYn: "",
      lctreLnggeSctcd: "ko", rprsnLctreLnggeSctcd: "",
      isApi: "Y", gubun: "01", contents: "",
    },
  };
}

async function fetchRows(year: string, semCode: string): Promise<Record<string, string>[]> {
  const res = await fetch(KNU_API, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify(makePayload(year, semCode)),
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
  if (!parsed) return new Response(JSON.stringify({ error: "학기 형식 오류" }), { status: 400 });
  const { year, semCode } = parsed;

  const cacheKey = `kyoshik:v1:${sem}`;
  const encoder = new TextEncoder();

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
        const raw = await fetchRows(year, semCode);
        const seen = new Set<string>();
        const toRow = (r: Record<string, string>) => ({
          grade: r.estblGrade ?? "",
          crseNo: r.crseNo ?? "",
          name: r.sbjetNm ?? "",
          code: r.sbjetCd ?? "",
          credit: r.crdit ?? "",
          dept: r.estblDprtnNm ?? "",
          prof: r.totalPrfssNm ?? "",
          timeStr: r.lssnsRealTimeInfo ?? "",
          rmrk: r.rmrk ? String(r.rmrk).replace(/<[^>]*>/g, "").trim() : "",
          location: [r.lctrmInfo, r.rmnmCd ? `${r.rmnmCd}호` : ""].filter((v) => v && String(v).trim()).join("\n"),
          tag: "교직",
        });
        const rows = raw.filter((r) => {
          const no = r.crseNo ?? "";
          if (seen.has(no)) return false;
          seen.add(no);
          return true;
        }).map(toRow);

        send({ type: "done", rows });
        await redis.set(cacheKey, rows, { ex: CACHE_TTL }).catch(() => {});
      } catch {
        send({ type: "error", message: "교직 과목 조회 실패" });
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" },
  });
}
