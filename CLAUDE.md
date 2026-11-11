# KNU 시간표 마법사 (knu-class-wizard)

> 서비스명은 **KNU 시간표 마법사** (2026-11-11 통일). 헤더·메타데이터·개인정보처리방침·카톡 공유·구버전 헤더 모두 이 이름.

KNU 학생이 **전공·학번·학기**를 고르면 개설 분반을 조회하고, 선택한 과목으로 **충돌 없는 시간표 조합을 자동 생성**해 주는 웹앱.
전공 → 교양 → 교직 순으로 "고정 후 빈 시간 채우기" 단계형 마법사 구조. 배포: https://knuclass.vercel.app (Vercel)

> 레포 이름(AI-major-tracker)과 루트 README는 초기 Python/Tk 버전("인공지능전공 개설 여부 확인") 시절 이름이다. 실제 서비스 코드는 `web/` 아래에 있다.
> `web/CLAUDE.md` → `web/AGENTS.md`: **Next.js 16은 학습 데이터와 API가 다를 수 있으니, 코드 작성 전에 `web/node_modules/next/dist/docs/`를 확인할 것.**

---

## 1. 기술 스택

| 구분 | 내용 |
|---|---|
| 언어 | TypeScript 5 (strict), 데이터 수집 스크립트는 Python 3 (`requests`) |
| 프레임워크 | **Next.js 16.2.9 (App Router)**, React 19.2.4 |
| 스타일 | Tailwind CSS 4 (`@tailwindcss/postcss`), `app/globals.css`에서 다크모드 수동 오버라이드 |
| 캐시 | Upstash Redis (`@upstash/redis`) — API 라우트의 KNU 응답 캐시 |
| 이미지 저장 | `dom-to-image-more` (동적 import). `html2canvas`는 의존성에만 있고 **미사용** |
| 분석 | `@vercel/analytics`, Google Forms `no-cors` POST로 이벤트 로깅 |
| 공유 | Kakao JS SDK 2.7.4 (CDN, `next/script`) |
| 린트 | ESLint 9 + `eslint-config-next` |
| 테스트 | **없음** |

## 2. 실행 방법

```bash
cd web && npm install      # 의존성 (루트 package.json은 web으로 위임만 함)
npm run dev                # 루트에서도 가능: npm --prefix web run dev
npm run build && npm start
npm run lint
```
- 환경변수 (`web/.env.local`, gitignore됨): `KV_REST_API_URL`, `KV_REST_API_TOKEN` (Upstash). 없으면 캐시만 실패하고 KNU API를 직접 호출.
- 배포: Vercel (GitHub 연동 추정). API 라우트 `maxDuration = 60`.
- 전공 데이터 추가: `python add_major.py <학과코드> <전공키> <라벨> [--base <공통학과코드>] [--years 2021,...,2026]`
  → `web/public/courses/{key}/{year}.json` 생성 + `web/lib/courses.ts`의 `Major`/`MAJOR_LABELS`/`MAJOR_META` 자동 수정.

## 3. 폴더 구조

```
/
├─ web/                         ← 실제 Next.js 앱
│  ├─ app/
│  │  ├─ layout.tsx             메타데이터, 다크모드 FOUC 방지 inline script, Analytics, KakaoInit
│  │  ├─ page.tsx  (1690줄)     ★ 단일 클라이언트 페이지. 탭 전환·전공 조회·전공 마법사·각종 모달 전부
│  │  ├─ globals.css            CSS 변수 + `.dark .bg-white{...!important}` 식 다크모드 + 애니메이션 keyframes
│  │  └─ api/
│  │     ├─ sections/route.ts   전공 분반 조회 (과목코드별 KNU API 호출, SSE 스트리밍, Redis 6h)
│  │     ├─ gyoyang/route.ts    교양 + KNU미래설계(일반선택) 전체 조회 (SSE, Redis 180일)
│  │     └─ kyoshik/route.ts    교직 과목 전체 조회 (SSE, Redis 180일)
│  ├─ components/
│  │  ├─ GyoyangWizard.tsx (1364줄)  교양 마법사 (자체 조회·필터·조합·저장·수강신청 모달)
│  │  ├─ KyoshikWizard.tsx (912줄)   교직 마법사 (GyoyangWizard를 복붙 후 축소한 형태)
│  │  ├─ TimetableGrid.tsx           시간표 그리드 렌더 (월~금, 토 과목 있으면 토 추가, 9~22시)
│  │  ├─ ProfPickerModal.tsx         한 시간대에 교수 여러 명인 분반 → 저장 전 교수 선택 단계 모달 + 헬퍼
│  │  ├─ LibraryTab.tsx              localStorage 저장 시간표 목록/미리보기/이름변경/삭제
│  │  ├─ AcademicCalendarTab.tsx     2026 학사일정 (하드코딩 EVENTS 배열) 달력
│  │  ├─ FeedbackTab.tsx             Google Form 제출 피드백
│  │  ├─ GuideTour.tsx               스포트라이트 사용법 투어
│  │  ├─ NoticeTicker.tsx            상단 흐르는 공지
│  │  ├─ KakaoInit / KakaoShareButton / SugangLink
│  ├─ lib/
│  │  ├─ timetable.ts           ★ 시간 파싱, 분반 그룹화, 조합 생성 알고리즘
│  │  ├─ courses.ts             Major 타입(~165개), MAJOR_LABELS, MAJOR_META(deptCd), 학기코드, fetchCoursesByYear
│  │  ├─ gyoyang.json           교양 과목 마스터(code, name, credit, sdg, hmnts)
│  │  ├─ timetableStorage.ts    localStorage CRUD (`knu_saved_timetables`)
│  │  ├─ captureTimetable.ts    DOM 클론 → PNG(정사각형) 다운로드
│  │  ├─ trackSave.ts           저장 이벤트 Google Form 로깅
│  │  └─ kakaoShare.ts          Kakao JS 키(공개키), SITE_URL, 공유 함수
│  └─ public/courses/{majorKey}/{2021..2026}.json   전공별·입학연도별 이수체계 과목 목록 (~990 파일)
├─ add_major.py, _bulk_add.py, _scan_1u.py, _find_dept.py   데이터 수집 스크립트 (KNU 교육과정 API)
├─ python_base/                 초기 Tkinter 데스크톱 버전 (레거시, 미사용)
├─ response/                    KNU API 원본 응답 샘플 (레거시, ~2.3MB)
├─ *.png, _out.txt, __pycache__/, node_modules/(루트, 커밋됨)   정리 대상
```

## 4. 핵심 기능 (사용자 관점)

1. **전공 조회** 탭: 주전공(검색 드롭다운) + 복수전공 최대 3개, 입학 학번, 조회 학기(연도 + 1/2/여름/겨울) 선택 → 조회.
   스트리밍 진행률 표시, 표 정렬, 행별 ☆ 버튼으로 **고정(★) → 제외(✕) → 기본** 순환. 상주/대구 캠퍼스 분반은 자동 제외.
2. **전공 마법사**: 과목 체크(최대 10개) → 조합 자동 생성, ◀▶로 넘겨보기(슬라이드 애니메이션).
   필터: 필수 과목(+특정 교수), 공강 요일, N시 이전/이후 수업 없음, 최소 학점, 교수 포함/제외, 개설 전공.
   버튼: 이미지 저장 / 전체 조합 이미지 일괄 저장 / 라이브러리 저장 / 수강신청 모달(과목코드 복사 + 수강신청 사이트 링크) / ★교양 마법사 시작.
   과목이 없으면 "전공 없이 교양 마법사로 바로가기".
