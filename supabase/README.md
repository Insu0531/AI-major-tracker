# 계정 · 친구 기능 설정 (Supabase + 구글 로그인)

설정값(환경변수)이 없으면 사이트는 로그인 없이 지금처럼 동작한다. 아래를 끝내고 Vercel에 환경변수를 넣는 순간 "구글 로그인 · 친구" 버튼이 나타난다.

## 1. Supabase 프로젝트 만들기
1. https://supabase.com 가입 → **New project**
2. Region: **Northeast Asia (Seoul)** · DB 비밀번호는 아무 강한 값(이후 거의 안 씀)
3. 만들어지면 왼쪽 **SQL Editor** → 이 폴더의 `schema.sql` 내용을 통째로 붙여 넣고 **Run**
   (여러 번 실행해도 안전하다. 표 3개 · 권한 규칙 · 함수 7개가 생긴다)

## 2. 구글 로그인 키 만들기 (Google Cloud Console)
1. https://console.cloud.google.com → 프로젝트 만들기 (예: knu-timetable)
2. **API 및 서비스 → OAuth 동의 화면**: 외부(External), 앱 이름 "KNU 시간표", 지원 이메일, 개발자 연락처 입력 → 저장
   - 범위(Scopes)는 기본(email, profile, openid)만
   - 게시 상태를 **프로덕션으로 게시**해야 아무 구글 계정이나 로그인 가능 (테스트 상태면 등록한 테스트 사용자만)
3. **사용자 인증 정보 → 사용자 인증 정보 만들기 → OAuth 클라이언트 ID**
   - 유형: 웹 애플리케이션
   - 승인된 리디렉션 URI: `https://<프로젝트ID>.supabase.co/auth/v1/callback`
     (Supabase → Authentication → Providers → Google 화면에 정확한 주소가 나온다)
4. 만들어진 **클라이언트 ID / 클라이언트 보안 비밀번호**를 복사

## 3. Supabase에 구글 연결
1. Supabase → **Authentication → Providers → Google** → Enable, 위 ID·비밀번호 붙여 넣기 → Save
2. **Authentication → URL Configuration**
   - Site URL: `https://knu-class-wizard.vercel.app`
   - Redirect URLs에 추가: `https://knu-class-wizard.vercel.app/`, `http://localhost:3000/`, `https://*-insu0531.vercel.app/` (미리보기 배포용)

## 4. Vercel 환경변수
Supabase → **Project Settings → API** 에서 복사해 Vercel → Settings → Environment Variables 에 추가 → Redeploy

| 이름 | 값 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL (`https://xxxx.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `anon` `public` 키 (공개용 키라 브라우저에 노출돼도 됨. **service_role 키는 절대 넣지 말 것**) |

로컬에서 시험하려면 `web/.env.local`에 같은 두 줄을 넣고 `npm run dev`.

## 동작 요약
- 로그인은 선택. 로그인하면 보관함이 계정에 저장되고, 이 브라우저 저장본은 "계정으로 옮기기"로 옮긴다.
- 학기마다 **대표 시간표** 하나 → 친구에게 보이는 시간표.
- 친구는 **초대 링크/코드**로만 맺는다 (이메일 검색 없음). 친구에게는 이름 + 대표 시간표(과목명·시간·교수님·학점)만 보이고 강의실·이메일은 안 보인다.
- 권한 검사는 전부 DB에서 한다(RLS + `security definer` 함수). 로컬 PostgreSQL 16에서 다른 사람 데이터 차단, 친구 아닌 사람 차단, 초대 코드 직접 수정 차단, 탈퇴 시 전체 삭제를 확인했다.
- 회원 탈퇴: 메뉴 → 회원 탈퇴 → 계정·시간표·친구 관계 즉시 삭제.
