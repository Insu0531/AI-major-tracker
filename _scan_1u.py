"""상주캠퍼스(1U) 학과별 연도별 데이터 유무 스캔"""
import sys
import json
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

DEPTS = [
    ("1U01",   "[상주]건설방재공학부"),
    ("1U0101", "  [상주]건설방재공학전공"),
    ("1U0102", "  [상주]건설환경공학전공"),
    ("1U02",   "[상주]정밀기계공학과"),
    ("1U03",   "[상주]자동차공학부"),
    ("1U0301", "  [상주]친환경자동차전공"),
    ("1U0302", "  [상주]지능형자동차전공"),
    ("1U0303", "  [상주]자동차공학과"),
    ("1U04",   "[상주]기계자동차공학부"),
    ("1U0401", "  [상주]기계공학전공"),
    ("1U0402", "  [상주]자동차공학전공"),
    ("1U05",   "[상주]산업전자공학과"),
    ("1U06",   "[상주]컴퓨터정보학부"),
    ("1U0601", "  [상주]컴퓨터시스템공학전공"),
    ("1U0602", "  [상주]컴퓨터소프트웨어전공"),
    ("1U0603", "  [상주]산업컴퓨터전공"),
    ("1U0604", "  [상주]소프트웨어전공"),
    ("1U07",   "[상주]나노소재공학부"),
    ("1U0701", "  [상주]신소재공학전공"),
    ("1U0702", "  [상주]나노공학전공"),
    ("1U0703", "  [상주]에너지화공전공"),
    ("1U0704", "  [상주]화학공학전공"),
    ("1U08",   "[상주]식품외식산업학과"),
    ("1U09",   "[상주]식품과학부"),
    ("1U0901", "  [상주]식품공학전공"),
    ("1U0902", "  [상주]식품영양전공"),
    ("1U0A",   "[상주]섬유패션디자인학부"),
    ("1U0A01", "  [상주]섬유공학전공"),
    ("1U0A02", "  [상주]패션디자인전공"),
    ("1U0B",   "[상주]토목공학과"),
    ("1U0C",   "[상주]건축도시환경공학부"),
    ("1U0C01", "  [상주]건축시스템공학전공"),
    ("1U0C02", "  [상주]건축디자인전공"),
    ("1U0C03", "  [상주]도시환경공학전공"),
    ("1U0D",   "[상주]산업기계공학과"),
    ("1U0E",   "[상주]산업전자전기공학부"),
    ("1U0E01", "  [상주]전자공학전공"),
    ("1U0E02", "  [상주]전기공학전공"),
    ("1U0F",   "[상주]건설방재공학과"),
    ("1U0G",   "[상주]환경안전공학과"),
    ("1U0H",   "[상주]영양식품과학과"),
    ("1U0I",   "[상주]융복합시스템공학부"),
    ("1U0I01", "  [상주]항공위성시스템전공"),
    ("1U0I02", "  [상주]플랜트시스템전공"),
    ("1U0J",   "[상주]치위생학과"),
    ("1U0K",   "[상주]소프트웨어학과"),
    ("1U0L",   "[상주]위치정보시스템학과"),
    ("1U0M",   "[상주]스마트플랜트공학과"),
    ("1U0N",   "[상주]에너지신소재·화학공학부"),
    ("1U0N01", "  [상주]신소재공학전공"),
    ("1U0N02", "  [상주]나노공학전공"),
    ("1U0N03", "  [상주]에너지화학공학전공"),
    ("1U0N04", "  [상주]화학공학전공"),
    ("1U0O",   "[상주]자동차공학과"),
    ("1U0P",   "[상주]나노신소재공학과"),
    ("1U0Q",   "[상주]에너지화학공학과"),
    # 1L 상주캠퍼스 자연계열
    ("1L01",   "[상주]생태자원응용학부"),
    ("1L0101", "  [상주]생물응용전공"),
    ("1L0102", "  [상주]환경원예전공"),
    ("1L02",   "[상주]생태환경시스템학부"),
    ("1L0201", "  [상주]산림환경자원전공"),
    ("1L0202", "  [상주]식물자원환경전공"),
    ("1L03",   "[상주]생태환경보전관광학부"),
    ("1L0301", "  [상주]생태환경보전전공"),
    ("1L0302", "  [상주]생태관광전공"),
    ("1L04",   "[상주]축산학과"),
    ("1L05",   "[상주]레저스포츠학과"),
    ("1L06",   "[상주]생태환경관광학부"),
    ("1L0601", "  [상주]생물응용전공"),
    ("1L0602", "  [상주]생태환경전공"),
    ("1L0603", "  [상주]생태관광전공"),
    ("1L07",   "[상주]축산BT학부"),
    ("1L0701", "  [상주]축산학전공"),
    ("1L0702", "  [상주]축산공학전공"),
    ("1L08",   "[상주]해양학과"),
    ("1L09",   "[상주]축산생명공학과"),
    ("1L0A",   "[상주]곤충생명과학과"),
    ("1L0B",   "[상주]관광학과"),
    ("1L10",   "[상주]말/특수동물학과"),
    ("1L11",   "[상주]축산창업전공"),
    ("1L12",   "[상주]산림생태보호학과"),
    ("1L13",   "[상주]식물자원학과"),
    ("1L14",   "[상주]체육학과"),
    ("1L15",   "[상주]동물생명공학과"),
    ("1L16",   "[상주]체육학부"),
    ("1L1601", "  [상주]체육학전공"),
    ("1L1602", "  [상주]건강운동관리전공"),
]

YEARS = [2021, 2022, 2023, 2024, 2025, 2026]
EXCLUDE_PREFIXES = ("CLTR",)


