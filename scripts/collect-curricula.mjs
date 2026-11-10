#!/usr/bin/env node
/**
 * 전 학과 이수체계(교육과정편람) 자동 수집기
 *
 * 1. 수집된 학기 스냅샷(web/public/data/sections/*.json)에서 학부 개설학과 코드를 모은다
 * 2. 이미 사이트에 있는 학과(web/lib/courses.ts의 MAJOR_META · MAJOR_LABELS)는 건너뛴다 (코드 또는 학과명으로 비교)
 * 3. 남은 학과마다 입학연도별로 KNU 교육과정 API(searchEduCourList)를 호출
 *    - 6자리 전공 코드(예: 170T01)는 4자리 학부 공통 과정(170T)도 함께 받아 합친다 (add_major.py --base와 같은 규칙)
 *    - 결과가 하나도 없는 코드(학사과·하위 개설 코드 등)는 버린다
 * 4. web/public/courses/d_{코드}/{연도}.json 과 web/public/data/majors-extra.json 을 만든다
 *
 * 사용법: node scripts/collect-curricula.mjs [--years 2021-2026] [--only 160E,170R]
 * 의존성 없음 (Node 18+). 연속 요청 시 학교 서버가 연결을 끊으므로 요청 사이 간격 + 재시도.
 */
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WEB = path.join(ROOT, "web");
const API = "https://knuin.knu.ac.kr/public/web/stddm/curse/educourse/eduCour/searchEduCourList";
const HEADERS = {
  "Content-Type": "application/json",
  Accept: "application/json, text/javascript, */*; q=0.01",
  "X-Requested-With": "XMLHttpRequest",
  "User-Agent": "Mozilla/5.0",
  Referer: "https://knuin.knu.ac.kr/public/stddm/edu.knu",
  Origin: "https://knuin.knu.ac.kr",
};
const GAP_MS = 500;

const args = process.argv.slice(2);
const argVal = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const [y0, y1] = (argVal("--years") ?? `2021-${new Date().getFullYear()}`).split("-").map(Number);
const YEARS = Array.from({ length: y1 - y0 + 1 }, (_, i) => y0 + i);
const ONLY = argVal("--only")?.split(",");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => s.replace(/^\[[^\]]+\]/, "").replace(/\(.*?\)/g, "").replace(/[\s\-.·]/g, "");

async function fetchCurriculum(deptCd, year) {
  const body = { isApi: "Y", search: { trgtYrsf: String(year), dprtnCd: deptCd, dprtnNm: "", sbjetSctinClscd: "STCU000700001", isApi: "Y" } };
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(API, { method: "POST", headers: HEADERS, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      await sleep(GAP_MS);
      return json?.data ?? [];
    } catch (e) {
      await sleep(2000 * attempt);
      if (attempt === 4) { console.warn(`  ! ${deptCd} ${year}: ${e.message}`); return null; }
    }
  }
}

/** add_major.py parse_courses와 같은 형식: 교양 공통(CLTR) 제외, 과목코드 중복 제거 */
function parse(rows) {
  const out = new Map();
  for (const r of rows ?? []) {
    const code = r.sbjetCd, name = (r.sbjetNm ?? "").trim();
    if (!code || !name || code.startsWith("CLTR") || out.has(code)) continue;
    out.set(code, { grade: r.estblGrade ?? "", code, name, credit: r.crditSystem ?? "" });
  }
  return out;
}

async function main() {
  // 1. 스냅샷에서 학부 개설학과
  const secDir = path.join(WEB, "public", "data", "sections");
  const depts = new Map(); // deptCd → { name, college, sangju, total }
  for (const f of await readdir(secDir)) {
    const { sections } = JSON.parse(await readFile(path.join(secDir, f), "utf-8"));
    for (const s of sections) {
      if (!s.deptCd || s.deptCd.length < 4 || s.deptCd.length > 6 || s.college.includes("대학원")) continue;
      const d = depts.get(s.deptCd) ?? { name: s.dept, college: s.college, sangju: 0, total: 0 };
      d.total++;
      if (s.campus === "상주") d.sangju++;
      depts.set(s.deptCd, d);
    }
  }

  // 2. 이미 있는 학과
  const ts = await readFile(path.join(WEB, "lib", "courses.ts"), "utf-8");
  const haveCodes = new Set([...ts.matchAll(/(?:deptCd|baseDeptCd): "([^"]+)"/g)].map((m) => m[1]));
  const labelBlock = ts.slice(ts.indexOf("MAJOR_LABELS"), ts.indexOf("MAJOR_META"));
  const haveNames = new Set([...labelBlock.matchAll(/:\s*"([^"]+)"/g)].map((m) => norm(m[1])));
  // 기존 데이터에 1O02xx(영문 O)가 1002xx로 적힌 경우가 있어 둘 다 비교
  const known = (cd) => haveCodes.has(cd) || haveCodes.has(cd.replace(/O/g, "0"));

  const targets = [...depts.entries()].filter(([cd, d]) => (ONLY ? ONLY.includes(cd) : !known(cd) && !haveNames.has(norm(d.name))));
  console.log(`학부 개설학과 ${depts.size}개 중 새로 확인할 학과 ${targets.length}개 · 연도 ${YEARS.join(",")}`);

  const outFile = path.join(WEB, "public", "data", "majors-extra.json");
  let prev = [];
  try { prev = JSON.parse(await readFile(outFile, "utf-8")); } catch { /* 처음 */ }
  const result = new Map(prev.map((m) => [m.deptCd, m]));
  const baseCache = new Map();

  for (const [cd, d] of targets) {
    const base = cd.length === 6 ? cd.slice(0, 4) : null;
    const years = [];
    let total = 0;
    for (const year of YEARS) {
      const rows = await fetchCurriculum(cd, year);
      if (rows === null) continue;
      const own = parse(rows);
      if (!own.size) continue;
      if (base) {
        const key = `${base}-${year}`;
        if (!baseCache.has(key)) baseCache.set(key, parse(await fetchCurriculum(base, year)));
        for (const [code, c] of baseCache.get(key)) if (!own.has(code)) own.set(code, c);
      }
      const list = [...own.values()].sort((a, b) => a.grade.localeCompare(b.grade) || a.name.localeCompare(b.name, "ko"));
      const dir = path.join(WEB, "public", "courses", `d_${cd}`);
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, `${year}.json`), JSON.stringify(list, null, 2) + "\n");
      years.push(year);
      total += list.length;
    }
    if (!years.length) { console.log(`  - ${cd} ${d.name}: 교육과정 없음 → 건너뜀`); continue; }
    const sangju = d.sangju > d.total / 2;
    const label = `${sangju ? "[상주]" : ""}${d.name.replace(/\s+/g, " ").replace(/^(\S+부) (\S+전공)$/, "$1-$2")}`;
    result.set(cd, { key: `d_${cd}`, label, deptCd: cd, baseDeptCd: base ?? undefined, college: d.college, years });
    console.log(`  ✓ ${cd} ${label}: ${years.join(",")} (평균 ${Math.round(total / years.length)}과목)`);
  }

  const list = [...result.values()].sort((a, b) => a.label.localeCompare(b.label, "ko"));
  await writeFile(outFile, JSON.stringify(list, null, 2) + "\n");
  console.log(`저장: ${path.relative(ROOT, outFile)} (${list.length}개 학과)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
