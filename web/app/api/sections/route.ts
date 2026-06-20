import { NextRequest, NextResponse } from "next/server";
import { COURSES, parseSemester } from "@/lib/courses";

const KNU_API =
  "https://knuin.knu.ac.kr/public/web/stddm/lsspr/syllabus/lectPlnInqr/selectListLectPlnInqr";

export async function GET(req: NextRequest) {
  const sem = req.nextUrl.searchParams.get("sem") ?? "";
  const parsed = parseSemester(sem);
  if (!parsed) {
    return NextResponse.json({ error: "학기 형식이 올바르지 않습니다. (예: 2026-1)" }, { status: 400 });
  }
  const { year, semCode } = parsed;

  const results: object[] = [];

  for (const course of COURSES) {
    try {
      const res = await fetch(KNU_API, {
        method: "POST",
        headers: { "Content-Type": "application/json;charset=UTF-8" },
        body: JSON.stringify({
          year,
          smrCd: semCode,
          sbjetCd: course.code,
          openSbjetYn: "Y",
        }),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const json = await res.json();
      const rows: Record<string, string>[] = json?.data ?? [];
      for (const row of rows) {
        results.push({
          grade: course.grade,
          credit: course.credit,
          crseNo: row.crseNo ?? course.code,
          name: course.name,
          dept: row.estblDprtnNm ?? "",
          prof: row.totalPrfssNm ?? "",
          timeStr: row.lssnsRealTimeInfo ?? "",
        });
      }
    } catch {
      // 개별 과목 실패는 무시하고 계속
    }
  }

  return NextResponse.json({ data: results });
}
