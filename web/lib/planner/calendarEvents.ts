// 학사일정 데이터 (구버전 AcademicCalendarTab에서 옮김). 새 학기 일정은 여기에 추가
export type EvColor = "indigo" | "red" | "green" | "amber" | "purple";
export type CalEvent = { date: string; endDate?: string; label: string; color?: EvColor };

// ── 학사일정 데이터 ──────────────────────────────────────────
// 단일 일정:  { date: "2026-03-03", label: "개강", color: "amber" }
// 기간 일정:  { date: "2026-04-16", endDate: "2026-04-22", label: "중간고사 기간", color: "purple" }
// 색상: indigo(행정/대학원·기본) | red(공휴일) | green(수강) | amber(학기운영) | purple(시험)
export const EVENTS: CalEvent[] = [
  // 1월
  { date: "2026-01-01", label: "신정", color: "red" },
  { date: "2026-01-02", label: "시무식" },
  { date: "2026-01-02", label: "복학원 접수시작" },
  { date: "2026-01-07", endDate: "2026-01-08", label: "[대학원] 완성논문 접수" },
  { date: "2026-01-20", endDate: "2026-01-22", label: "1학기 수강꾸러미 신청", color: "green" },

  // 2월
  { date: "2026-02-03", endDate: "2026-02-05", label: "2026학년도 신입생 등록" },
  { date: "2026-02-10", endDate: "2026-02-12", label: "1학기 수강신청", color: "green" },
  { date: "2026-02-13", label: "휴학원 접수시작" },
  { date: "2026-02-16", endDate: "2026-02-18", label: "설날연휴", color: "red" },
  { date: "2026-02-20", label: "2025학년도 전기학위수여식" },
  { date: "2026-02-23", endDate: "2026-02-26", label: "2026학년도 1학기 재학생 등록" },
  { date: "2026-02-23", endDate: "2026-02-25", label: "[대학원] 수료생 등록 신청" },
  { date: "2026-02-25", endDate: "2026-02-27", label: "[대학원] 종합시험 원서 접수" },

  // 3월
  { date: "2026-03-01", label: "삼일절", color: "red" },
  { date: "2026-03-01", label: "1학기 개시일", color: "amber" },
  { date: "2026-03-02", label: "대체공휴일", color: "red" },
  { date: "2026-03-02", endDate: "2026-03-03", label: "[대학원] 종합시험 시행계획 보고" },
  { date: "2026-03-02", endDate: "2026-03-06", label: "[대학원] 논문지도교수 위촉 보고" },
  { date: "2026-03-03", label: "개강", color: "amber" },
  { date: "2026-03-04", endDate: "2026-03-09", label: "1학기 수강변경", color: "green" },
  { date: "2026-03-04", endDate: "2026-03-10", label: "[대학원] 종합시험 시행" },
  { date: "2026-03-09", endDate: "2026-03-10", label: "[대학원] 수료생 등록금 납부" },
  { date: "2026-03-12", endDate: "2026-03-13", label: "[대학원] 종합시험 결과 보고" },
  { date: "2026-03-16", endDate: "2026-03-18", label: "[대학원] 학위논문 제출예정자 신청" },
  { date: "2026-03-17", endDate: "2026-03-19", label: "1학기 수강정정", color: "green" },
  { date: "2026-03-23", label: "복학원 접수종료" },
  { date: "2026-03-27", label: "수업일수 1/4", color: "amber" },

  // 4월
  { date: "2026-04-01", endDate: "2026-04-03", label: "[대학원] 논문심사위원 추천" },
  { date: "2026-04-08", endDate: "2026-04-10", label: "[대학원] 심사용 논문 접수" },
  { date: "2026-04-13", endDate: "2026-04-14", label: "[대학원] 논문 접수 결과 보고" },
  { date: "2026-04-15", endDate: "2026-04-16", label: "[대학원] 논문심사료 납부" },
  { date: "2026-04-16", endDate: "2026-04-22", label: "중간고사 기간", color: "purple" },
  { date: "2026-04-23", label: "수업일수 2/4", color: "amber" },
  { date: "2026-04-23", label: "일반휴학원 접수종료" },
  { date: "2026-04-23", label: "[대학원] 논문심사위원 위촉 승인" },
  { date: "2026-04-27", label: "[대학원] 학위논문 심사 시작" },

  // 5월
  { date: "2026-05-01", label: "근로자의 날", color: "red" },
  { date: "2026-05-05", label: "어린이날", color: "red" },
  { date: "2026-05-22", label: "수업일수 3/4", color: "amber" },
  { date: "2026-05-22", label: "육아·질병·창업휴학원 접수종료" },
  { date: "2026-05-25", label: "석가탄신일 대체공휴일", color: "red" },
  { date: "2026-05-28", label: "개교 80주년 기념일", color: "red" },

  // 6월
  { date: "2026-06-01", endDate: "2026-06-05", label: "[대학원] 학위논문 심사 종료" },
  { date: "2026-06-03", label: "제9회 지방선거", color: "red" },
  { date: "2026-06-06", label: "현충일", color: "red" },
  { date: "2026-06-08", endDate: "2026-06-09", label: "[대학원] 논문 심사 결과 보고" },
  { date: "2026-06-09", endDate: "2026-06-15", label: "보강기간", color: "amber" },
  { date: "2026-06-16", endDate: "2026-06-22", label: "기말고사 기간", color: "purple" },
  { date: "2026-06-22", endDate: "2026-06-29", label: "[대학원] 원문파일 접수" },
  { date: "2026-06-23", label: "하계방학", color: "amber" },
  { date: "2026-06-24", label: "여름계절수업 개강", color: "amber" },

  // 7월
  { date: "2026-07-01", label: "복학원 접수시작" },
  { date: "2026-07-14", label: "2학기 시간표 공개", color: "green"},
  { date: "2026-07-17", label: "제헌절", color: "red" },
  { date: "2026-07-22", endDate: "2026-07-24", label: "2학기 수강꾸러미 신청", color: "green" },

  // 8월
  { date: "2026-08-11", endDate: "2026-08-13", label: "2학기 수강신청", color: "green" },
  { date: "2026-08-17", label: "광복절 대체공휴일", color: "red" },
  { date: "2026-08-17", endDate: "2026-08-19", label: "[대학원] 수료생 등록 신청" },
  { date: "2026-08-18", label: "휴학원 접수시작" },
  { date: "2026-08-19", endDate: "2026-08-21", label: "[대학원] 종합시험 원서 접수" },
  { date: "2026-08-21", label: "2025학년도 후기 학위수여식" },
  { date: "2026-08-24", endDate: "2026-08-27", label: "2026학년도 2학기 재학생 등록" },
  { date: "2026-08-24", endDate: "2026-08-25", label: "[대학원] 종합시험 시행계획 보고" },
  { date: "2026-08-26", endDate: "2026-09-01", label: "[대학원] 종합시험 시행" },

  // 9월
  { date: "2026-09-01", label: "2학기 개시일", color: "amber" },
  { date: "2026-09-01", label: "개강", color: "amber" },
  { date: "2026-09-01", endDate: "2026-09-04", label: "[대학원] 논문지도교수 위촉 보고" },
  { date: "2026-09-02", endDate: "2026-09-07", label: "2학기 수강변경", color: "green" },
  { date: "2026-09-02", endDate: "2026-09-03", label: "[대학원] 수료생 등록금 납부" },
  { date: "2026-09-03", endDate: "2026-09-04", label: "[대학원] 종합시험 결과 보고" },
  { date: "2026-09-07", endDate: "2026-09-11", label: "2027학년도 대학 수시모집 원서접수" },
  { date: "2026-09-09", endDate: "2026-09-11", label: "[대학원] 학위논문 제출예정자 신청" },
  { date: "2026-09-15", endDate: "2026-09-17", label: "2학기 수강정정", color: "green" },
  { date: "2026-09-21", label: "복학원 접수종료" },
  { date: "2026-09-21", endDate: "2026-09-23", label: "[대학원] 논문심사위원 추천" },
  { date: "2026-09-24", endDate: "2026-09-27", label: "추석연휴", color: "red" },
  { date: "2026-09-29", label: "수업일수 1/4", color: "amber" },
  { date: "2026-09-30", endDate: "2026-10-02", label: "[대학원] 심사용 논문 접수" },

  // 10월
  { date: "2026-10-05", label: "개천절 대체공휴일", color: "red" },
  { date: "2026-10-06", endDate: "2026-10-07", label: "[대학원] 논문 접수 결과 보고" },
  { date: "2026-10-09", label: "한글날", color: "red" },
  { date: "2026-10-14", endDate: "2026-10-15", label: "[대학원] 논문심사료 납부" },
  { date: "2026-10-15", label: "[대학원] 논문심사위원 위촉 승인" },
  { date: "2026-10-19", label: "[대학원] 학위논문 심사 시작" },
  { date: "2026-10-21", endDate: "2026-10-27", label: "중간고사 기간", color: "purple" },
  { date: "2026-10-28", label: "수업일수 2/4", color: "amber" },
  { date: "2026-10-28", label: "일반휴학원 접수종료" },

  // 11월
  { date: "2026-11-24", label: "수업일수 3/4", color: "amber" },
  { date: "2026-11-24", label: "육아·질병·창업휴학원 접수종료" },

  // 12월
  { date: "2026-12-08", endDate: "2026-12-11", label: "보강기간", color: "amber" },
  { date: "2026-12-11", label: "[대학원] 학위논문 심사 종료" },
  { date: "2026-12-14", endDate: "2026-12-18", label: "기말고사 기간", color: "purple" },
  { date: "2026-12-14", endDate: "2026-12-15", label: "[대학원] 논문 심사 결과 보고" },
  { date: "2026-12-21", label: "동계방학", color: "amber" },
  { date: "2026-12-22", label: "겨울계절 수업개강", color: "amber" },
  { date: "2026-12-25", label: "성탄절", color: "red" },
  { date: "2026-12-28", endDate: "2027-01-05", label: "[대학원] 원문파일 접수" },
  { date: "2026-12-31", label: "종무식" },
];
