import json, re, sys
sys.stdout.reconfigure(encoding='utf-8')

def clean(name):
    return re.sub(r'<[^>]+>', '', name).strip()

with open('response copy.json', encoding='utf-8') as f:
    data = json.load(f)['data']

courses = []
seen = set()
for row in data:
    for i in ('1', '2'):
        code = row.get(f'sbjetCd{i}')
        name = row.get(f'sbjetNm{i}')
        credit = row.get(f'crditSystem{i}')
        grade = row.get('estblGrade')
        if code and name and code not in seen:
            seen.add(code)
            courses.append({'grade': grade, 'code': code, 'name': clean(name), 'credit': credit or ''})

print(f'// total: {len(courses)}')
for c in courses:
    print(f"  {{ grade: \"{c['grade']}\", code: \"{c['code']}\", name: \"{c['name']}\", credit: \"{c['credit']}\" }},")
