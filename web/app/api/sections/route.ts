import { NextRequest } from "next/server";
import { COURSES, parseSemester } from "@/lib/courses";

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
      estblYear: year,
      estblSmstrSctcd: semCode,
      sbjetCd: code,
      sbjetNm: "",
      estblDprtnCd: "",
      sbjetSctcd: "",
      sbjetSctcd2: "",
      sbjetRelmCd: "",
      crgePrfssNm: "",
      bldngCd: "",
      bldngNm: "",
      bldngSn: "",
      lssnsLcttmUntcd: "",
      rmtCrseYn: "",
      rltmCrseYn: "",
      flplnCrseYn: "",
      prctsExrmnYn: "",
      dgGbDstrcRmtCrseYn: "",
      pstinNtnnvRmtCrseYn: "",
      riseRmtCrseYn: "",
      cltreHmntsCltreYn: "",
      knuFtrDesigYn: "",
      sdgCltreYn: "",
      sugrdEvltnYn: "",
      lctreLnggeSctcd: "ko",
      rprsnLctreLnggeSctcd: "",
      isApi: "Y",
      gubun: "01",
      contents: code,
    },
  };
}

export const maxDuration = 60;

async function fetchCourse(year: string, semCode: string, course: typeof COURSES[0]) {
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
    }));
  } catch {
    return [];
  }
}

export async function GET(req: NextRequest) {
  const sem = req.nextUrl.searchParams.get("sem") ?? "";
  const parsed = parseSemester(sem);
  if (!parsed) {
    return new Response(
      JSON.stringify({ error: "학기 형식이 올바르지 않습니다. (예: 2026-1)" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }
  const { year, semCode } = parsed;

  // 5개씩 묶어서 병렬 호출 (KNU 서버 과부하 방지)
  const BATCH = 5;
  const allRows: object[] = [];

  for (let i = 0; i < COURSES.length; i += BATCH) {
    const batch = COURSES.slice(i, i + BATCH);
    const results = await Promise.all(batch.map((c) => fetchCourse(year, semCode, c)));
    results.forEach((rows) => allRows.push(...rows));
  }

  return new Response(JSON.stringify({ data: allRows }), {
    headers: { "Content-Type": "application/json" },
  });
}
