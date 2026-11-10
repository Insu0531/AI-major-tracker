import type { Metadata } from "next";
import Link from "next/link";
import "../planner.css";

export const metadata: Metadata = {
  title: "개인정보처리방침 · KNU 시간표",
  description: "KNU 시간표(경북대학교 시간표 마법사)의 개인정보처리방침",
};

const CONTACT = "insu0531@knu.ac.kr";
const EFFECTIVE = "2026년 11월 11일";

// 실제 처리 내용이 바뀌면(분석 도구 추가·보관 기간 변경 등) 이 페이지와 시행일을 함께 고친다.
export default function PrivacyPage() {
  return (
    <>
      <link
        rel="stylesheet"
        href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        precedence="default"
      />
      <div className="pl pl-doc">
        <article className="pl-doc-body">
          <Link className="pl-link" href="/">← 시간표로 돌아가기</Link>
          <h1>개인정보처리방침</h1>
          <p className="pl-hint">시행일: {EFFECTIVE}</p>

          <p>
            KNU 시간표(이하 “서비스”)는 경북대학교 학생이 개설 강좌를 찾아 시간표를 짜도록 돕는 개인 운영 서비스입니다.
            서비스는 로그인 없이 쓸 수 있고, 이 경우 이름·학번·연락처처럼 개인을 직접 알아볼 수 있는 정보를 받지 않습니다.
            <b>구글 계정으로 로그인(선택)</b>하면 보관함 동기화와 친구 기능을 위해 아래 1항의 계정 정보를 처리합니다.
            이 방침은 서비스 이용 중 어떤 정보가 어디에 저장되고 어떻게 쓰이는지 알려 드립니다.
          </p>

          <h2>1. 처리하는 정보와 목적</h2>
          <table className="pl-doc-table">
            <thead><tr><th>구분</th><th>항목</th><th>목적</th><th>저장 위치</th></tr></thead>
            <tbody>
              <tr>
                <td>내 기기에만 저장</td>
                <td>선택한 학기·학과·입학연도, 담은 과목, 조건, 보관함에 저장한 시간표, 화면 설정</td>
                <td>다시 방문했을 때 이어서 쓰기</td>
                <td>이용자 브라우저(localStorage). 서버로 보내지 않음</td>
              </tr>
              <tr>
                <td>계정 (구글 로그인 시)</td>
                <td>구글 계정 이메일, 이름(구글 프로필 이름), 계정 식별자, 로그인 기록</td>
                <td>로그인, 기기 간 보관함 동기화, 친구 기능에서 이름 표시</td>
                <td>Supabase</td>
              </tr>
              <tr>
                <td>보관함 · 친구 (로그인 시)</td>
                <td>저장한 시간표(과목·시간·교수·강의실), 학기별 대표 시간표 지정, 친구 관계, 초대 코드</td>
                <td>시간표 저장·동기화, 친구에게 대표 시간표 보여 주기</td>
                <td>Supabase</td>
              </tr>
              <tr>
                <td>이용 통계</td>
                <td>방문한 화면, 버튼 클릭·검색어·필터 선택 등 이용 기록, 무작위 익명 식별자, 브라우저·운영체제·기기 종류, 접속 국가/도시(대략)</td>
                <td>어떤 기능이 많이 쓰이고 어디서 불편한지 파악해 서비스 개선</td>
                <td>PostHog, Vercel Analytics</td>
              </tr>
              <tr>
                <td>저장 통계</td>
                <td>시간표 저장 시 학과명, 입학연도, 저장 종류(이미지/보관함)</td>
                <td>학과별 이용 현황 파악</td>
                <td>Google Forms(Google 스프레드시트)</td>
              </tr>
              <tr>
                <td>피드백</td>
                <td>이용자가 직접 입력한 내용(연락처를 적은 경우 그 연락처 포함)</td>
                <td>문의 답변, 오류 수정, 기능 개선</td>
                <td>Google Forms(Google 스프레드시트)</td>
              </tr>
            </tbody>
          </table>
          <p>
            이용 통계는 개인을 식별하지 않는 방식으로만 수집합니다. 쿠키를 쓰지 않고, 화면 녹화(세션 리플레이)를 하지 않으며,
            IP 주소는 대략적인 지역을 계산하는 데만 쓰고 저장하지 않도록 설정합니다.
          </p>

          <h2>2. 보유 기간</h2>
          <ul>
            <li>내 기기에 저장된 정보: 이용자가 직접 지우거나 브라우저 데이터를 삭제할 때까지</li>
            <li>계정·보관함·친구 정보: <b>회원 탈퇴 시 즉시 삭제</b> (메뉴 → 회원 탈퇴)</li>
            <li>이용 통계·저장 통계: 수집일로부터 1년이 지나면 삭제</li>
            <li>피드백: 처리 완료 후 1년이 지나면 삭제 (이용자가 요청하면 즉시 삭제)</li>
          </ul>

          <h2>3. 제3자 제공</h2>
          <p>서비스는 이용자의 정보를 제3자에게 판매하거나 제공하지 않습니다. 법령에 따라 요구되는 경우는 예외로 합니다.</p>
          <p>
            친구 기능: 이용자가 초대 링크·코드로 친구를 맺으면, 그 친구에게 <b>이름과 학기별 대표 시간표(과목명·요일·시간·교수명·학점)</b>가 보입니다.
            강의실·이메일은 보이지 않습니다. 대표 시간표를 해제하거나 친구를 삭제하면 더 이상 보이지 않습니다.
          </p>

          <h2>4. 처리 위탁 및 국외 이전</h2>
          <p>서비스 운영을 위해 아래 업체의 서비스를 이용하며, 이 과정에서 정보가 국외 서버에 저장될 수 있습니다.</p>
          <table className="pl-doc-table">
            <thead><tr><th>업체</th><th>위탁 업무</th><th>이전 국가</th><th>이전 항목</th></tr></thead>
            <tbody>
              <tr><td>Supabase Inc.</td><td>로그인, 계정·보관함·친구 데이터 저장</td><td>대한민국(서울 리전) 서버 · 미국 법인</td><td>계정, 보관함·친구 정보</td></tr>
              <tr><td>Google LLC</td><td>구글 계정 로그인 인증</td><td>미국</td><td>로그인 시 인증 정보</td></tr>
              <tr><td>Vercel Inc.</td><td>웹사이트 호스팅, 방문 통계</td><td>미국</td><td>접속 기록, 방문 통계</td></tr>
              <tr><td>PostHog Inc.</td><td>이용 통계 분석</td><td>EU(독일)</td><td>이용 통계 항목</td></tr>
              <tr><td>Google LLC</td><td>저장 통계·피드백 접수</td><td>미국</td><td>저장 통계, 피드백 내용</td></tr>
              <tr><td>Kakao Corp.</td><td>카카오톡 공유 (공유 버튼을 누른 경우)</td><td>대한민국</td><td>공유 기능 이용 정보</td></tr>
            </tbody>
          </table>
          <p>이전 시점은 서비스 이용 시 네트워크를 통해 전송될 때이며, 거부하려면 아래 5항의 방법을 이용할 수 있습니다.</p>

          <h2>5. 이용자의 권리와 거부 방법</h2>
          <ul>
            <li><b>이용 통계 거부</b>: 시간표 화면 오른쪽 위 <b>메뉴 → 사용 통계 보내지 않기</b>를 누르면 이후 이용 통계를 보내지 않습니다. 브라우저의 추적 차단 기능을 써도 됩니다.</li>
            <li><b>내 기기 정보 삭제</b>: 브라우저 설정에서 이 사이트의 데이터(사이트 데이터·로컬 저장소)를 삭제하면 모두 지워집니다.</li>
            <li><b>계정 삭제</b>: 메뉴 → <b>회원 탈퇴</b>를 누르면 계정·보관함·친구 관계가 즉시 삭제됩니다. 구글 계정 연결 해제는 구글 계정 설정 → 보안 → 서드파티 앱에서도 할 수 있습니다.</li>
            <li><b>열람·삭제 요청</b>: 피드백으로 보낸 내용의 확인·삭제를 원하면 아래 연락처로 요청해 주세요. 지체 없이 처리합니다.</li>
          </ul>

          <h2>6. 만 14세 미만 아동</h2>
          <p>서비스는 대학생을 대상으로 하며, 만 14세 미만 아동의 정보를 알면서 수집하지 않습니다.</p>

          <h2>7. 안전성 확보 조치</h2>
          <p>모든 통신은 HTTPS로 암호화되며, 통계·피드백 데이터는 운영자 계정으로만 접근할 수 있도록 관리합니다.</p>

          <h2>8. 개인정보 보호책임자 및 문의</h2>
          <p>
            운영자(개인) · 이메일 <a className="pl-link" href={`mailto:${CONTACT}`}>{CONTACT}</a><br />
            개인정보 침해에 대한 신고·상담은 개인정보침해신고센터(privacy.kisa.or.kr, 국번 없이 118)에도 할 수 있습니다.
          </p>

          <h2>9. 방침의 변경</h2>
          <p>이 방침이 바뀌면 시행일과 함께 이 페이지에 알립니다.</p>
        </article>
      </div>
    </>
  );
}
