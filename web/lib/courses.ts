export type Course = {
  grade: string;
  code: string;
  name: string;
  credit: string;
};

export const COURSES: Course[] = [
  { grade: "1", code: "CAIB0227", name: "인공지능수학1 (전공필수)", credit: "3-3-0" },
  { grade: "1", code: "COME0301", name: "이산수학 (전공필수)", credit: "3-3-0" },
  { grade: "1", code: "CAIB0229", name: "프로그래밍 기초와 실습 (전공필수)", credit: "4-3-2" },
  { grade: "1", code: "COMP0453", name: "컴퓨팅사고와 SW코딩 (전공필수)", credit: "4-4-0" },
  { grade: "1", code: "CAIB0236", name: "인터넷과웹기초 (전공필수)", credit: "3-3-0" },
  { grade: "1", code: "ELEC0253", name: "전기전자일반", credit: "3-3-0" },
  { grade: "2", code: "CAIB0226", name: "데이터분석 기초 (전공필수)", credit: "3-3-0" },
  { grade: "2", code: "CAIB0207", name: "기계학습입문 (전공필수)", credit: "3-3-0" },
  { grade: "2", code: "CAIB0228", name: "인공지능 기초와 활용 (전공필수)", credit: "3-3-0" },
  { grade: "2", code: "CAIB0230", name: "문제해결과 알고리즘 (전공필수)", credit: "3-3-0" },
  { grade: "2", code: "CAIB0231", name: "인공지능수학2 (전공필수)", credit: "3-3-0" },
  { grade: "2", code: "CAIB0234", name: "신경망개론 (전공필수)", credit: "3-3-0" },
  { grade: "2", code: "CAIB0237", name: "객체프로그래밍과 실습 (전공필수)", credit: "4-3-2" },
  { grade: "2", code: "CAIB0242", name: "생물정보학 기초", credit: "3-3-0" },
  { grade: "2", code: "COMP0324", name: "인공지능", credit: "3-3-0" },
  { grade: "2", code: "CROS0216", name: "로봇제어1", credit: "3-3-0" },
  { grade: "2", code: "CROS0218", name: "로봇운영체제 실습", credit: "3-2-2" },
  { grade: "2", code: "CROS0219", name: "모델링 및 시뮬레이션", credit: "3-2-2" },
  { grade: "2", code: "ITEC0419", name: "데이터과학기초", credit: "3-3-0" },
  { grade: "2", code: "ITEC0514", name: "뇌인지공학개론", credit: "3-3-0" },
  { grade: "3", code: "CAIB0221", name: "패턴인식기초 (전공필수)", credit: "3-3-0" },
  { grade: "3", code: "CAIB0208", name: "학부연구프로젝트 1 (인공지능전공)", credit: "6-4-4" },
  { grade: "3", code: "COMP0325", name: "알고리즘 (전공필수)", credit: "3-3-0" },
  { grade: "3", code: "CAIB0232", name: "지식표현과 추론", credit: "3-3-0" },
  { grade: "3", code: "COMP0455", name: "지능HCI", credit: "3-3-0" },
  { grade: "3", code: "CAIB0233", name: "영상이해", credit: "3-3-0" },
  { grade: "3", code: "ELEC0323", name: "마이크로프로세서", credit: "3-3-0" },
  { grade: "3", code: "CAIB0238", name: "인공지능세미나특강 (전공필수)", credit: "3-3-0" },
  { grade: "3", code: "MOBI0224", name: "딥러닝", credit: "3-3-0" },
  { grade: "4", code: "CAIB0211", name: "자연어처리개론", credit: "3-3-0" },
  { grade: "4", code: "CAIB0216", name: "강화학습개론", credit: "3-3-0" },
  { grade: "4", code: "CAIB0219", name: "AI융합 캡스톤디자인 (전공필수)", credit: "3-2-2" },
  { grade: "4", code: "CAIB0220", name: "AI하드웨어기초", credit: "3-3-0" },
  { grade: "4", code: "CAIB0222", name: "인공지능시스템", credit: "3-3-0" },
  { grade: "4", code: "CAIB0225", name: "음성인식", credit: "3-3-0" },
  { grade: "4", code: "CAIB0235", name: "딥러닝프로그래밍실습", credit: "3-2-2" },
  { grade: "4", code: "CAIB0239", name: "AI클라우드컴퓨팅", credit: "3-3-0" },
  { grade: "4", code: "CAIB0241", name: "의료영상인공지능", credit: "3-3-0" },
  { grade: "4", code: "CAIB0240", name: "비지도학습", credit: "3-3-0" },
  { grade: "4", code: "CAIB0243", name: "인과추론과AI", credit: "3-3-0" },
  { grade: "4", code: "ELEC0483", name: "센서와액츄에이터", credit: "3-3-0" },
  { grade: "4", code: "ITEC0424", name: "컴퓨터비전", credit: "3-3-0" },
];

export const SEMESTER_CODES: Record<string, string> = {
  "1": "CMBS001400001",
  "2": "CMBS001400002",
  "s": "CMBS001400004",
  "w": "CMBS001400003",
};

export function parseSemester(text: string): { year: string; semCode: string } | null {
  const m = text.trim().match(/^(\d{4})-([12sw])$/i);
  if (!m) return null;
  const semCode = SEMESTER_CODES[m[2].toLowerCase()];
  return { year: m[1], semCode };
}
