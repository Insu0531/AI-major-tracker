import requests, json, sys
sys.stdout.reconfigure(encoding="utf-8")

url = "https://knuin.knu.ac.kr/public/web/stddm/curse/educourse/eduCour/searchEduCourList"
headers = {
    "Content-Type": "application/json", "Accept": "application/json",
    "X-Requested-With": "XMLHttpRequest", "User-Agent": "Mozilla/5.0",
    "Referer": "https://knuin.knu.ac.kr", "Origin": "https://knuin.knu.ac.kr",
}

for cd in ["1O0109", "1O01", "1O0101", "1O0102", "1O0103", "1O0104", "1O0105"]:
    p = {"isApi": "Y", "search": {
        "trgtYrsf": 2026, "dprtnCd": cd, "dprtnNm": "", "isApi": "Y",
        "mdlSctinCd": "STCU001800001", "forMdlMgmntYn": "Y", "frstNcrYear": 2026,
    }}
    r = requests.post(url, json=p, headers=headers, timeout=10)
    d = json.loads(r.content.decode("utf-8"))
    rows = d.get("data", [])
    if rows:
        dept = rows[0].get("dprtnNm", "")
        print(f"{cd}: {len(rows)}개  학과={dept}")
    else:
        print(f"{cd}: 0개")
