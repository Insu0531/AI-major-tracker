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
 * --from-list: 스냅샷 대신 scripts/data/knu-depts.txt(학부·대학원 전체 코드표)의 코드를 모두 확인한다.
 *   먼저 2026·2023·2021 학번만 찔러 보고 하나라도 나오면 전 학번을 받는다 (빈 코드는 버림).
 *   대학원 코드는 sbjetSctinClscd를 비워야 결과가 나온다. 대학원 학과는 level: "grad"로 저장.
 *   하위 전공(학부 6자리, 대학원 7자리)은 상위 학과 공통 과정을 합친다.
 *
 * 사용법: node scripts/collect-curricula.mjs [--years 2021-2026] [--only 160E,170R] [--from-list] [--workers 3]
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
const FROM_LIST = args.includes("--from-list");
const WORKERS = Number(argVal("--workers") ?? (FROM_LIST ? 3 : 1));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => s.replace(/^\[[^\]]+\]/, "").replace(/\(.*?\)/g, "").replace(/[\s\-.·]/g, "");

async function fetchCurriculum(deptCd, year, grad = false) {
  const body = { isApi: "Y", search: { trgtYrsf: String(year), dprtnCd: deptCd, dprtnNm: "", sbjetSctinClscd: grad ? "" : "STCU000700001", isApi: "Y" } };
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

/** scripts/data/knu-depts.txt → [{ code, name, level, college, parent }] */
async function readList() {
  const txt = await readFile(path.join(ROOT, "scripts", "data", "knu-depts.txt"), "utf-8");
  const out = new Map();
  let level = "학부", college = "";
  for (const raw of txt.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    if (line.startsWith("@")) { [level, college] = [line.slice(1, line.indexOf(" ")), line.slice(line.indexOf(" ") + 1)]; continue; }
    const sp = line.indexOf(" ");
    const code = line.slice(0, sp), name = line.slice(sp + 1).trim();
    if (out.has(code)) continue;
    out.set(code, { code, name, level, college });
  }
  // 상위 학과: 학부 6자리 → 4자리, 대학원 7자리 → 5자리(일반대학원) 또는 3자리(전문대학원)
  for (const e of out.values()) {
    const cands = e.level === "학부" ? (e.code.length === 6 ? [e.code.slice(0, 4)] : []) : e.code.length === 7 ? [e.code.slice(0, 5), e.code.slice(0, 3)] : [];
    e.parent = cands.find((c) => out.has(c)) ?? null;
  }
  return [...out.values()];
}

async function mainFromList(known, haveNames) {
  const list = await readList();
  const byCode = new Map(list.map((e) => [e.code, e]));
  const outFile = path.join(WEB, "public", "data", "majors-extra.json");
  let prev = [];
  try { prev = JSON.parse(await readFile(outFile, "utf-8")); } catch { /* 처음 */ }
  const result = new Map(prev.map((m) => [m.deptCd, m]));
  const targets = list.filter((e) => (ONLY ? ONLY.includes(e.code) : !(e.level === "학부" && (known(e.code) || haveNames.has(norm(e.name))))));
  console.log(`코드표 ${list.length}개 중 확인할 코드 ${targets.length}개 · 학번 ${YEARS.join(",")} · 동시 ${WORKERS}`);

  const cache = new Map(); // `${code}-${year}` → Map
  const get = async (code, year, grad) => {
    const k = `${code}-${year}`;
    if (!cache.has(k)) { const rows = await fetchCurriculum(code, year, grad); cache.set(k, rows === null ? null : parse(rows)); }
    return cache.get(k);
  };
  const probeYears = [YEARS[YEARS.length - 1], YEARS[Math.floor(YEARS.length / 2)], YEARS[0]];
  let done = 0, added = 0;
  const queue = [...targets];
  const worker = async () => {
    for (let e = queue.shift(); e; e = queue.shift()) {
      const grad = e.level === "대학원";
      let hit = false;
      for (const y of probeYears) if ((await get(e.code, y, grad))?.size) { hit = true; break; }
      done++;
      if (!hit) { if (done % 50 === 0) console.log(`  … ${done}/${targets.length}`); continue; }
      const years = [];
      let total = 0;
      for (const year of YEARS) {
        const own = new Map(await get(e.code, year, grad) ?? []);
        if (!own.size) continue;
        if (e.parent) for (const [code, c] of (await get(e.parent, year, grad)) ?? []) if (!own.has(code)) own.set(code, c);
        const list = [...own.values()].sort((a, b) => a.grade.localeCompare(b.grade) || a.name.localeCompare(b.name, "ko"));
        const dir = path.join(WEB, "public", "courses", `d_${e.code}`);
        await mkdir(dir, { recursive: true });
        const file = path.join(dir, `${year}.json`);
        const body = JSON.stringify(list, null, 2) + "\n";
        let old = null;
        try { old = await readFile(file, "utf-8"); } catch { /* 새 파일 */ }
        if (old !== body) await writeFile(file, body);
        years.push(year);
        total += list.length;
      }
      if (!years.length) continue;
      const parentName = e.parent ? byCode.get(e.parent)?.name : null;
      const sangju = e.college.includes("상주");
      const school = grad ? (e.college === "대학원" ? "대학원" : e.college.replace(/^\[상주캠퍼스\]/, "")) : "";
      const base = parentName && parentName !== school ? `${parentName}-${e.name}` : e.name;
      const label = `${sangju ? "[상주]" : ""}${grad && !base.startsWith(school) ? `${school} ` : ""}${base}`;
      result.set(e.code, { key: `d_${e.code}`, label, deptCd: e.code, baseDeptCd: e.parent ?? undefined, college: e.college, ...(grad ? { level: "grad" } : {}), years });
      added++;
      console.log(`  ✓ ${e.code} ${label}: ${years.join(",")} (평균 ${Math.round(total / years.length)}과목) [${done}/${targets.length}]`);
    }
  };
  await Promise.all(Array.from({ length: WORKERS }, worker));

  // 같은 이름이 여러 코드면(예: 옛 코드·새 코드) 학번이 많은 쪽만 남긴다
  const byLabel = new Map();
  for (const m of result.values()) {
    const o = byLabel.get(m.label);
    if (!o || m.years.length > o.years.length) byLabel.set(m.label, m);
  }
  const out = [...byLabel.values()].sort((a, b) => a.label.localeCompare(b.label, "ko"));
  await writeFile(outFile, JSON.stringify(out, null, 2) + "\n");
  console.log(`새로 확인 ${added}개 · 저장 ${path.relative(ROOT, outFile)} (${out.length}개 학과, 대학원 ${out.filter((m) => m.level === "grad").length}개)`);
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

  if (FROM_LIST) return mainFromList(known, haveNames);

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
