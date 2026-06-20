import requests
import csv
import re
import json

API_URL = "https://knuin.knu.ac.kr/public/stddm/edu.knu"  # 실제 API URL로 교체 필요
PARAMS = {"itttn_cd": "1O01"}  # 필요시 POST body로 변경


def clean_name(name: str) -> str:
    """HTML 태그 제거"""
    return re.sub(r"<[^>]+>", "", name).strip()


def parse_courses(data: list[dict]) -> list[dict]:
    courses = []
    for row in data:
        for i in ("1", "2"):
            code = row.get(f"sbjetCd{i}")
            name = row.get(f"sbjetNm{i}")
            credit = row.get(f"crditSystem{i}")
            grade = row.get("estblGrade")
            if code and name:
                courses.append({
                    "학년": grade,
                    "교과목번호": code,
                    "교과목명": clean_name(name),
                    "학점": credit or "",
                })
    return courses


def save_csv(courses: list[dict], path: str = "ai_courses.csv") -> None:
    with open(path, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=["학년", "교과목번호", "교과목명", "학점"])
        writer.writeheader()
        writer.writerows(courses)
    print(f"저장 완료: {path} ({len(courses)}개 과목)")


def fetch_from_api() -> list[dict]:
    """API에서 직접 데이터 가져오기 - URL 확인 후 사용"""
    response = requests.get(API_URL, params=PARAMS)
    response.raise_for_status()
    return response.json()["data"]


def fetch_from_file(path: str = "response.json") -> list[dict]:
    """저장된 JSON 파일에서 데이터 읽기"""
    with open(path, encoding="utf-8") as f:
        return json.load(f)["data"]


if __name__ == "__main__":
    # JSON 파일에서 읽기 (response.json 파일을 같은 폴더에 저장 후 실행)
    data = fetch_from_file("response.json")
    courses = parse_courses(data)
    save_csv(courses)
