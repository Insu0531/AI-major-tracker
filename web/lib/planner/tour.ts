import type { TourStep } from "@/components/GuideTour";

/** 사용법 투어 문구 (2단계 · 3단계). 화면이 바뀌면 같이 고칠 것 */
export const TOUR_2: TourStep[] = [
  { selector: '[data-tour="search"]', title: "과목 찾기", body: "과목명·코드·교수·학과로 검색하거나, '필터' 버튼으로 학년·학점·SDG·캠퍼스 등을 고를 수 있어요." },
  { selector: '[data-tour="cats"]', title: "구분", body: "내 전공(학과·학번 이수체계), 교양, 교직 등으로 나눠 볼 수 있어요." },
  { selector: ".pl-course", title: "담기", body: "들을 만한 과목을 넉넉히 담으세요. 과목을 누르면 분반이 펼쳐지고, 원하는 분반만 고정하거나 싫은 분반을 뺄 수 있어요." },
  { selector: '[data-tour="next"]', title: "시간표 보기", body: "담은 과목으로 시간이 겹치지 않게 최대한 많이 넣은 시간표를 만들어 드려요." },
];
export const TOUR_3: TourStep[] = [
  { selector: '[data-tour="must"]', title: "꼭 넣을 과목", body: "반드시 들어가야 하는 과목을 고르면 그 과목이 들어간 시간표만 보여 줘요." },
  { selector: '[data-tour="sort"]', title: "정렬과 조건", body: "학점 높은 순·공강 많은 순으로 정렬하고, 아래에서 시간대·공강 요일·학점·교수님을 정할 수 있어요." },
  { selector: '[data-tour="actions"]', title: "저장과 공유", body: "이미지로 저장하거나 카톡으로 공유하고, 더보기에서 보관함 저장·수강신청 코드를 볼 수 있어요. ← → 키로 시간표를 넘길 수 있어요." },
  { selector: '[data-tour="recs"]', title: "맞춤 추천", body: "지금 시간표 빈 시간에 들어가는 전공·교양을 추천해 드려요. 검색해서 담을 수도 있어요." },
];