3. **교양 마법사**: 전공 조합을 고정하고 학기 교양 전체에서 최대 6개 선택 → 빈 시간에 들어가는 조합 생성.
   필터: SDG/인문교양/SU평가/원격/일반선택/충돌 숨김/상주 포함·제외/요일 조합, 최대 총학점, 최소 교양학점 등. → 교직 마법사로 이어감.
4. **교직 마법사**: 전공+교양 조합 고정 후 교직 과목 배치 (교양 마법사와 거의 동일).
5. **라이브러리**: 저장한 시간표 목록, 미리보기, 이름 변경, 선택 삭제.
6. **학사일정**: 2026년 학사일정 달력 (대학원 일정 토글).
7. **설정**: 다크모드 토글만 존재. **피드백/응원**: Google Form 제출. **사용법 투어**: 3일간 숨기기.
8. 헤더: 카카오톡 공유 버튼.

## 5. 데이터 구조 (`web/lib/timetable.ts`)

```ts
Course      = { grade, code, name, credit: "3-3-0" }               // public/courses/*.json (이수체계)
Row (API)   = { grade, credit, crseNo: "COMP0453-003", name, dept, prof, timeStr, rmrk, location, majorTag?/code?/tag? }
TimeSlot    = { day: 0(월)~5(토), start: 13.5, end: 15 }            // 소수 시간
Section     = { name, profs[], dept, timeStr, times: TimeSlot[], credit, crseNo, location,
                profToCrseNo?, profToLocation? }                    // "같은 과목·같은 시간"인 분반들을 하나로 합친 단위
SectionGroup = Section[]                                            // 한 과목의 선택 가능한 분반들
NoTimeSection = { name, credit, crseNo, profs?, profToCrseNo? }     // 강의시간 없는 과목(실습 등) → "시간 외"
Combo       = Section[]                                             // 시간표 1개
SavedTimetable = { id, name, savedAt, sem: "2026-1", major, majorLabel, entryYear?, extraMajorLabels?,
                   pinnedCombo, pinnedNoTimeSections, gyoyangCombo?, gyoyangNoTimeSections? }
```
- `timeStr` 원본 형식: `"화 14:00~15:00, 화 15:00~16:00, 목 ..."` (KNU `lssnsRealTimeInfo`). 일요일 미지원.
- 학기코드: `1→CMBS001400001, 2→…002, s(여름)→…004, w(겨울)→…003` (`courses.ts`).
- 과목 기본코드 = `crseNo.replace(/-\d+$/, "")` (분반 번호 제거) — 코드 전역에서 반복 사용.

## 6. 시간표 생성 파이프라인 (전공 마법사)

```
[page.tsx] major/entryYear 변경 → fetchCoursesByYear() → /courses/{major}/{year}.json (이수체계 과목 목록)
  ↓ "조회" 클릭 → doFetch()
[page.tsx] streamRows() → GET /api/sections?sem&major&entryYear (주전공, 이어서 복수전공 순차)
[api/sections] public JSON 읽기 → Redis 확인(sections:v5:{major}:{entryYear}:{sem})
   ├ hit : 20행씩 progress 이벤트로 재전송
   └ miss: 과목 5개씩 병렬로 KNU 강의계획서 API(selectListLectPlnInqr) POST → 과목마다 progress 이벤트 → done → Redis 저장
  ↓ SSE("data: {...}\n\n") 수동 파싱, rows 누적 + 캠퍼스 불일치 분반 excludedRows에 추가
[page.tsx useEffect] checkMap/pinnedRows/excludedRows 변경 시:
   선택 과목의 rows 필터 (제외 분반 삭제, 고정 분반이 있는 과목은 그 분반만)
   → buildSectionGroups(rows)   : 기본코드로 그룹 → 그룹 내 (name|timeStr) 같은 행은 교수만 합쳐 Section 1개
                                  시간 없는 과목은 noTimeSections로 분리
   → generateCombos(groups)
[timetable.ts generateCombos]
   size = n..1 모든 과목 부분집합(combinations) × 각 부분집합의 분반 데카르트곱(cartesian)
   → hasOverlap()(같은 요일 & start<end 교차) 통과한 것만 수집
   → 최대 크기 조합 전부 + 더 작은 조합 중 "분반(crseNo) 집합이 최대 조합의 부분집합이 아닌 것"만 추가
[page.tsx useEffect] combos → 필터(필수과목/학점/교수/학과/공강/아침/저녁) → filteredCombos, comboIdx=0
[render] TimetableGrid(combo) — comboToBlocks: 과목·요일별 연속 슬롯 병합, 색상은 combo 내 인덱스 순
```
- **교양/교직 마법사**: 각 컴포넌트가 직접 `/api/gyoyang`, `/api/kyoshik` 호출(학기 전체 1회) → 선택 과목 그룹화
  → 고정 조합과 겹치는 분반을 **미리 제거** → `generateCombos`. 최대학점 설정 시 2^n 비트마스크로 학점 합 ≤ 허용치 부분집합마다 `generateCombos` 실행 후 키로 중복 제거.
- **저장 시 교수 선택**: 조합에 교수 여러 명인 Section이 있으면 `ProfPickerModal`로 단계별 선택 → `applyProfPicks`가 crseNo/location 교체 → 이미지/라이브러리 저장.
- **이미지 저장**: `captureTimetableImage`가 DOM 클론 → 애니메이션 제거 → 18시 이후 과목 없으면 18시에서 크롭(`height: 676px` 문자열 셀렉터로 탐색!) → dom-to-image 3x → 정사각 canvas → 다운로드.

## 7. 상태 관리 · 저장

- 전역 상태 라이브러리 없음. **`page.tsx`의 Home 컴포넌트에 useState ~60개**, props로 위저드에 전달.
- 교양/교직 위저드는 탭 전환 시 상태 유지를 위해 `hidden` 클래스로 항상 마운트.
- localStorage: `knu_saved_timetables`(라이브러리), `theme`(dark/light), `tourSeen`(타임스탬프).
- 서버 DB 없음. Redis는 KNU 응답 캐시 전용. URL 상태(쿼리스트링) 없음 → 새로고침 시 전부 초기화.

## 8. 외부 연동

