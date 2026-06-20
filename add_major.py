"""
전공 과목 자동 추가 스크립트
사용법: python add_major.py <JSON파일경로> <전공키> <전공라벨>

예시:
  python add_major.py response/response우주공학부.json space 우주공학부
  python add_major.py response/reponse기계.json mech 기계공학부

JSON 파일은 KNU API 응답 형식이어야 합니다.
courses.ts의 Major 타입, MAJOR_LABELS, COURSES_xxx, COURSES_BY_MAJOR를 자동으로 업데이트합니다.
"""

import sys
import json
import re

sys.stdout.reconfigure(encoding="utf-8")


def clean(name: str) -> str:
    return re.sub(r"<[^>]+>", "", name).strip()


def parse_courses(json_path: str):
    with open(json_path, encoding="utf-8") as f:
        data = json.load(f)["data"]

    courses = []
    seen = set()
    for row in data:
        for i in ("1", "2"):
            code = row.get(f"sbjetCd{i}")
            name = row.get(f"sbjetNm{i}")
            credit = row.get(f"crditSystem{i}")
            grade = row.get("estblGrade")
            if code and name and code not in seen:
                seen.add(code)
                courses.append({
                    "grade": grade or "",
                    "code": code,
                    "name": clean(name),
                    "credit": credit or "",
                })
    return courses


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

    # 3. COURSES_xxx 배열 추가 (COURSES_BY_MAJOR 바로 앞에 삽입)
    if f"export const {var_name}" not in content:
        content = re.sub(
            r'(export const COURSES_BY_MAJOR)',
            f"{courses_ts}\n\n\\1",
            content,
        )
        print(f"  ✓ {var_name} 배열 추가")
    else:
        # 이미 있으면 기존 배열 교체
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
    if len(sys.argv) != 4:
        print("사용법: python add_major.py <JSON파일경로> <전공키> <전공라벨>")
        print("예시:   python add_major.py response/response우주공학부.json space 우주공학부")
        sys.exit(1)

    json_path = sys.argv[1]
    key = sys.argv[2]
    label = sys.argv[3]
    var_name = f"COURSES_{key.upper()}"
    ts_path = "web/lib/courses.ts"

    print(f"\n[파싱] {json_path}")
    courses = parse_courses(json_path)
    print(f"  → {len(courses)}개 과목 파싱 완료")

    print(f"\n[업데이트] {ts_path}")
    courses_ts = courses_to_ts(courses, var_name)
    update_courses_ts(ts_path, key, label, var_name, courses_ts)

    print(f"\n완료! '{label}({key})' 전공이 추가되었습니다.")
    print("npx tsc --noEmit 으로 타입 체크를 권장합니다.")


if __name__ == "__main__":
    main()
