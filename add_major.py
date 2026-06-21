"""
전공 과목 자동 추가 스크립트
사용법: python add_major.py <학과코드> <전공키> <전공라벨> [옵션]

옵션:
  --years 2021,2022,2023    조회할 입학연도 목록 (기본: 2026)
  --base <학과코드>          공통 이수체계 학과코드 (3,4학년 전공에 1,2학년 공통 합치기)

예시:
  # 단일 연도 (기본)
  python add_major.py 1O01 ai 전자공학부인공지능전공

  # 여러 입학연도
  python add_major.py 1O01 ai 전자공학부인공지능전공 --years 2021,2022,2023,2024,2025,2026

  # 에너지공학부 (공통 + 전공 합치기)
  python add_major.py 161101 energy_re 에너지공학부-신재생에너지전공 --base 1611 --years 2021,2022,2023,2024,2025,2026
  python add_major.py 161102 energy_cv 에너지공학부-에너지변환전공  --base 1611 --years 2021,2022,2023,2024,2025,2026

JSON은 web/public/courses/{key}/{year}.json 에 저장됩니다.
courses.ts의 Major 타입, MAJOR_LABELS, MAJOR_META도 자동으로 업데이트합니다.
"""

import sys
import json
import re
import os
import argparse
import time
import requests

sys.stdout.reconfigure(encoding="utf-8")

KNU_API = "https://knuin.knu.ac.kr/public/web/stddm/curse/educourse/eduCour/searchEduCourList"
HEADERS = {
    "Content-Type": "application/json",
    "Accept": "application/json, text/javascript, */*; q=0.01",
    "X-Requested-With": "XMLHttpRequest",
    "User-Agent": "Mozilla/5.0",
    "Referer": "https://knuin.knu.ac.kr/public/stddm/edu.knu",
    "Origin": "https://knuin.knu.ac.kr",
}


def fetch_rows(dept_cd: str, year: int) -> list[dict]:
    payload = {
        "isApi": "Y",
        "search": {
            "trgtYrsf": str(year),
            "dprtnCd": dept_cd,
            "dprtnNm": "",
            "sbjetSctinClscd": "STCU000700001",
            "isApi": "Y",
        },
    }
    r = requests.post(KNU_API, json=payload, headers=HEADERS, timeout=15)
    r.raise_for_status()
    data = json.loads(r.content.decode("utf-8"))
    if "data" in data:
        return data["data"]
    raise RuntimeError(f"API 오류: {data.get('msg', '알 수 없는 오류')}")


EXCLUDE_PREFIXES = ("CLTR",)  # 교양 공통과목 코드 — 전공 이수체계에서 제외

def parse_courses(rows: list[dict], exclude_cltr: bool = True) -> list[dict]:
    courses = []
    seen = set()
    for row in rows:
        code = row.get("sbjetCd", "")
        name = row.get("sbjetNm", "")
        credit = row.get("crditSystem", "")
        grade = row.get("estblGrade", "")
        if not code or not name or code in seen:
            continue
        if exclude_cltr and any(code.startswith(p) for p in EXCLUDE_PREFIXES):
            continue
        seen.add(code)
        courses.append({
            "grade": grade,
            "code": code,
            "name": name.strip(),
            "credit": credit,
        })
    return sorted(courses, key=lambda c: (c["grade"], c["name"]))


def update_courses_ts(ts_path: str, key: str, label: str, dept_cd: str, base_cd: str | None):
    with open(ts_path, encoding="utf-8") as f:
        content = f.read()

    # 1. Major 타입에 키 추가
    major_pattern = r'export type Major = (?:"[^"]+"(?:\s*\|\s*"[^"]+")*)'
    match = re.search(major_pattern, content)
    if match:
        existing = re.findall(r'"([^"]+)"', match.group(0))
        if key not in existing:
            existing.append(key)
            content = re.sub(major_pattern, 'export type Major = "' + '" | "'.join(existing) + '"', content)
            print(f"  ✓ Major 타입에 '{key}' 추가")
        else:
            print(f"  - Major 타입에 '{key}' 이미 존재")

    # 2. MAJOR_LABELS에 항목 추가 후 ai 맨 위 + 나머지 ㄱㄴㄷ 정렬로 재작성
    # MAJOR_LABELS 블록만 정확히 잡기 위해 export const 경계로 종료
    labels_match = re.search(
        r'export const MAJOR_LABELS[^{]*\{(.*?)\n\};',
        content, re.DOTALL
    )
    if labels_match:
        entries: dict[str, str] = {}
        for m in re.finditer(r'^\s+"?([\w-]+)"?\s*:\s*"([^"]+)"', labels_match.group(1), re.MULTILINE):
            entries[m.group(1)] = m.group(2)
        added = key not in entries
        entries[key] = label
        # ai 맨 위, [상주] 맨 아래, 나머지 label 기준 가나다 정렬
        ai_entry = {"ai": entries.pop("ai")} if "ai" in entries else {}
        sorted_rest = dict(sorted(entries.items(), key=lambda x: (x[1].startswith("[상주]"), x[1])))
        sorted_entries = {**ai_entry, **sorted_rest}
        def fmt_key(k: str) -> str:
            return f'"{k}"' if not k.isidentifier() else k
        lines = "".join(f'  {fmt_key(k)}: "{v}",\n' for k, v in sorted_entries.items())
        content = re.sub(
            r'(export const MAJOR_LABELS[^{]*\{).*?(\n\};)',
            lambda m: m.group(1) + "\n" + lines + m.group(2),
            content, flags=re.DOTALL,
        )
        if added:
            print(f"  ✓ MAJOR_LABELS에 '{key}: {label}' 추가 및 정렬")
        else:
            print(f"  ✓ MAJOR_LABELS 정렬 ('{key}' 이미 존재)")
    else:
        print(f"  ! MAJOR_LABELS 블록을 찾지 못했습니다")

    # 3. MAJOR_META에 deptCd / baseDeptCd 추가
    meta_entry = f'  {key}: {{ deptCd: "{dept_cd}"' + (f', baseDeptCd: "{base_cd}"' if base_cd else "") + " },"
    # 기존 항목 존재 여부: MAJOR_META 블록 안에서만 확인 (정확한 패턴으로)
    meta_block_match = re.search(r'export const MAJOR_META[^{]*\{(.*?)\n\};', content, re.DOTALL)
    if "MAJOR_META" not in content:
        # MAJOR_META 블록 자체가 없으면 MAJOR_LABELS 뒤에 추가
        meta_block = f"\nexport const MAJOR_META: Record<Major, {{ deptCd: string; baseDeptCd?: string }}> = {{\n{meta_entry}\n}};\n"
        content = re.sub(r'(export const MAJOR_LABELS[^}]+};)', r'\1' + meta_block, content, flags=re.DOTALL)
        print(f"  ✓ MAJOR_META 블록 생성 및 '{key}' 추가")
    elif meta_block_match and re.search(rf'^\s+{re.escape(key)}\s*:', meta_block_match.group(1), re.MULTILINE):
        print(f"  - MAJOR_META에 '{key}' 이미 존재")
    else:
        content = re.sub(
            r'(export const MAJOR_META[^{]*\{)(.*?)(\n\};)',
            lambda m: m.group(1) + m.group(2) + f"{meta_entry}\n" + m.group(3),
            content, flags=re.DOTALL,
        )
        print(f"  ✓ MAJOR_META에 '{key}' 추가")

    with open(ts_path, "w", encoding="utf-8") as f:
        f.write(content)