| 대상 | 위치 | 비고 |
|---|---|---|
| KNU 강의계획서 API `knuin.knu.ac.kr/.../selectListLectPlnInqr` | api/sections, gyoyang, kyoshik | 비공식 API, Referer/Origin 헤더 위장 |
| KNU 교육과정 API `.../searchEduCourList` | add_major.py 등 | 이수체계 JSON 생성용 (오프라인) |
| Upstash Redis | api/* | `KV_REST_API_URL`, `KV_REST_API_TOKEN` |
| Google Forms (4개 폼) | page.tsx(조회 로그), trackSave.ts(저장 로그), FeedbackTab | entry ID 하드코딩 |
| Kakao JS SDK | KakaoInit, kakaoShare.ts | JS 키 하드코딩(공개키라 의도된 것) |
| Vercel Analytics | layout.tsx | |
| sugang.knu.ac.kr | SugangLink | 단순 링크 |

---

## 리뉴얼 참고사항

### A. 구조 / 중복
- **`page.tsx` 1690줄 단일 컴포넌트**: 조회·표·전공 마법사·필터·모달 6종이 한 파일. useState ~60개, 리셋 로직(`setCheckMap…setPinnedCombo`)이 `doFetch`와 전공 선택 onClick에 **두 번 복붙**.
- **Gyoyang/Kyoshik/전공 마법사 3중 복제**: 필터 상태, 필터 useEffect, 슬라이드 내비, 교수 선택 흐름, 저장 모달, 수강신청 모달, SSE 파서가 거의 동일하게 3벌. `formatTimeStr`·`slotsOverlap`·`fmt`도 lib에 있는데 컴포넌트에 재정의됨. → `useTimetableWizard` 훅 + 공용 `WizardLayout/ComboNavigator/FilterPanel/SaveDialog`로 통합 권장.
- **API 라우트 3개 복제**: KNU_API, HEADERS, makePayload, Redis 클라이언트, SSE 응답 생성, `toRow` 매핑이 반복 → `lib/knuApi.ts`, `lib/sse.ts`로 추출.
- SSE 클라이언트 파서도 page/Gyoyang/Kyoshik에 3벌.
- 전공 드롭다운(정렬+검색) 코드가 주전공/복수전공용으로 2벌.
- `courses.ts`의 `Major` 유니온 타입이 한 줄 수천 자 + `MAJOR_LABELS`/`MAJOR_META` 3곳 동기화 필요 → 단일 `majors.json` 배열(`{key,label,deptCd,baseDeptCd,campus}`)에서 파생시키는 게 안전. (`cs_adv` 줄 뒤 `bio_eng`가 같은 줄에 붙어 있는 등 자동 수정 흔적)
- 다크모드가 `.dark .bg-white { …!important }` 식 **유틸리티 클래스 덮어쓰기**(globals.css 200줄) → 새 클래스 쓸 때마다 누락. Tailwind 4 `dark:` 변형 또는 시맨틱 토큰(`bg-surface`)으로 교체.
- 하드코딩 데이터: 학사일정(2026만), `NOTICE_TEXT`, `SEM_WARN_ACTIVE`(2026-2 날짜), 학기 기본값 `"2026"`/`"1"`, 학번 기본 2026.
- 레포 잡동사니: 루트 `node_modules/`·`__pycache__/` 커밋됨, `response/`(2.3MB), 스크린샷 PNG, `_out.txt`, `python_base/`, README가 옛 프로젝트 설명.

### B. 버그 가능성 / 예외 처리
- **Enter 키 이중 처리**: 전역 keydown 핸들러(page.tsx ~485행)가 INPUT을 제외하지 않고 `doFetch()`를 바로 호출 → 검색 컨트롤 영역의 "재조회 확인"/"2026-2 경고" 모달을 우회할 수 있음. 다른 탭(설정 등)에서는 무관하지만 search 탭 아무 데서나 Enter → 재조회로 선택 상태가 날아감.
- `streamRows`: `JSON.parse` 실패나 `type:"error"` 이벤트 미처리. 실패한 과목은 서버에서 `[]`로 삼켜져 **일부 과목 누락이 조용히 발생**(사용자는 미개설로 오해). 캐시에도 그 상태로 6시간 저장됨.
- 서버에서 KNU 응답이 비어도 Redis에 저장 → 빈 결과 장기 캐시 가능 (교양/교직은 180일!). 학기 초 개설 전 조회하면 반년간 빈 목록.
- `ENTRY_YEAR_MAX = 2050`인데 JSON은 2021~2026뿐 → 2027+ 선택 시 과목 0개, 조회 버튼 비활성 이유 안내 없음.
- `TimetableGrid`: 9시 이전/22시 이후 수업, 일요일 수업은 그리드 밖으로 렌더되거나 누락. 블록 색이 조합 내 인덱스 기준이라 **같은 과목도 조합마다 색이 바뀜**.
- `buildSectionGroups`: 그룹 학점을 첫 행 기준으로만 계산, `parseInt` NaN 가능. 동일 시간 다른 교수 분반을 하나로 합쳐 `crseNo`는 첫 교수 것 → 교수 미선택 저장 시 수강신청 코드가 첫 교수 분반으로 표시됨.
- `captureTimetable`: `[style*="height: 676px"]` 문자열 매칭에 의존 → 그리드 행 높이/시간 범위 바꾸면 크롭이 조용히 깨짐.
- `timetableStorage`: `setItem` quota 예외 미처리, 스키마 버전 없음(Section 구조 바뀌면 기존 저장본 깨짐), id가 `Date.now()`.
- 전공 마법사 필터 `useEffect`가 `setComboIdx(0)`을 매번 호출 → 과목 추가할 때마다 1번 조합으로 리셋.
- `new Redis({url: process.env...!})` — env 없을 때 모든 요청에서 예외 후 catch (동작은 하나 로그 노이즈/지연).
- 수강신청 모달의 과목코드 복사는 `navigator.clipboard` 실패 처리 확인 필요.

### C. 성능 (특히 조합 생성)
- `generateCombos`는 **최대 크기 조합을 찾아도 모든 작은 부분집합까지 전수 탐색**: Σ_{부분집합} Π(분반수). 과목 10개 × 분반 5개면 ≈ 6^10 ≈ **6천만 조합**을 메인 스레드에서 생성 → 브라우저 멈춤. 결과도 `Section[][]` 전체를 state에 보관(메모리).
  - 개선: 백트래킹 + 조기 가지치기(충돌 즉시 중단), 요일별 비트마스크(30분 단위 → 요일당 정수 1개)로 O(1) 충돌 검사, 결과 상한(예: 1000개)/지연 생성, **Web Worker**로 이동, 필터(공강·시간대·필수과목)를 생성 단계에서 미리 적용.
- `cartesian`이 재귀 + `slice` + 배열 spread로 매 단계 새 배열 생성.
- `hasOverlap` O(슬롯²) — 작은 규모라 문제는 아니나 비트마스크로 대체 가능.
- 교양 마법사 최대학점 모드: 2^n 부분집합마다 다시 `generateCombos`(내부에서 또 2^k 부분집합) → 중복 계산 폭증.
- 렌더마다 `profsByName`, `profsInCombos`, `sortedRows`, `courseGroups`를 전체 combos/rows로 재계산 (useMemo 없음).
- 조회 중 `setRows(prev => [...prev, ...rows])`가 과목마다 호출 → 큰 표 리렌더 반복, 가상 스크롤 없음.
- 서버: 전공 과목 수만큼 KNU API를 5개씩 순차 배치 호출 → 과목 많은 학과는 60초 `maxDuration`에 근접 가능.

### D. 의존성
- `html2canvas` — 미사용, 제거.
- `dom-to-image-more` — 유지보수 느림, 폰트/transform 이슈 → `html-to-image` 또는 **캔버스/SVG로 직접 그리기**(데이터가 단순해 DOM 캡처보다 안정적) 고려.
- 루트 `package.json`의 `@vercel/analytics` + 커밋된 루트 `node_modules` — 불필요.
- Geist 폰트 변수만 선언되고 실제 body는 `"맑은 고딕"` → Windows 외 환경(맥/모바일)은 Arial/시스템 폰트로 떨어짐. Pretendard 등 웹폰트 도입 권장.
- Next 16 / React 19 / Tailwind 4는 최신 → 유지.

### E. UX 개선 포인트
- 8개 탭이 가로로 나열, 모바일에서 넘침. "조회 → 전공 → 교양 → 교직" **단계 흐름이 탭으로 표현돼** 비활성 탭 툴팁으로만 안내됨 → 스텝퍼(진행 단계) UI가 자연스러움.
- 조합 수가 많을 때 ◀▶로만 탐색 → 썸네일 그리드/정렬(공강 많은 순, 1교시 적은 순, 학점 순) 필요.
- 필터 결과 0개일 때 어떤 조건이 원인인지 힌트만 표시 → 조건별 "해제" 버튼.
- 새로고침 시 모든 선택이 사라짐 → 진행 상태를 localStorage/URL에 보존, 공유 링크(시간표 URL) 지원.
- `window.confirm` 사용(전체 이미지 저장) → 다른 모달과 일관성 없음.
- 같은 과목 색이 조합마다 바뀜, 툴팁이 hover 전용(모바일 불가).
- 상단 흐르는 공지(marquee) + 이모지 많은 문구 → 가독성/신뢰도 저하.
- 설정 탭에 다크모드 하나뿐 → 헤더 토글로 흡수하고 탭 제거.
- 접근성: 아이콘/기호 버튼(☆ ◀ ▶ ✕)에 aria-label 부족, 키보드 내비 미흡.

### F. 디자인 현황 (리뉴얼 시 "AI 템플릿 느낌" 줄이기 참고)
- 현재: Tailwind 기본 팔레트 그대로(indigo-600 주색 67회 + green/blue/amber 버튼 혼용), 기본 rounded/shadow, 이모지 아이콘, 그리드 블록은 자체 차분한 10색 팔레트(이건 좋음).
- 방향 메모: 학교 색(KNU 빨강 계열)을 포인트로 1색만, 나머지는 무채색 / 버튼 색 의미 통일(주요 1·보조 1) / 이모지 → 단색 아이콘 또는 텍스트 / 한글 웹폰트 + 숫자 tabular / 시간표 그리드를 화면의 주인공으로.

---

## 리뉴얼 계획 (2026-11, 확정 사항 반영)

### 목표
전공→교양→교직 3단계 마법사를 **하나의 "시간표 검색"** 으로 통합. 전공(학과별)·교양·교직·일반선택을 한 풀에서 담고, 필터 + 정렬을 한 번에 적용. 기존 편의(내 전공 이수체계 자동 표시, 분반 고정/제외, 빈 시간 교양 찾기, 교수 선택, 이미지/라이브러리 저장, 수강신청 코드 복사)는 유지.

### 데이터 전략: "요청 시 크롤링" → "미리 수집한 정적 스냅샷" (결정됨)
- **실측 완료 (2026-11-10)**: 강의계획서 API에 필터 없이 1회 호출 → 학기 전체 개설강좌 반환(페이징 없음).
  2026-1: 5,791분반 / 2026-2: 5,588분반, 12~30초. 학부+대학원 전체, 445개 개설학과.
  기존 과목코드별 조회·교양(sbjetRelmCd=01)·교직(sbjetSctcd=STCU000800007) 결과가 전부 포함됨을 표본 검증.
- 수집기: `scripts/collect-sections.mjs` (의존성 없음, Node 18+) → `web/public/data/sections/{sem}.json` + `web/public/data/index.json`.
  정규화 결과 학기당 약 2.4MB, **gzip 약 210KB**. SDG/인문교양/KNU미래설계는 전체 응답에 없어서 필터 조회 3회로 보충.
  결과가 0건이거나 직전보다 50% 넘게 줄면 저장하지 않음.
- 정규화 스키마 v1 (분반 1개): `{ id(crseNo), code, name, type(이수구분), credit, grade, college, dept, deptCd, profs[], time, slots[[요일0~6, 시작분, 종료분]], campus(산격동/동인동/상주/""), room, remark, tags[], capacity, applied, basket }`
- 저장 위치: **레포에 커밋 (방식 a)** → Vercel 자동 재배포. 클라이언트가 1회 다운로드한 뒤 검색·조합을 모두 클라이언트에서 처리.
- 이수체계(교육과정편람): 스냅샷의 `deptCd` 목록 → `searchEduCourList`(add_major.py 로직) 일괄 실행 → 전 학과·전 학번 자동 생성 (예정).
  실측(2026-11-10): 학부 개설학과 코드 212개 중 137개는 이미 있음, 75개 없음. 없는 것 중 토목공학과·첨단반도체융합전공·농산업학과·비즈니스인텔리전스융합전공·인지과학융합전공 등은 교육과정이 받아짐.
  7자리 코드(1O01001 등)는 기존 학과의 하위 개설 코드, 학사과(30019)·자율학부 등은 교육과정 없음 → 결과가 빈 코드는 건너뛰면 됨. 연속 요청 시 연결이 끊기므로 0.5초 이상 간격 + 재시도.
- 계절학기(s/w)도 수집. 아직 열리지 않은 학기(0건 + 이전 파일 없음)는 실패가 아니라 건너뜀.
- **전 학과 이수체계 자동 수집**: `scripts/collect-curricula.mjs` → `web/public/courses/d_{학과코드}/{연도}.json` + `web/public/data/majors-extra.json`
  (기존 courses.ts 학과는 코드·학과명으로 비교해 건너뜀, 6자리 전공 코드는 4자리 학부 공통 과정을 합침, 결과 없는 코드는 버림).
  새 화면은 `lib/planner/majors.ts`의 `loadMajors()`로 기존 학과 + 자동 수집 학과를 합쳐 쓴다(학과 선택에 "신규" 배지). 기존 사이트(`/`)는 그대로.
  학번 파일이 없으면 가까운 학번 이수체계로 대체(`loadCurriculum`의 years).
- **코드표 기반 전 학과 수집 (2026-11-11)**: `scripts/data/knu-depts.txt`(사용자가 준 학부·대학원 전체 코드표, 행정실·단과대·학부 7자리 분반 묶음 제외) → `collect-curricula.mjs --from-list`.
  코드마다 2026·2023·2021 학번을 먼저 찔러 보고 하나라도 나오면 2021~2026 전부 받음, 다 비면 버림. 4개 동시, 약 40분.
  **대학원 코드는 `sbjetSctinClscd: ""`** 이어야 결과가 나온다(학부용 STCU000700001이면 0건). 하위 전공(학부 6자리 → 4자리, 대학원 7자리 → 5자리 학과 또는 3자리 전문대학원)은 상위 공통 과정을 합침.
  라벨: 학부 하위 전공 `학부명-전공명`, 대학원 `대학원 학과명`·`교육대학원 국어교육전공`, 상주는 `[상주]`. 대학원은 `level: "grad"`. 같은 라벨이 여러 코드면 학번이 많은 쪽만.
  결과(2026-11-11): 1,072개 확인 → majors-extra 368개(학부 63 · 대학원 305). 기존 courses.ts 학과의 빈 학번 파일은 API에서도 비어 있음을 확인(그 학번에 과정 없음).
- 1단계 학과 선택 위에 **학부 / 대학원 탭**(`st.level`, 새로고침 후에도 유지). 탭에 맞는 학과만 목록에(복수전공도 같은 과정), 탭을 바꾸면 안 맞는 학과는 해제. 대학원 학과를 고르면 "대학원 포함"이 자동으로 켜짐. 대학원 학과엔 "신규" 배지 안 붙임.
  주의: 기존 courses.ts의 컴퓨터학부 전공(cs_*) deptCd가 `1002xx`로 적혀 있지만 실제 코드는 `1O02xx`(영문 O). 과목 파일 내용은 맞음.
- 이 클라우드 세션에서 Node fetch로 수집할 때는 `NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt`가 필요하다 (로컬/GitHub Actions에서는 불필요).

### 개발·배포 절차 (리뉴얼 이후)
- Vercel GitHub 연동, Root Directory = `web`. **`main`에 push/merge할 때만 운영 배포**, 그 밖의 브랜치는 push마다 **Preview URL**이 생성됨
  (`ai-major-tracker-git-<브랜치명>-insu0531.vercel.app`, PR에 vercel[bot] 댓글로 링크가 달림).
- 코드 변경: 작업 브랜치 → 로컬 `npm run dev` → push → Preview에서 PC·모바일 확인 → PR → main 머지(=운영 반영).
- 데이터 갱신: GitHub Actions cron이 수집기를 실행하고 변경분만 main에 커밋 → 운영 자동 재배포 (예정). 수강신청 기간에는 주기 단축.
  Vercel Hobby 한도(하루 배포 100회)를 고려해 최소 1시간 간격 유지.
- 분석: PostHog 도입 확정 (Google Form 비콘 대체).
- 작업 순서: ① 수집 실측(완료) → ② 데이터 구조 확정 → ③ 조합 엔진 → ④ UI.

### 조합 엔진
- Web Worker로 이동, 30분 단위 요일 비트마스크 충돌검사, 백트래킹 + 필터 조기 가지치기, 정렬 점수 기준 상위 K개만 유지(전수 보관 금지).
- 정렬 기준 후보: 공강일 수, 첫 수업 시작 시각, 마지막 수업 종료 시각, 우주공강(빈 시간) 총합, 총 학점/목표 학점 근접, 하루 최대 연강, 경쟁률(신청/정원).

### 라우트 (2026-11-11 교체)
- **`/` = 새 시간표 검색 화면** (`app/page.tsx` → `components/planner/PlannerClient.tsx`(ssr:false) → `Planner.tsx`, 스타일 `app/planner.css`)
- **`/old` = 구버전** (`app/old/page.tsx`, 예전 `app/page.tsx` 그대로 + 헤더에 "새 버전으로 가기"). 새 화면 메뉴에 "구버전 보기".
- `/new`는 `next.config.ts` redirects로 `/`에 연결. `/privacy`는 그대로.
- 구버전 파일의 setState-in-effect 린트 오류 3개는 원래부터 있던 것.

### 데이터 자동 갱신 (GitHub Actions)
- `.github/workflows/update-data.yml`: 매일 03:17(KST) 1회 `collect-sections.mjs` — **다가오는 정규학기 하나만**(10~3월 → 다음 1학기, 4~9월 → 2학기. 11월이면 2027-1. 사용자 요청 2026-11-11, 다른 학기는 수동 실행에서 지정). 0건이면 건너뛰므로 학교에 미리 뜨면 다음 날 잡힘, 1월·7월 15일 03:47(6개월마다, 수강신청 전) `collect-curricula.mjs --from-list` + 스냅샷 모드(제한 120분). 바뀐 파일이 있을 때만 main에 커밋 → Vercel 재배포.
  수동 실행(Run workflow)에서 학기 지정·이수체계 포함 선택 가능. **워크플로 파일이 main에 있어야 예약 실행됨.**
- 수집기는 내용이 같으면 파일을 다시 쓰지 않음(불필요한 커밋 방지).

### 계정 · 친구 (Supabase, 2026-11-11)
- 설정: `supabase/README.md` (Supabase 도쿄 리전(Asia-Pacific로 생성) + 구글 OAuth + Vercel 환경변수 `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`). `NEXT_PUBLIC_ACCOUNTS_LIVE=1`까지 있어야 켜짐. 그 전엔 상단에 "로그인 · 친구 [준비 중]" 버튼만(누르면 토스트), 초대 링크도 무시.
- DB: `supabase/schema.sql` — profiles(이름·초대 코드), plans(보관함, 학기별 featured 1개), friendships(양방향 2행). RLS로 내 것만, 친구 데이터는 security definer 함수로만:
  set_featured, accept_invite, remove_friend, get_friends, get_friend_timetable(강의실·분반 번호 제거), regenerate_invite, delete_account.
  로컬 PostgreSQL 16 + auth 스키마 흉내로 권한 시나리오 검증함(타인 데이터·비친구·초대코드 조작·탈퇴 cascade).
- 클라이언트: `lib/supabase.ts`(PKCE), `lib/account.ts`(useSession·보관함 CRUD·친구 RPC), `components/planner/FriendsPanel.tsx`.
  초대 링크 `/?invite=코드` → localStorage `knu_pending_invite`에 기억 → 로그인 후 자동 수락. 이 브라우저 보관함은 "계정으로 옮기기"(기존 사이트 저장본은 원본 유지, `knu_planner_migrated_v1`로 숨김).
- 범위: 로그인·동기화·대표 시간표·친구 추가/보기/삭제·탈퇴. 공강 맞추기는 이번 범위 아님. 친구에게는 과목명·시간·교수님만(사용자 결정).

### 모바일 (≤720px, 2026-11-11 점검)
- 2단계·3단계는 머리말까지 **한 번에 스크롤**(내부 스크롤 대신) → 과목 표·시간표가 바로 보임. 2단계 필터는 휴대폰에서 처음에 접힘.
- 입력칸 16px(iPhone 확대 방지), 상단 "로그인·친구 준비 중"은 메뉴로, 3단계 버튼 2열·일괄 이미지 저장 숨김, 모달은 바텀시트, 분반 고르기 창도 화면 아래 시트.
- 표는 담기·과목명·펼침만 보이고 과목명 아래 요약. 펼친 분반은 세로로 쌓기(교수→시간→강의실·정원→버튼 2개). colspan 때문에 `table-layout: fixed` 쓰면 과목명 칸이 좁아지니 쓰지 말 것.
- 사용법 투어: `GuideTour variant="planner"`로 사이트 디자인(구버전은 classic 그대로).

### 카톡 공유 (시간표 이미지)
- 결과 화면 [카톡 공유]: `renderTimetablePng()`(exportImage.ts, 이미지 저장과 같은 그림) → `shareTimetableImage()`(kakaoShare.ts)
  1) Kakao SDK `Share.uploadImage`로 카카오 서버에 올리고 `sendDefault` feed 카드(제목 "2026년 2학기 시간표" · 설명 두 줄 "전공" / "KNU 시간표 마법사에서 만들었어요" · "나도 시간표 짜기" 버튼)
  2) 실패 시 `navigator.share({files})`(휴대폰 공유 창) 3) 그것도 안 되면 이미지 다운로드.
- 분반 미선택 과목이 있으면 이미지 저장처럼 "분반 고르고 공유" 창 먼저. 카카오 개발자 콘솔에 사이트 도메인(`https://knuclass.vercel.app`)이 등록돼 있어야 함(기존 공유 버튼과 같은 앱 키). 공유 링크 주소는 `kakaoShare.ts`의 `SITE_URL`. 메뉴의 "카카오톡으로 공유"는 사이트 소개(텍스트) 공유.

### 새로고침 · 저장 상태 (2026-11-11, 사용자 요청)
- 새로고침하면 **담은 과목·조건·단계는 초기화**, 내 정보(학기·학과·학번·복수전공·캠퍼스·대학원·정원 필터)만 localStorage에 남김(`KEEP_ON_RELOAD`/`pickProfile`).
- 저장 안 한 시간표가 있으면(`dirty` = 담은 과목 있음 && 지금 시간표가 마지막 저장과 다름): F5·Ctrl/⌘+R → "새로고침할까요?" 창(보관함에 저장하고 새로고침 / 저장하지 않고 / 취소),
  브라우저 버튼·당겨서 새로고침은 `beforeunload` 기본 확인 창만 가능(브라우저 보안 제한).
- 보관함 행: 보기 · 이름 수정 · 카톡 공유 · 삭제 (+ 계정 저장본은 대표로). 미리보기에도 이미지 저장 · 카톡 공유.

### 빈 시간 교양 추천 (`lib/planner/recommend.ts`)
- 3단계 시간표 아래 "이 시간표 빈 시간에 넣기 좋은 교양" 최대 8개. 규칙 점수: 공강 요일 유지 +30(새 평일 -15, 새 주말 -25), 앞뒤 수업과 이어짐 +10, 2시간 넘는 공강 생기면 -10, 9시 전 -8/18시 후 -6, 정원 여유 (1-신청/정원)×10, SDG·인문교양 +3. 같은 시간대는 최대 2개.
- "이 분반 넣기" = 그 분반으로 고정 + 꼭 넣을 과목으로 담음. 넣은 과목은 목록 위에 "넣음 ✓ · 빼기"로 남아 토글(`recAdded`). 이벤트 `rec_added`/`rec_removed`.
- 점수 상위 24개 중 8개를 순위 가중 무작위(`sampleRecs`, seed)로 → 들어올 때마다 다르고 "↻ 다른 추천 보기"로 바꿈.
- **"빈 시간 채우기" 한 칸으로 통합 (2026-11-11, 사용자 요청)**: 시간표 바로 아래 ① 검색창(맨 위) → ② **교양 추천 / 전공 추천 탭**(+ ↻ 다른 추천 보기) → ③ 목록.
  검색어가 있으면 탭 대신 ① **"빈 시간에 들어가는 분반"**(검색어에 맞는 과목을 구분 상관없이 `recommendFill(perSection: true)`로 **들어가는 분반 전부**(과목별로 묶어 최대 30개, 같은 과목 두 번째 분반부터는 분반 번호만 들여서), 추천과 같은 이유 칩·"이 분반 넣기", `recommendSearch`) → ② "전체 검색 결과"(`QuickAdd.tsx`, 2단계 `CourseRow` 미니 표). 검색 매칭은 `recommend.ts`의 `courseMatches`/`normQuery` 공용. 지우면 추천으로 돌아옴. 넣은 추천 과목("넣음 ✓ · 빼기")은 탭과 무관하게 맨 위. 넣은 뒤 결과가 0개(필수 과목 불가 포함)가 돼도 빈 화면 아래 "방금 넣은 과목" 칸에 같은 빼기 버튼을 보여 줌(`emptyWithAdded`).
  탭 순서 **전공 추천 → 교양 추천**(학과 있으면 전공 탭이 기본). 전공 추천 = `recommendFill(categories: ["major","major2"], includeGrad)`, 학과가 없으면 탭 숨김.
  전공 탭 아래에는 "다른 전공 과목"(`majorMore`: 안 담은 내 전공·복수전공 과목 전부, 학년·이름순 최대 40) — 시간이 겹쳐도 `QuickAdd list` 미니 표로 담기/분반 고정 가능, 담으면 엔진이 다시 짬 (2026-11-11 요청). 이벤트 `rec_tab`, `rec_added`에 tab.
- 결과 머리의 안내 버튼은 하나: "✦ 내 시간표 맞춤 추천 받기 · 교양 N · 전공 N개 · 과목 검색" → `#pl-fill`로 스크롤 (칸 제목도 "내 시간표 맞춤 추천"). 규칙 기반이라 "AI" 표현은 안 씀.
- 추천 이유 칩은 종류별 색(`data-kind`: 공강 초록 · 이어짐 파랑 · 정원 주황 · SDG 청록 · 인문교양 분홍 · 원격 회색).

### `/new` 통합 시간표 검색 (1차 구현, 2026-11-10)
기존 화면(`/`)은 그대로 두고 새 화면을 `/new`에 병행. 전공/교양/교직 마법사 3개 → **데이터는 하나로 합치고, 화면은 3단계**
(① 내 정보 → ② 과목 담기 → ③ 시간표(조건·정렬·결과)).
- **담기는 버튼 하나** ("필수/후보" 2버튼은 "차이를 모르겠다" 피드백으로 폐기). 담은 과목은 기본적으로 모두 후보(`mode: "maybe"`)이고, 엔진이 겹치지 않게 최대한 많이 넣은 조합을 만든다(기존 전공 마법사와 같은 동작).
  반드시 포함은 3단계 조건의 **"꼭 넣을 과목"** 칩(기존 "필수 포함 과목" 필터와 같은 역할)으로 `mode: "must"` 전환.
- 기존 사이트에서 가져온 편의 기능: 분반 고정/제외, 같은 시간 교수 선택(수강신청 코드 창), 수강신청 코드 복사 + 사이트 링크, 이미지 저장, **전체 이미지 일괄 저장**(20장 초과 시 확인),
  보관함(이름 변경·삭제 + **기존 `knu_saved_timetables` 저장본을 변환해 함께 표시**, 원본은 유지), `trackSave` 저장 로그, 메뉴(사용법 투어=GuideTour 재사용, 학사일정·피드백=기존 컴포넌트를 큰 창으로, 카톡 공유, 다크 모드=`theme` 키 공유), ← → 키로 결과 넘기기. 처음엔 3단 한 화면이었으나 "가독성이 떨어짐 / 한 화면에 너무 많음" 피드백으로 단계형으로 변경 (2026-11-10).
- 가독성 기준: 본문 15px 안팎(clamp), 보조 텍스트 14px, 정보 텍스트는 `--ink`/`--ink-2`(연회색 `--ink-3`은 힌트에만). 한 단계에 한 가지 일만.
- 2단계 과목 목록은 **표**(담기 + 교과목명·**교과구분**(이수구분, 분반별로 다르면 "전공필수·융합전공"처럼 모음, 정렬 가능, 휴대폰은 과목명 아래 요약에)·학년·학점·개설학과·교수·강의시간·분반, 헤더 클릭 정렬, 행 클릭 시 분반 펼침) — 카드형은 "전부 회색이라 한눈에 안 들어옴" 피드백으로 교체. 필터는 기본으로 펼침.
- 디자인 시스템(planner.css 상단 주석): OKLCH 틴티드 뉴트럴 + KNU 레드 1색, 4/8px 간격 토큰(--s1~s8), 테두리 대신 배경 톤·그림자, 제목만 `--font-head`(기본 Paperlogy, `data-font="gmarket|suit"`로 교체 가능), `clamp()` 유동 글씨, `:focus-visible` 외곽선, transform/opacity 모션 + reduced-motion 대응.
- 시간표 색: 밝은 12색 `PALETTE`를 담은 순서대로 배정(한 시간표 안 중복 없음), 밝은 블록은 `textOn()`으로 어두운 글씨.
- 결과 화면에서 수업 시간대 필터·평균 시간·경쟁률은 사용자 요청으로 제거. **다크 모드도 제거**(이 화면에서만 `html.dark`를 떼고, 기존 사이트 설정은 유지).
- 2단계 표: 비고 칸은 "SU평가 포함·원격 포함·영어강의 포함…" 요약(분반 중 하나라도 해당), 자세한 비고는 펼친 분반별로. 맨 오른쪽 ⌄ 펼침 표시.
  분반 고정/제외 버튼은 안 담은 과목에도 보이고, 누르면 자동으로 담김. 넓은 화면(≥1100px)에선 제목·검색 | 필터를 나란히 두어 표 칸을 넓힘.
  "타학과 개설 포함" 배지.
- 2단계 구분은 **탭**(한 번에 한 구분, 탭마다 과목 수 표시, 구분별 색 `--c-*`). 검색하면 탭과 무관하게 전체 검색. 비고 열, "정원 남은 분반만"(시간표 계산에도 적용), "타학과 개설" 배지(내 이수체계 과목인데 다른 학과가 연 것).
- 분반 버튼 용어: "이 분반으로 고정 / 고정 해제", "이 분반 제외 / 제외 취소". **고정한 과목은 반드시 포함**(엔진 group.must = mode==='must' || pinned, 기존 사이트 규칙). 고정 분반은 정원·캠퍼스 필터를 무시. 3단계 '꼭 넣을 과목' 칩에 '· 고정'으로 표시(눌러도 안 풀림). 3단계 교수 조건: "꼭 들어야 하는 교수님"(엔진 leaf 검사, 해당 분반으로 표시 확정) / "피하고 싶은 교수님".
- 시간표 블록 색은 OKLCH L0.605·C0.11 12색(주변 뉴트럴과 톤 맞춤, 전부 흰 글씨).
- **3단계 조건 순서 (2026-11-11, 사용자 요청)**: 꼭 넣을 과목 → 정렬(기본 **학점 높은 순**, "늦게 시작"·"일찍 끝남" 삭제) → **시간대** → 학점 → 공강(요일 + 하루 일정 칩) → 교수님. 칩·여백을 줄여 촘촘하게(`.pl-cond` 스코프).
  시간대: `TimeRangePicker.tsx` 창(월~토 8~22시 30분 칸, 클릭·드래그로 칠함, 터치는 pointer + elementFromPoint). "빼고 싶은 시간" = `cond.blockedSlots`(그 칸에 걸리는 분반 사전 제거, 추천도 피함), "꼭 넣을 시간" = `cond.requiredSlots`(엔진 leaf에서 마스크가 그 칸을 모두 덮어야 통과). 두 모드는 한 격자를 같이 씀(한 칸은 한 모드만, 적용하면 둘 다 저장), 요일 머리를 누르면 그 요일 전체 칠하기/지우기, 칠한 색은 연한 빨강·연한 파랑.
- 3단계 "하루 일정" 조건: 점심시간(12~13시) 비우기 / 3시간 넘는 연강 없음 / 2시간 넘는 공강 없음 / 하루 3과목 이하 / 원격강좌 빼기.
  엔진 `dayRulesOk()` — 연강·과목 수는 탐색 중 가지치기, 공강은 완성 시 검사. "더 넣을 수 있는 후보" 판정에도 같은 규칙을 적용해야 결과가 사라지지 않음.
- 이미지 저장 규격(사용자가 준 시간표 앱 캡처 기준): 요일 머리줄 60 · 시간 열 62 · 요일 칸 214 · 1시간 135px (크기만 맞추고 모양은 사이트 아이덴티티: 회백색 배경·세로선 없는 격자·30분 점선·각진 단색 블록(음영·둥근 모서리 없음, 2026-11-11 요청)·Paperlogy 요일/과목명·왼쪽 위 KNU 로고·24시간제 두 자리),
  한글 요일, 12시간제 시각, 블록은 칸을 꽉 채우고 과목명(굵게)+강의실. 월~금 9~18시면 1132×1275.
- 학기: 계절학기 포함, 시간순(1→여름→2→겨울). `lib/planner/semester.ts`의 `recommendedSem()`이 날짜로 기본 학기 선택(4~6월 여름, 7~9월 2학기, 10~11월 겨울, 12~3월 1학기; 데이터 없으면 직전 학기). 직접 고른 학기는 같은 시기 동안만 유지(`semChosenFor`). 1단계는 연도(데이터 첫 해~지금+4년)·학기 두 칸으로 따로 고르고, 데이터 없는 학기는 "(준비 중)" 표시. 그래도 조회 가능(2026-11-11 요청): `dataSemFor()`가 같은 학기의 가장 최근 해(없으면 직전 학기) 스냅샷을 대신 불러오고, 1단계 안내 + 2·3단계 상단 노란 띠(`.pl-sem-note`)로 "○○ 개설 정보로 보여 드려요" 표시. 시간표 제목·저장 학기는 고른 학기 그대로.
- 문의 이메일 insu0531@knu.ac.kr (1단계 하단·메뉴), 개인정보처리방침 `/privacy` (`app/privacy/page.tsx`, 수집 항목이 바뀌면 같이 고칠 것).
- 사용 패턴 분석: `lib/analytics.ts` (PostHog, `NEXT_PUBLIC_POSTHOG_KEY`/`NEXT_PUBLIC_POSTHOG_HOST`(기본 EU) 없으면 no-op, 쿠키 없이 localStorage, 세션 녹화 끔, 메뉴에서 수집 거부 가능).
  주요 이벤트: step_view, major_selected, tab_changed, search, filter_toggled, course_added/removed/must, results_computed, condition_changed, image_saved(_bulk), plan_saved, codes_opened, code_copied, kakao_share, menu_*.
  PostHog 프로젝트 설정에서 "Discard client IP data"를 켜야 개인정보처리방침과 일치.
- 학교 데이터는 연강을 `토 9:00~10:30, 토 10:30~12:00`처럼 쪼개 준다 → 표시·이미지·시간 문자열은 `mergeSlots()`로 합쳐서 그린다.
```
web/app/new/page.tsx            ssr:false로 Planner 로드 (localStorage 초기값 사용 때문)
web/app/new/layout.tsx          메타데이터 + Pretendard(CDN)
web/app/new/planner.css         전용 디자인 토큰(.pl 스코프, 다크 = html.dark), 기존 globals.css의 !important 다크 오버라이드와 분리
web/components/planner/
  Planner.tsx       단계 전환 + 상태(학기·학과·학번·복수전공·장바구니·조건·현재 단계 → localStorage `knu_planner_state_v1`), Worker 호출, 모달(코드/저장/보관함)
  CourseBrowser.tsx 과목 담기: 검색 + 구분칩(내 전공/복수전공/교양/교직/일반선택/타학과) + 필터(학년·학점·특성·캠퍼스·대학원) + "빈 시간에 맞는 것만"
  CartPanel.tsx     CartList(담은 과목, 2단계 사이드·모바일 모달·3단계) / ConditionsPanel(3단계 정렬·학점·공강·시간대·피할 교수)
  ResultPanel.tsx   결과 목록 + 선택 시간표 + 이미지/보관함/수강신청 코드
  Timetable.tsx, MajorPicker.tsx
web/lib/planner/
  types.ts          RawSection/Course/CartItem/Conditions/Engine* 타입
  data.ts           스냅샷·이수체계 로드, 과목 분류(categorize), 엔진 입력 생성(같은 시간 분반 = 1 선택지), 과목코드별 고정 색
  engine.ts         조합 엔진: 요일별 32bit 마스크(07~23시, 30분 단위), 백트래킹, 학점 가지치기, "더 넣을 수 있는 후보가 남은 조합" 제외, 정렬 기준 상위 300개 힙, 노드 400만 상한(truncated)
  engine.worker.ts  Web Worker 래퍼
  exportImage.ts    exportTimetable({title, items}) — 캔버스로 직접 그려 PNG 저장 (DOM 캡처 없음)
  storage.ts        localStorage 래퍼(try/catch), 보관함 `knu_planner_saved_v1`
```
- 첫 방문 기본 학과: 전자공학부 인공지능전공(`ai`).
- 규칙: 대학원 과목·상주/동인동 캠퍼스는 필터(기본: 대학원 숨김, 상주 학과면 상주만·아니면 산격동+동인동). 기본 최대 21학점.
- 결과는 계산에 쓴 groups와 함께 저장한다 (담은 과목이 바뀌는 사이 이전 결과의 picks가 새 groups와 어긋나 크래시 났던 버그 방지).
- 검증: `npx next build` 후 `next start` + Playwright로 담기→결과→정렬→공강필터→이미지→새로고침 유지, 데스크톱 1440/모바일 390 확인.
- 남은 일: 이수체계 전 학과 자동 수집, GitHub Actions 수집 cron, PostHog, 보관함 이전(기존 `knu_saved_timetables`), 학사일정/피드백 이식, `/new` → `/` 교체.

### 기타
- 이미지 저장: DOM 캡처 대신 데이터로 직접 그리는 단일 `exportTimetable(combo, options)` 함수. 교수 선택은 저장 시 모달이 아니라 과목 담을 때 처리.
- 레이아웃: PC/태블릿 3패널(조건 | 과목 풀 | 결과), 모바일은 "담기 → 결과" 2단계 + 바텀시트.

---

## UI/UX 개선 백로그 (2026-11-11 재정리, 중요도순)
> 기준: 핵심 흐름(학과 선택 → 과목 담기 → 시간표 고르기 → 저장·공유·수강신청)에 주는 영향 × 사용 빈도. 난이도 하/중/상.
> 완료: 연도·학기 분리, 학부/대학원 탭, 전 학과·대학원 이수체계, 3단계 조건 재배치·시간대 고르기, 맞춤 추천(전공/교양 탭·검색 추천·분반별·다른 전공 과목), 교과구분 칸, 준비 중 학기 조회, 이미지 블록 각지게, 카톡 도메인.
> 제외: 강의계획서 바로가기(학교 WebSquare 팝업이라 직접 링크 불가).

### 높음
1. **추천이 하루 일정 조건을 안 봄 (버그성)** — `recommend.ts`는 겹침·공강 요일·점심·빼고 싶은 시간만 검사하고 연강 3시간·공강 2시간·하루 3과목은 안 봐서, "이 분반 넣기" 후 결과가 0개가 될 수 있음. 엔진 `dayRulesOk`와 같은 검사를 추천에도. (하)
2. **3단계가 너무 길고 복잡** — 조건 패널 + 시간표 + 맞춤 추천(검색·전공·교양·다른 전공) + 다른 시간표 목록이 한 화면에 쌓임. 추천을 접을 수 있는 칸/바텀시트로, "다른 시간표"는 시간표 바로 위 가로 썸네일로 올리는 식으로 정리. (중)
3. **결과 0개일 때 원인 해제 버튼** — "금요일 공강 해제", "21 → 24학점", "시간대 조건 지우기"처럼 원클릭 완화 + 어떤 조건이 막는지 계산. 지금은 문장 안내뿐. (중)
4. **카톡 공유 실패가 조용함** — 카카오가 거절하면(도메인 미등록 등) 말없이 공유 창/이미지 저장으로 넘어가 원인 파악이 어려웠음(2026-11-11 실제 발생). "카카오 공유가 안 돼 사진으로 보내요" 안내 + 실패 이벤트 기록. (하)
5. **재방문 시 바로 2단계** — 학과·학번을 기억하는데도 새로고침하면 1단계부터. (하)
6. **같은 시간 여러 분반 자동 선택** — 기본이 "미선택"이라 이미지·수강신청 코드에서 매번 고르는 창. 정원 여유가 가장 많은 분반을 기본으로 + "자동 선택" 표시. (하)
7. **신청 인원·정원 기준 시각** — 수집 시점 값인데 표시가 약함. "11/11 03:17 기준"을 정원 옆에. (하)

### 중간
8. **결과 목록이 과목명 나열뿐** — 미니 시간표 썸네일 또는 요약 칩(공강 요일·첫/마지막 수업)으로 비교. (#2와 같이 하면 좋음) (중)
9. **시간표 블록 글자 대비 3.6~4.1** — 블록 색 한 단계 진하게(L 0.605 → 0.55) 또는 글자 굵기 상향. (하)
10. **시간대 고르기 창 휴대폰·키보드** — 30분 칸 높이 15px라 손가락으로 정확히 칠하기 어려움(1시간 단위 보기 옵션), 키보드로 못 고름. (중)
11. **시간표 링크 공유** — 카톡은 이미지만. 분반 ID를 URL에 담아 링크로 같은 시간표 열기. (중)
12. **2단계 하단 바에 목표 학점 진행** — 최대 학점 대비 담은 학점 막대, 부족하면 결과가 적다는 안내. (하)
13. **첫 데이터 로딩 동안 빈 화면** — 1단계에서 미리 받기 + 2단계 표 스켈레톤. (하)
14. **모바일 결과 넘기기** — ‹ › 버튼만. 시간표 좌우 스와이프. (중)
15. **학사일정·피드백 창 디자인 불일치** — 구버전 컴포넌트(인디고·Tailwind) 그대로. (중)
16. **보관함 비교** — 두 시간표 나란히, 학기·날짜순 정렬. (중)

### 낮음 · 운영
17. **레포 용량** — 이수체계 약 20MB 추가 + 매일 스냅샷 커밋으로 히스토리가 계속 커짐. 장기적으로 데이터 전용 브랜치나 별도 저장소. (중)
18. **학과 목록 정리** — 대학원 세부전공 중 협동과정 참여학과 이름이 섞였는지 점검, 학과 검색에 단과대 표시. (하)
19. 일괄 이미지 저장 ZIP 한 파일로. (중)
20. 다크 모드 재도입 여부 / 구버전(/old) 정리 시점(PostHog `old_version_opened`) / 키보드 접근성(표 펼치기 Enter·Space, 모달 포커스 가두기). (중)
21. **설정 확인(직접)** — PostHog 키·"Discard client IP data", Supabase·구글 설정 후 `NEXT_PUBLIC_ACCOUNTS_LIVE=1`, Actions "강의 데이터 갱신" 첫 실행 결과.
