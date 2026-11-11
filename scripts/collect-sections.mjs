#!/usr/bin/env node
/**
 * 학기 전체 개설강좌 수집기 (KNU 강의계획서 API)
 *
 * 사용법:
 *   node scripts/collect-sections.mjs 2026-1 2026-2      # 지정 학기
 *   node scripts/collect-sections.mjs                    # 기본: 현재 시점 기준 다음 학기까지
 *
 * 출력:
 *   web/public/data/sections/{sem}.json   정규화된 분반 목록
 *   web/public/data/index.json            학기 목록 + 수집 시각/건수
 *
 * 안전장치: 결과가 비었거나 직전 파일보다 50% 이상 줄면 덮어쓰지 않고 실패(exit 1).
 * 의존성 없음 (Node 18+ 내장 fetch).
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "web", "public", "data");
const SCHEMA_VERSION = 1;

const API = "https://knuin.knu.ac.kr/public/web/stddm/lsspr/syllabus/lectPlnInqr/selectListLectPlnInqr";
const HEADERS = {
  "Content-Type": "application/json",
  Accept: "application/json, text/javascript, */*; q=0.01",
  "X-Requested-With": "XMLHttpRequest",
  isajax: "true",
  Referer: "https://knuin.knu.ac.kr/public/stddm/lectPlnInqr.knu",
  Origin: "https://knuin.knu.ac.kr",
};
const SEM_CODES = { 1: "CMBS001400001", 2: "CMBS001400002", s: "CMBS001400004", w: "CMBS001400003" };
const SEARCH_KEYS = (
  "sbjetCd sbjetNm estblDprtnCd sbjetSctcd sbjetSctcd2 sbjetRelmCd crgePrfssNm bldngCd bldngNm bldngSn " +
  "lssnsLcttmUntcd rmtCrseYn rltmCrseYn flplnCrseYn prctsExrmnYn dgGbDstrcRmtCrseYn pstinNtnnvRmtCrseYn " +
  "riseRmtCrseYn cltreHmntsCltreYn knuFtrDesigYn sdgCltreYn sugrdEvltnYn rprsnLctreLnggeSctcd contents"
).split(" ");
const DAYS = { 월: 0, 화: 1, 수: 2, 목: 3, 금: 4, 토: 5, 일: 6 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function query(year, semCode, extra = {}) {
  const search = Object.fromEntries(SEARCH_KEYS.map((k) => [k, ""]));
  Object.assign(search, { estblYear: year, estblSmstrSctcd: semCode, lctreLnggeSctcd: "ko", isApi: "Y", gubun: "01" }, extra);
  let lastErr;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(API, {
        method: "POST",
        headers: HEADERS,
        body: JSON.stringify({ search }),
        signal: AbortSignal.timeout(120_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      return Array.isArray(json) ? json : json?.data ?? [];
    } catch (e) {
      lastErr = e;
      console.warn(`  retry ${attempt}/4 (${e.message})`);
      await sleep(3000 * attempt);
    }
  }
  throw lastErr;
}

/** "목 15:00 ~ 16:30,화 15:00 ~ 16:30" → [[1,900,990],[3,900,990]] (요일, 시작분, 종료분) */
function parseSlots(str) {
  if (!str) return [];
  const slots = [];
  for (const m of str.matchAll(/([월화수목금토일])\s*(\d{1,2}):(\d{2})\s*~\s*(\d{1,2}):(\d{2})/g)) {
    slots.push([DAYS[m[1]], +m[2] * 60 + +m[3], +m[4] * 60 + +m[5]]);
  }
  return slots.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

const clean = (s) => (s == null ? "" : String(s).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());

function campusOf(r) {
  const loc = r.lctrmInfo ?? "";
  if (loc.startsWith("상주") || (r.rmrk ?? "").includes("상주캠퍼스")) return "상주";
  if (loc.startsWith("동인동")) return "동인동";
  if (loc.startsWith("산격동")) return "산격동";
  return "";
}

function normalize(r, flags) {
  const remark = clean(r.rmrk);
  const tags = [];
  if (flags.sdg.has(r.crseNo)) tags.push("SDG");
  if (flags.hmnts.has(r.crseNo)) tags.push("인문교양");
  if (flags.future.has(r.crseNo)) tags.push("KNU미래설계");
  if (remark.includes("원격")) tags.push("원격");
  if (remark.includes("SU평가")) tags.push("SU평가");
  if (remark.includes("플립드")) tags.push("플립드");
  return {
    id: r.crseNo,                                  // 분반 고유번호 COMP0453-003
    code: r.sbjetCd,                               // 과목코드
    name: clean(r.sbjetNm),
    type: r.sbjetSctnm ?? "",                      // 이수구분: 전공/전공필수/교양/교직/일반선택/...
    credit: Number(r.crdit) || 0,
    grade: r.estblGrade ?? "",                     // "1"~"6", "*", ""(대학원 등)
    college: r.estblUnivNm ?? "",
    dept: r.estblDprtnNm ?? "",
    deptCd: r.estblDprtnCd ?? "",
    profs: (r.totalPrfssNm ?? "").split(",").map((p) => p.trim()).filter(Boolean),
    time: r.lssnsRealTimeInfo ?? "",
    slots: parseSlots(r.lssnsRealTimeInfo),
    campus: campusOf(r),
    room: [clean(r.lctrmInfo).replace(/^(산격동|동인동|상주)\s*캠퍼스\s*/, ""), r.rmnmCd ? `${r.rmnmCd}호` : ""].filter(Boolean).join(" "),
    remark,
    tags,
    capacity: r.attlcPrscpCnt ?? null,            // 수강정원
    applied: r.appcrCnt ?? null,                  // 신청인원 (수집 시점 기준)
    basket: r.pckgeRqstCnt ?? null,               // 수강꾸러미 신청인원
  };
}

// 학기 순서: 1학기 → 여름계절 → 2학기 → 겨울계절 (web/lib/planner/semester.ts와 같은 규칙)
const TERMS = ["1", "s", "2", "w"];
const nextSem = (sem) => {
  const [y, t] = sem.split("-");
  const i = TERMS.indexOf(t);
  return i === 3 ? `${+y + 1}-1` : `${y}-${TERMS[i + 1]}`;
};

const prevSem = (sem) => {
  const [y, t] = sem.split("-");
  const i = TERMS.indexOf(t);
  return i === 0 ? `${+y - 1}-w` : `${y}-${TERMS[i - 1]}`;
};

/**
 * 매일 수집할 학기: 진행 중인 학기 + 지금 수강신청을 준비할 학기 + 그다음 학기
 * (준비 학기: 4~6월 여름, 7~9월 2학기, 10~11월 겨울, 12~3월 1학기)
 * 예) 11월 → 2026-2 · 2026-w · 2027-1. 아직 안 열린 학기(0건)는 건너뛰므로 다음 해 학기도 미리 뜨면 바로 잡힌다.
 */
function defaultSems(now = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const cur = m >= 4 && m <= 6 ? `${y}-s` : m >= 7 && m <= 9 ? `${y}-2` : m >= 10 && m <= 11 ? `${y}-w` : m === 12 ? `${y + 1}-1` : `${y}-1`;
  return [prevSem(cur), cur, nextSem(cur)];
}

async function readJson(file) {
  try { return JSON.parse(await readFile(file, "utf-8")); } catch { return null; }
}

async function collect(sem) {
  const [year, term] = sem.split("-");
  const semCode = SEM_CODES[term];
  if (!semCode) throw new Error(`잘못된 학기: ${sem} (예: 2026-1, 2026-s)`);

  console.log(`[${sem}] 전체 조회...`);
  const t0 = Date.now();
  const rows = await query(year, semCode);
  console.log(`[${sem}] ${rows.length}건 (${((Date.now() - t0) / 1000).toFixed(1)}s)`);

  // 전체 조회 응답에 없는 교양 속성은 필터 조회로 보충 (각각 소량)
  const flagQuery = async (extra) => new Set((await query(year, semCode, extra)).map((r) => r.crseNo));
  const flags = {
    sdg: await flagQuery({ sdgCltreYn: "Y" }),
    hmnts: await flagQuery({ cltreHmntsCltreYn: "Y" }),
    future: await flagQuery({ knuFtrDesigYn: "Y" }),
  };

  const seen = new Set();
  const sections = [];
  for (const r of rows) {
    if (!r.crseNo || seen.has(r.crseNo)) continue;
    seen.add(r.crseNo);
    sections.push(normalize(r, flags));
  }
  sections.sort((a, b) => a.id.localeCompare(b.id));

  const file = path.join(OUT_DIR, "sections", `${sem}.json`);
  const prev = await readJson(file);
  const prevCount = prev?.sections?.length ?? 0;
  if (sections.length === 0 && prevCount === 0) {
    console.log(`[${sem}] 아직 개설 정보가 없어요 → 건너뜀`);
    return null;
  }
  if (sections.length === 0 || (prevCount > 0 && sections.length < prevCount * 0.5)) {
    throw new Error(`[${sem}] 결과 이상: ${sections.length}건 (이전 ${prevCount}건) → 저장 안 함`);
  }

  // 내용이 그대로면 파일을 다시 쓰지 않는다 (불필요한 커밋·재배포 방지)
  if (prev && JSON.stringify(prev.sections) === JSON.stringify(sections)) {
    console.log(`[${sem}] 변경 없음`);
    return { sem, collectedAt: prev.collectedAt, count: prev.count, unchanged: true };
  }
  const collectedAt = new Date().toISOString();
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify({ v: SCHEMA_VERSION, sem, collectedAt, count: sections.length, sections }));
  console.log(`[${sem}] 저장: ${path.relative(ROOT, file)} (${sections.length}분반)`);
  return { sem, collectedAt, count: sections.length };
}

async function main() {
  const sems = process.argv.slice(2).length ? process.argv.slice(2) : defaultSems();
  const indexFile = path.join(OUT_DIR, "index.json");
  const index = (await readJson(indexFile)) ?? { v: SCHEMA_VERSION, semesters: {} };
  let failed = false;
  let succeeded = 0;
  let changed = 0;
  for (const sem of sems) {
    try {
      const r = await collect(sem);
      if (r) {
        if (!r.unchanged) { index.semesters[sem] = r; changed++; }
        succeeded++;
      }
    } catch (e) {
      console.error(e.message);
      failed = true;
    }
  }
  if (succeeded === 0) process.exit(failed ? 1 : 0);
  if (changed === 0) { console.log("바뀐 학기 없음"); if (failed) process.exit(1); return; }
  index.updatedAt = new Date().toISOString();
  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(indexFile, JSON.stringify(index, null, 2) + "\n");
  if (failed) process.exit(1);
}

main();