def save_json(courses: list[dict], key: str, year: int, out_dir: str):
    path = os.path.join(out_dir, key, f"{year}.json")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(courses, f, ensure_ascii=False, indent=2)
    return path


def main():
    parser = argparse.ArgumentParser(description="KNU 전공 과목 추가 스크립트")
    parser.add_argument("dept_cd", help="학과코드 (예: 1O01, 161101)")
    parser.add_argument("key", help="전공 키 (예: ai, energy_re)")
    parser.add_argument("label", help="전공 라벨 (예: 전자공학부인공지능전공)")
    parser.add_argument("--years", default="2026", help="입학연도 목록, 쉼표 구분 (예: 2021,2022,2023)")
    parser.add_argument("--base", default=None, help="공통 이수체계 학과코드 (1~2학년 공통과목 합치기용)")
    args = parser.parse_args()

    years = [int(y.strip()) for y in args.years.split(",")]
    ts_path = "web/lib/courses.ts"
    out_dir = "web/public/courses"

    print(f"\n전공: {args.label} ({args.key})")
    print(f"학과코드: {args.dept_cd}" + (f"  공통코드: {args.base}" if args.base else ""))
    print(f"연도: {years}")

    # 연도별 데이터 사전 수집
    print(f"\n[데이터 수집 중...]")
    year_data: list[tuple[int, list[dict]]] = []
    for year in years:
        print(f"  {year}년 입학 조회 중...", end="", flush=True)

        base_courses = []
        if args.base:
            base_rows = fetch_rows(args.base, year)
            base_courses = parse_courses(base_rows)
            print(f" 공통 {len(base_courses)}개", end="", flush=True)

        rows = fetch_rows(args.dept_cd, year)
        major_courses = parse_courses(rows)
        print(f" + 전공 {len(major_courses)}개", end="", flush=True)

        seen = set()
        merged = []
        for c in base_courses + major_courses:
            if c["code"] not in seen:
                seen.add(c["code"])
                merged.append(c)

        print(f" = {len(merged)}개")
        year_data.append((year, merged))

    # 모든 연도가 비어있으면 추가하지 않음
    if all(len(courses) == 0 for _, courses in year_data):
        print(f"\n⚠ 전체 연도({years[0]}~{years[-1]})에 과목 데이터가 없어 추가를 건너뜁니다: {args.label}({args.key})")
        return

    # 마지막으로 데이터가 있는 연도 탐색 → 뒷부분이 비어있으면 라벨에 (~XX학번) 접미사 추가
    last_year_with_data = max(y for y, courses in year_data if len(courses) > 0)
    label = args.label
    if last_year_with_data < years[-1]:
        suffix = f"(~{str(last_year_with_data)[2:]}학번)"
        # 이미 (~XX학번) 형태 접미사가 있으면 교체, 없으면 추가
        label = re.sub(r'\(~\d{2}학번\)$', '', label).rstrip() + suffix
        print(f"\n  ℹ {last_year_with_data}년 이후 데이터 없음 → 라벨: '{label}'")

    # courses.ts 메타 업데이트
    print(f"\n[courses.ts 업데이트]")
    update_courses_ts(ts_path, args.key, label, args.dept_cd, args.base)

    # 연도별 JSON 저장
    print(f"\n[JSON 파일 저장] → {out_dir}/{args.key}/")
    for year, merged in year_data:
        path = save_json(merged, args.key, year, out_dir)
        print(f"  {year}년: {len(merged)}개 → {path}")

    print(f"\n완료! '{label}({args.key})' {len(years)}개 연도 추가되었습니다.")
    print("web/public/courses/ 폴더를 git add 해주세요.")


if __name__ == "__main__":
    main()
