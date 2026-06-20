import { NextRequest } from "next/server";
import { Course, COURSES_BY_MAJOR, Major, parseSemester } from "@/lib/courses";
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

function makePayload(year: string, semCode: string, code: string) {
  return {
    search: {
      estblYear: year, estblSmstrSctcd: semCode, sbjetCd: code,
      sbjetNm: "", estblDprtnCd: "", sbjetSctcd: "", sbjetSctcd2: "",
      sbjetRelmCd: "", crgePrfssNm: "", bldngCd: "", bldngNm: "",
      bldngSn: "", lssnsLcttmUntcd: "", rmtCrseYn: "", rltmCrseYn: "",
      flplnCrseYn: "", prctsExrmnYn: "", dgGbDstrcRmtCrseYn: "",
      pstinNtnnvRmtCrseYn: "", riseRmtCrseYn: "", cltreHmntsCltreYn: "",
      knuFtrDesigYn: "", sdgCltreYn: "", sugrdEvltnYn: "",
      lctreLnggeSctcd: "ko", rprsnLctreLnggeSctcd: "",
      isApi: "Y", gubun: "01", contents: code,
    },
  };
}

export const maxDuration = 60;

async function fetchCourse(year: string, semCode: string, course: Course) {
  try {
    const res = await fetch(KNU_API, {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify(makePayload(year, semCode, course.code)),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const json = await res.json();
    const rows: Record<string, string>[] = Array.isArray(json) ? json : (json?.data ?? []);
    return rows.map((row) => ({
      grade: course.grade,
      credit: course.credit,
      crseNo: row.crseNo ?? course.code,
      name: course.name,
      dept: row.estblDprtnNm ?? "",
      prof: row.totalPrfssNm ?? "",
      timeStr: row.lssnsRealTimeInfo ?? "",
      rmrk: row.rmrk ? String(row.rmrk).replace(/<[^>]*>/g, "").trim() : "",
    }));
  } catch {
    return [];
  }
}

export async function GET(req: NextRequest) {
  const sem = req.nextUrl.searchParams.get("sem") ?? "";
  const majorParam = (req.nextUrl.searchParams.get("major") ?? "ai") as Major;
  const COURSES = COURSES_BY_MAJOR[majorParam] ?? COURSES_BY_MAJOR["ai"];

  const parsed = parseSemester(sem);
  if (!parsed) {
    return new Response(
      JSON.stringify({ error: "학기 형식이 올바르지 않습니다. (예: 2026-1)" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }
  const { year, semCode } = parsed;

  const cacheKey = `sections:${majorParam}:${sem}`;

  // 캐시 히트 → SSE로 즉시 전송
  try {
    const cached = await redis.get<object[]>(cacheKey);
    if (cached && Array.isArray(cached)) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          const send = (obj: object) =>
            controller.enqueue(encoder.encode("data: " + JSON.stringify(obj) + "\n\n"));
          const CHUNK = 20;
          for (let i = 0; i < cached.length; i += CHUNK) {
            send({ type: "progress", current: Math.min(i + CHUNK, cached.length), total: cached.length, name: "", rows: cached.slice(i, i + CHUNK), cached: true });
          }
          send({ type: "done", totalRows: cached.length, cached: true });
          controller.close();
        },
      });
      return new Response(stream, {
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" },
      });
    }
  } catch { /* 캐시 오류 시 그냥 KNU API 호출 */ }

  const encoder = new TextEncoder();
  const BATCH = 5;
  const total = COURSES.length;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: object) =>
        controller.enqueue(encoder.encode("data: " + JSON.stringify(obj) + "\n\n"));

      let done = 0;
      const allRows: object[] = [];

      for (let i = 0; i < COURSES.length; i += BATCH) {
        const batch = COURSES.slice(i, i + BATCH);
        const results = await Promise.all(batch.map((c) => fetchCourse(year, semCode, c)));
        for (let j = 0; j < batch.length; j++) {
          done++;
          allRows.push(...results[j]);
          send({ type: "progress", current: done, total, name: batch[j].name, rows: results[j] });
        }
      }

      send({ type: "done", totalRows: allRows.length });

      // 캐시 저장 (비동기, 스트림 닫은 후)
      try {
        await redis.set(cacheKey, allRows, { ex: CACHE_TTL });
      } catch { /* 캐시 저장 실패 무시 */ }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" },
  });
}