def fetch_grades(dept_cd: str, year: int) -> dict[str, int]:
    """학년별 과목 수 반환. 예: {'1': 5, '2': 8, '3': 10}"""
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
    try:
        r = requests.post(KNU_API, json=payload, headers=HEADERS, timeout=15)
        r.raise_for_status()
        data = json.loads(r.content.decode("utf-8"))
        rows = data.get("data", [])
        seen = set()
        grade_counts: dict[str, int] = {}
        for row in rows:
            code = row.get("sbjetCd", "")
            if not code or code in seen:
                continue
            if any(code.startswith(p) for p in EXCLUDE_PREFIXES):
                continue
            seen.add(code)
            grade = row.get("estblGrade", "?").strip() or "?"
            grade_counts[grade] = grade_counts.get(grade, 0) + 1
        return grade_counts
    except Exception as e:
        print(f" [오류:{e}]", end="", flush=True)
        return {}


def grades_summary(grade_counts: dict[str, int]) -> str:
    """{'1':5,'2':8} → '1학년:5 2학년:8'"""
    if not grade_counts:
        return ""
    return " ".join(f"{g}학년:{n}" for g, n in sorted(grade_counts.items()))


def merge_grade_counts(list_of_dicts: list[dict[str, int]]) -> dict[str, int]:
    merged: dict[str, int] = {}
    for d in list_of_dicts:
        for g, n in d.items():
            merged[g] = merged.get(g, 0) + n
    return merged


def only_grades(grade_counts: dict[str, int]) -> set[str]:
    return set(grade_counts.keys())


# 학부-전공 부모-자식 관계 (학부코드 → 전공코드 목록)
PARENT_MAP: dict[str, list[str]] = {}
for cd, _ in DEPTS:
    if len(cd) > 4:
        # 앞 4자리가 부모 코드인 항목 찾기
        parent = cd[:4]
        if any(c == parent for c, _ in DEPTS):
            PARENT_MAP.setdefault(parent, []).append(cd)


def main():
    print(f"{'학과코드':<10} {'학과명':<32} " + "  ".join(str(y) for y in YEARS))
    print("-" * 100)

    # dept_cd → {year: grade_counts}
    all_data: dict[str, dict[int, dict[str, int]]] = {}

    for dept_cd, name in DEPTS:
        print(f"{dept_cd:<10} {name:<32} ", end="", flush=True)
        year_grades: dict[int, dict[str, int]] = {}
        for year in YEARS:
            gc = fetch_grades(dept_cd, year)
            year_grades[year] = gc
            total = sum(gc.values())
            mark = f"{total:>4}" if total > 0 else "   ."
            print(mark, end="  ", flush=True)
        print()
        all_data[dept_cd] = year_grades

    # ── 요약: 데이터 있는 학과 ──
    print("\n\n" + "=" * 100)
    print("[ 데이터 있는 학과 요약 + 학년 분포 ]")
    print(f"{'학과코드':<10} {'학과명':<32} {'데이터 연도':<35} {'학년 분포(전체연도 합산)'}")
    print("-" * 100)

    for dept_cd, name in DEPTS:
        year_grades = all_data[dept_cd]
        years_with_data = [y for y in YEARS if sum(year_grades[y].values()) > 0]
        if not years_with_data:
            continue
        last_y = max(years_with_data)
        years_str = ", ".join(str(y) for y in years_with_data)
        suffix = f" (~{str(last_y)[2:]}학번)" if last_y < YEARS[-1] else ""
        merged = merge_grade_counts([year_grades[y] for y in years_with_data])
        grade_str = grades_summary(merged)
        print(f"{dept_cd:<10} {name.strip():<32} {years_str+suffix:<35} {grade_str}")

    # ── 학부+전공 학년 분리 분석 ──
    print("\n\n" + "=" * 100)
    print("[ 학부+전공 학년 분리 분석 ]")
    print("  → 학부=1학년만, 전공=2~4학년이면 전공 추가 시 --base 학부코드 사용 권장")
    print("-" * 100)

    reported_parents = set()
    for dept_cd, name in DEPTS:
        if dept_cd not in PARENT_MAP:
            continue
        children = PARENT_MAP[dept_cd]
        parent_grades = merge_grade_counts(
            [all_data[dept_cd][y] for y in YEARS if sum(all_data[dept_cd][y].values()) > 0]
        )
        if not parent_grades:
            continue

        parent_only = only_grades(parent_grades)
        child_grade_sets = []
        for child_cd in children:
            child_years = [y for y in YEARS if sum(all_data[child_cd][y].values()) > 0]
            if not child_years:
                continue
            cg = merge_grade_counts([all_data[child_cd][y] for y in child_years])
            child_grade_sets.append((child_cd, only_grades(cg), grades_summary(cg)))

        if not child_grade_sets:
            continue

        print(f"\n  [학부] {dept_cd} {name.strip()}")
        print(f"         학년: {grades_summary(parent_grades)}")

        all_child_grades = set().union(*[gs for _, gs, _ in child_grade_sets])
        is_separated = parent_only.isdisjoint(all_child_grades)
        is_parent_low = parent_only <= {"1", "2"} and all_child_grades >= {"3"}

        for child_cd, _, child_gs in child_grade_sets:
            child_name = next(n for c, n in DEPTS if c == child_cd)
            print(f"    [전공] {child_cd} {child_name.strip():<28} 학년: {child_gs}")

        if is_separated:
            print(f"    ✅ 학년 완전 분리 → 전공 추가 시 --base {dept_cd} 권장")
        elif is_parent_low:
            print(f"    ⚠ 학부=저학년 위주, 전공=고학년 위주 → --base {dept_cd} 고려")
        else:
            print(f"    ℹ 학년 겹침 있음 → 전공 독립 추가 or 학부만 추가 검토")

        reported_parents.add(dept_cd)


if __name__ == "__main__":
    main()