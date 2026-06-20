"""
전공 과목 자동 추가 스크립트
사용법: python add_major.py <학과코드> <전공키> <전공라벨> [연도]

예시:
  python add_major.py 1611 energy 에너지공학부
  python add_major.py 161101 energy_re 에너지공학부-신재생에너지전공
  python add_major.py 161102 energy_cv 에너지공학부-에너지변환전공
  python add_major.py 1O01 ai 전자공학부\ 인공지능전공 2026

courses.ts의 Major 타입, MAJOR_LABELS, COURSES_xxx, COURSES_BY_MAJOR를 자동으로 업데이트합니다.
"""

import sys
import json
import re
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


def fetch_courses_from_api(dept_cd: str, year: int = 2026) -> list[dict]:
    payload = {
        "isApi": "Y",
        "search": {
            "trgtYrsf": year,
            "dprtnCd": dept_cd,
            "dprtnNm": "",
            "isApi": "Y",
            "mdlSctinCd": "STCU001800001",
            "forMdlMgmntYn": "Y",
            "frstNcrYear": year,
        },
    }
    r = requests.post(KNU_API, json=payload, headers=HEADERS, timeout=15)
    r.raise_for_status()
    data = json.loads(r.content.decode("utf-8"))
    if not data.get("success", True) is False and "data" in data:
        return data["data"]
    raise RuntimeError(f"API 오류: {data.get('msg', '알 수 없는 오류')}")


def parse_courses(rows: list[dict]) -> list[dict]:
    courses = []
    seen = set()
    for row in rows:
        code = row.get("sbjetCd", "")
        name = row.get("sbjetNm", "")
        credit = row.get("crditSystem", "")
        grade = row.get("estblGrade", "")
        if code and name and code not in seen:
            seen.add(code)
            courses.append({
                "grade": grade,
                "code": code,
                "name": name.strip(),
                "credit": credit,
            })
    return sorted(courses, key=lambda c: (c["grade"], c["name"]))


def courses_to_ts(courses: list, var_name: str) -> str:
    lines = [f"export const {var_name}: Course[] = ["]
    for c in courses:
        name_escaped = c["name"].replace('"', '\\"')
        lines.append(
            f'  {{ grade: "{c["grade"]}", code: "{c["code"]}", name: "{name_escaped}", credit: "{c["credit"]}" }},'
        )
    lines.append("];")
    return "\n".join(lines)


def update_courses_ts(ts_path: str, key: str, label: str, var_name: str, courses_ts: str):
    with open(ts_path, encoding="utf-8") as f:
        content = f.read()

    # 1. Major 타입에 키 추가
    major_type_full_pattern = r'export type Major = (?:"[^"]+"(?:\s*\|\s*"[^"]+")*)'
    match = re.search(major_type_full_pattern, content)
    if match:
        existing_keys = re.findall(r'"([^"]+)"', match.group(0))
        if key not in existing_keys:
            existing_keys.append(key)
            new_type = 'export type Major = "' + '" | "'.join(existing_keys) + '"'
            content = re.sub(major_type_full_pattern, new_type, content)
            print(f"  ✓ Major 타입에 '{key}' 추가")
        else:
            print(f"  - Major 타입에 '{key}' 이미 존재")

    # 2. MAJOR_LABELS에 항목 추가
    if f'  {key}: ' not in content:
        content = re.sub(
            r'(export const MAJOR_LABELS[^{]*\{[^}]*)(};)',
            lambda m: m.group(1) + f'  {key}: "{label}",\n' + m.group(2),
            content,
            flags=re.DOTALL,
        )
        print(f"  ✓ MAJOR_LABELS에 '{key}: {label}' 추가")
    else:
        print(f"  - MAJOR_LABELS에 '{key}' 이미 존재")

    # 3. COURSES_xxx 배열 추가 또는 업데이트
    if f"export const {var_name}" not in content:
        content = re.sub(
            r'(export const COURSES_BY_MAJOR)',
            f"{courses_ts}\n\n\\1",
            content,
        )
        print(f"  ✓ {var_name} 배열 추가")
    else:
        content = re.sub(
            rf'export const {var_name}: Course\[\] = \[.*?\];',
            courses_ts,
            content,
            flags=re.DOTALL,
        )
        print(f"  ✓ {var_name} 배열 업데이트")

    # 4. COURSES_BY_MAJOR에 항목 추가
    if f"  {key}: {var_name}" not in content:
        content = re.sub(
            r'(export const COURSES_BY_MAJOR[^{]*\{[^}]*)(};)',
            lambda m: m.group(1) + f"  {key}: {var_name},\n" + m.group(2),
            content,
            flags=re.DOTALL,
        )
        print(f"  ✓ COURSES_BY_MAJOR에 '{key}' 추가")
    else:
        print(f"  - COURSES_BY_MAJOR에 '{key}' 이미 존재")

    with open(ts_path, "w", encoding="utf-8") as f:
        f.write(content)


def main():
    if len(sys.argv) < 4:
        print("사용법: python add_major.py <학과코드> <전공키> <전공라벨> [연도]")
        print("예시:   python add_major.py 1611 energy 에너지공학부")
        print("        python add_major.py 161101 energy_re 에너지공학부-신재생에너지전공 2026")
        sys.exit(1)

    dept_cd = sys.argv[1]
    key = sys.argv[2]
    label = sys.argv[3]
    year = int(sys.argv[4]) if len(sys.argv) >= 5 else 2026
    var_name = f"COURSES_{key.upper()}"
    ts_path = "web/lib/courses.ts"

    print(f"\n[조회] 학과코드={dept_cd}, 연도={year}")
    rows = fetch_courses_from_api(dept_cd, year)
    courses = parse_courses(rows)
    print(f"  → {len(courses)}개 과목 조회 완료")
    for c in courses:
        print(f"     [{c['grade']}학년] {c['code']} {c['name']} {c['credit']}")

    print(f"\n[업데이트] {ts_path}")
    courses_ts = courses_to_ts(courses, var_name)
    update_courses_ts(ts_path, key, label, var_name, courses_ts)

    print(f"\n완료! '{label}({key})' 전공이 추가되었습니다.")


if __name__ == "__main__":
    main()
