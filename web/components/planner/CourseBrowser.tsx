"use client";

import { Fragment, memo, useEffect, useMemo, useState } from "react";
import { track } from "@/lib/analytics";
import { dayPatterns, formatSlots, isFull, sectionAllowed, type SectionFilter } from "@/lib/planner/data";
import { CATEGORY_LABEL, type CartItem, type CartMode, type Category, type Conditions, type Course, type RawSection, type Slot } from "@/lib/planner/types";

const CATS: Category[] = ["major", "major2", "gyoyang", "kyoshik", "ilban", "other"];
const TAGS = ["SDG", "인문교양", "KNU미래설계", "원격", "SU평가", "플립드"];
const GRADES = ["1", "2", "3", "4"];
const CAMPUSES = ["산격동", "동인동", "상주"];
const PAGE = 150;

/** 교과구분(이수구분): 분반마다 다를 수 있어 모아서 보여 줌 (예: 전공필수·전공) */
export const courseTypes = (secs: { type: string }[]) => [...new Set(secs.map((s) => s.type).filter(Boolean))];

type SortCol = "name" | "type" | "grade" | "credit" | "dept";
type Sort = { col: SortCol; dir: 1 | -1 } | null;

function overlaps(a: Slot[], b: Slot[]) {
  return a.some(([d, s, e]) => b.some(([d2, s2, e2]) => d === d2 && s < e2 && s2 < e));
}

function sectionMeetsConditions(s: RawSection, c: Conditions) {
  return s.slots.every(([d]) => !c.daysOff.includes(d));
}

/** 개설학과가 내 학과인지 (학과명 앞부분 기준: "전자공학부 인공지능전공" ↔ "전자공학부") */
export function isMyDept(dept: string, labels: string[]) {
  const d = dept.replace(/\s/g, "");
  return labels.some((l) => {
    const head = l.replace(/^\[[^\]]+\]/, "").split(/[-\s(]/)[0];
    const flat = l.replace(/\s/g, "");
    return !!d && (flat.includes(d) || d.includes(head));
  });
}

const gradeNum = (x: string) => (GRADES.includes(x) ? Number(x) : 9);

/** 표의 비고 칸: 분반 중 하나라도 해당하면 "SU평가 포함"처럼 짧게. 자세한 비고는 펼쳤을 때 분반별로 보여 줌 */
const NOTE_FLAGS: [RegExp, string][] = [
  [/SU평가/, "SU평가"],
  [/원격/, "원격"],
  [/플립드/, "플립드"],
  [/\(영어\)|영어강의/, "영어강의"],
  [/신규 교원|신임/, "신임 교수"],
  [/외국인|유학생/, "외국인 대상"],
];
function noteFlags(secs: RawSection[]): string[] {
  const text = secs.map((s) => `${s.remark} ${s.tags.join(" ")}`).join(" | ");
  return NOTE_FLAGS.filter(([re]) => re.test(text)).map(([, label]) => `${label} 포함`);
}

type Props = {
  courses: Course[];
  /** 내 학과 이름들 (타학과 개설 표시용) */
  myLabels: string[];
  cart: CartItem[];
  hasMajor: boolean;
  hasExtra: boolean;
  sectionFilter: SectionFilter;
  onCampusesChange: (c: string[]) => void;
  onOnlyOpenChange: (v: boolean) => void;
  /** 1단계 학부/대학원 탭을 따름 (2단계 "대학원 포함" 필터는 2026-11-11 단순화로 없앰) */
  includeGrad: boolean;
  conditions: Conditions;
  busySlots: Slot[];
  onSetMode: (code: string, mode: CartMode | null) => void;
  onSection: (code: string, sectionId: string, action: "pin" | "exclude") => void;
};

export default function CourseBrowser(p: Props) {
  const tabs = CATS.filter((c) => (c === "major" ? p.hasMajor : c === "major2" ? p.hasExtra : true));
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<Category>(tabs[0]);
  const [grades, setGrades] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [credits, setCredits] = useState<number[]>([]);
  const [onlyFree, setOnlyFree] = useState(false);
  // 넓은 화면은 필터를 펼쳐 두고, 휴대폰은 과목 표가 먼저 보이게 접어 둔다
  // 필터는 처음엔 접어 두고 "필터 N" 버튼으로 (2026-11-11 단순화, 넓은 화면 포함)
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [openCode, setOpenCode] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>(null);

  const cartMap = useMemo(() => new Map(p.cart.map((c) => [c.code, c])), [p.cart]);
  const toggle = <T,>(arr: T[], v: T) => {
    track("filter_toggled", { value: String(v), on: !arr.includes(v) });
    return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
  };
  const searching = !!q.trim();
  // 검색어는 입력이 멈춘 뒤 한 번만 기록
  useEffect(() => {
    const t = q.trim();
    if (!t) return;
    const id = setTimeout(() => track("search", { q: t }), 1200);
    return () => clearTimeout(id);
  }, [q]);

  /* 탭과 무관한 필터를 통과한 과목 (탭별 개수 표시용) */
  const base = useMemo(() => {
    const t = q.trim().replace(/\s/g, "").toLowerCase();
    return p.courses.filter((c) => {
      if (!p.includeGrad && c.isGrad) return false;
      if (t) {
        const hay = `${c.name}${c.code}${c.dept}${c.sections.map((s) => s.profs.join("")).join("")}`.replace(/\s/g, "").toLowerCase();
        if (!hay.includes(t)) return false;
      }
      if (grades.length && !grades.includes(c.grade)) return false;
      if (credits.length && !credits.includes(c.credit >= 4 ? 4 : c.credit)) return false;
      if (tags.length && !tags.every((tg) => c.tags.includes(tg))) return false;
      const secs = c.sections.filter((s) => sectionAllowed(s, p.sectionFilter));
      if (!secs.length) return false;
      if (onlyFree) {
        if (cartMap.has(c.code)) return false;
        if (!secs.some((s) => s.slots.length && sectionMeetsConditions(s, p.conditions) && !overlaps(s.slots, p.busySlots))) return false;
      }
      return true;
    });
  }, [p.courses, p.includeGrad, p.sectionFilter, p.conditions, p.busySlots, q, grades, credits, tags, onlyFree, cartMap]);

  const counts = useMemo(() => {
    const m = new Map<Category, number>();
    for (const c of base) m.set(c.category, (m.get(c.category) ?? 0) + 1);
    return m;
  }, [base]);

  const filtered = useMemo(() => {
    const out = searching ? [...base] : base.filter((c) => c.category === cat);
    const byDefault = (a: Course, b: Course) => gradeNum(a.grade) - gradeNum(b.grade) || a.name.localeCompare(b.name, "ko");
    if (!sort) return out.sort(byDefault);
    const val = (c: Course) => (sort.col === "grade" ? gradeNum(c.grade) : sort.col === "credit" ? c.credit : sort.col === "dept" ? c.dept : sort.col === "type" ? courseTypes(c.sections).join(", ") : c.name);
    return out.sort((a, b) => {
      const va = val(a), vb = val(b);
      const cmp = typeof va === "number" ? va - (vb as number) : String(va).localeCompare(String(vb), "ko");
      return cmp * sort.dir || byDefault(a, b);
    });
  }, [base, cat, searching, sort]);

  const activeExtra = grades.length + tags.length + credits.length + (p.sectionFilter.onlyOpen ? 1 : 0);
  const sortBy = (col: SortCol) =>
    setSort((s) => (!s || s.col !== col ? { col, dir: 1 } : s.dir === 1 ? { col, dir: -1 } : null));
  const th = (col: SortCol, label: string, className = "") => (
    <th className={className} aria-sort={sort?.col === col ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
      <button className="pl-th-sort" onClick={() => sortBy(col)}>
        {label}<span aria-hidden>{sort?.col === col ? (sort.dir === 1 ? " ↑" : " ↓") : ""}</span>
      </button>
    </th>
  );

  return (
    <>
      <div className="pl-browse-head">
        <div className="pl-step-head">
          <h1>어떤 과목을 들을까요?</h1>
          <p>들을 만한 과목을 넉넉히 담아 두세요. 겹치지 않게 최대한 많이 넣은 시간표를 만들어 드려요.</p>
        </div>

        <div className="pl-tabs" role="tablist" aria-label="구분" data-tour="cats">
          {tabs.map((c) => (
            <button
              key={c}
              role="tab"
              className={`pl-tab cat-${c}`}
              aria-selected={!searching && cat === c}
              onClick={() => { setCat(c); setQ(""); setLimit(PAGE); setOpenCode(null); track("tab_changed", { tab: c }); }}
            >
              {CATEGORY_LABEL[c]} <span className="pl-tab-count">{(counts.get(c) ?? 0).toLocaleString()}</span>
            </button>
          ))}
        </div>

        <div className="pl-search" data-tour="search">
          <input
            className="pl-field"
            placeholder="과목명, 코드, 교수, 학과로 전체 검색"
            value={q}
            onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }}
          />
          <button className="pl-btn" onClick={() => setFiltersOpen((v) => !v)} aria-expanded={filtersOpen}>
            {filtersOpen ? "필터 접기 ▴" : `필터${activeExtra ? ` ${activeExtra}개 켜짐` : ""} ▾`}
          </button>
        </div>

        {filtersOpen && (
          <div className="pl-filter-grid">
            <div className="pl-filter-line">
              <span className="pl-filter-name">학년</span>
              <div className="pl-chips">{GRADES.map((g) => <button key={g} className="pl-chip" aria-pressed={grades.includes(g)} onClick={() => setGrades(toggle(grades, g))}>{g}학년</button>)}</div>
            </div>
            <div className="pl-filter-line">
              <span className="pl-filter-name">학점</span>
              <div className="pl-chips">{[1, 2, 3, 4].map((c) => <button key={c} className="pl-chip" aria-pressed={credits.includes(c)} onClick={() => setCredits(toggle(credits, c))}>{c === 4 ? "4+" : c}학점</button>)}</div>
            </div>
            <div className="pl-filter-line">
              <span className="pl-filter-name">특성</span>
              <div className="pl-chips">{TAGS.map((t) => <button key={t} className="pl-chip" aria-pressed={tags.includes(t)} onClick={() => setTags(toggle(tags, t))}>{t}</button>)}</div>
            </div>
            <div className="pl-filter-line">
              <span className="pl-filter-name">캠퍼스</span>
              <div className="pl-chips">
                {CAMPUSES.map((c) => (
                  <button key={c} className="pl-chip" aria-pressed={p.sectionFilter.campuses.includes(c)} onClick={() => {
                    const next = toggle(p.sectionFilter.campuses, c);
                    if (next.length) p.onCampusesChange(next);
                  }}>{c}</button>
                ))}
              </div>
            </div>
            <div className="pl-filter-line">
              <span className="pl-filter-name">자리</span>
              <div className="pl-chips">
                <button className="pl-chip" aria-pressed={p.sectionFilter.onlyOpen} onClick={() => p.onOnlyOpenChange(!p.sectionFilter.onlyOpen)} title="신청 인원이 정원보다 적은 분반만 (수집 시점 기준)">
                  정원 남은 분반만
                </button>
                {p.busySlots.length > 0 && (
                  <button className="pl-chip" aria-pressed={onlyFree} onClick={() => setOnlyFree((v) => !v)} title="지금 고른 시간표의 빈 시간에 맞는 분반이 있는 과목만">
                    내 시간표 빈 시간에 맞는 것만
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="pl-scroll">
        <div className="pl-count">
          {searching ? <>전체에서 <b>{filtered.length.toLocaleString()}</b>과목 찾음</> : <><b>{filtered.length.toLocaleString()}</b>과목</>}
          <span className="pl-muted"> | 과목을 누르면 분반별 교수·시간·정원이 펼쳐져요</span>
        </div>
        {filtered.length === 0 ? (
          <div className="pl-empty">조건에 맞는 과목이 없어요.<br />다른 탭이나 필터를 바꿔 보세요.</div>
        ) : (
          <table className="pl-table">
            <thead>
              <tr>
                <th className="c-add"><span className="pl-sr">담기</span></th>
                {th("name", "교과목명")}
                {th("type", "교과구분", "c-type")}
                {th("grade", "학년", "c-num")}
                {th("credit", "학점", "c-num")}
                <th className="c-prof">교수</th>
                <th className="c-time">강의시간</th>
                <th className="c-chev"><span className="pl-sr">펼치기</span></th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, limit).map((c) => (
                <CourseRow
                  key={c.code}
                  course={c}
                  item={cartMap.get(c.code)}
                  open={openCode === c.code}
                  showCategory={searching}
                  otherDept={(c.category === "major" || c.category === "major2") && !isMyDept(c.dept, p.myLabels)}
                  onToggleOpen={() => setOpenCode(openCode === c.code ? null : c.code)}
                  sectionFilter={p.sectionFilter}
                  onSetMode={p.onSetMode}
                  onSection={p.onSection}
                />
              ))}
            </tbody>
          </table>
        )}
        {filtered.length > limit && (
          <div style={{ padding: 16, textAlign: "center" }}>
            <button className="pl-btn" onClick={() => setLimit(limit + PAGE)}>더 보기 ({(filtered.length - limit).toLocaleString()})</button>
          </div>
        )}
      </div>
    </>
  );
}

export const CourseRow = memo(function CourseRow({
  course: c,
  item,
  open,
  showCategory,
  otherDept,
  onToggleOpen,
  sectionFilter,
  onSetMode,
  onSection,
}: {
  course: Course;
  item: CartItem | undefined;
  open: boolean;
  showCategory: boolean;
  otherDept: boolean;
  onToggleOpen: () => void;
  sectionFilter: SectionFilter;
  onSetMode: Props["onSetMode"];
  onSection: Props["onSection"];
}) {
  const secs = c.sections.filter((s) => sectionAllowed(s, sectionFilter));
  const timeKeys = new Set(secs.map((s) => JSON.stringify(s.slots)));
  const time = timeKeys.size === 1 ? formatSlots(secs[0].slots) : dayPatterns(secs.map((s) => s.slots)) || "시간 미정";
  const profs = [...new Set(secs.flatMap((s) => s.profs))];
  const profText = profs.length === 0 ? "-" : profs.length <= 2 ? profs.join(", ") : `${profs.slice(0, 2).join(", ")} 외 ${profs.length - 2}`;
  const flags = noteFlags(secs);
  const types = courseTypes(secs.length ? secs : c.sections);

  return (
    <Fragment>
      <tr className={`pl-tr${item ? " in-cart" : ""}${open ? " open" : ""}`} onClick={onToggleOpen}
        tabIndex={0} aria-expanded={open} aria-label={`${c.name} 분반 ${open ? "접기" : "펼치기"}`}
        onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) { e.preventDefault(); onToggleOpen(); } }}>
        <td className="c-add" onClick={(e) => e.stopPropagation()}>
          <button className="pl-add-btn" aria-pressed={!!item} aria-label={item ? `${c.name} 빼기` : `${c.name} 담기`} title={item ? "담기 취소" : "담기"} onClick={() => onSetMode(c.code, item ? null : "maybe")}>
            {item ? "✓" : "+"}
          </button>
        </td>
        <td className="c-name">
          <span className="pl-cname">{c.name}</span>
          {showCategory && c.category !== "other" && <span className={`pl-badge cat-${c.category}`}>{CATEGORY_LABEL[c.category]}</span>}
          {otherDept && <span className="pl-badge pl-badge-other" title="우리 과 이수체계 과목이에요. 다른 학과에서 연 분반도 포함돼 있어요">타학과 개설 포함</span>}
          {c.tags.filter((t) => t === "SDG" || t === "인문교양").map((t) => <span key={t} className="pl-badge">{t}</span>)}
          <span className="pl-mobile-meta">{[types.join(", "), c.grade && c.grade !== "*" ? `${c.grade}학년` : "", `${c.credit}학점`, time].filter(Boolean).join(" | ")}</span>
        </td>
        <td className="c-type">{types.join(", ") || "-"}</td>
        <td className="c-num">{c.grade && c.grade !== "*" ? c.grade : "-"}</td>
        <td className="c-num">{c.credit}</td>
        <td className="c-prof">{profText}</td>
        <td className="c-time">{time}</td>
        <td className="c-chev" aria-hidden><span className={open ? "up" : ""}>⌄</span></td>
      </tr>
      {open && (
        <tr className="pl-tr-sub">
          <td colSpan={8}>
            {/* 표에서 뺀 개설학과·분반 수·비고는 펼친 줄 머리에 (2026-11-11 단순화: 표 11칸 → 8칸) */}
            <div className="pl-sec-head">
              <span>{c.dept}</span>
              <span>분반 {secs.length}개</span>
              {flags.map((f) => <span key={f} className="pl-flag">{f}</span>)}
            </div>
            <div className="pl-sections">
              {secs.map((s) => {
                const pinned = item?.pinned === s.id;
                const excluded = item?.excluded.includes(s.id) ?? false;
                const full = isFull(s);
                return (
                  <div key={s.id} className={`pl-sec${pinned ? " pinned" : ""}${excluded ? " excluded" : ""}`}>
                    <span className="pl-sec-no">{s.id.split("-")[1]}</span>
                    <span className="pl-sec-prof">{s.profs.join(", ") || "교수 미정"}</span>
                    <span className="pl-sec-time">{formatSlots(s.slots)}</span>
                    <span className="pl-sec-room">{s.room || "-"}</span>
                    <span className={`pl-sec-cap${full ? " full" : ""}`}>{s.capacity ? `${s.applied ?? 0}/${s.capacity}명${full ? " 마감" : ""}` : ""}</span>
                    <span className="pl-sec-actions">
                      <button className="pl-btn sm" aria-pressed={pinned} onClick={() => onSection(c.code, s.id, "pin")}>
                        {pinned ? "고정 해제" : "이 분반으로 고정"}
                      </button>
                      <button className="pl-btn sm" aria-pressed={excluded} onClick={() => onSection(c.code, s.id, "exclude")}>
                        {excluded ? "제외 취소" : "이 분반 제외"}
                      </button>
                    </span>
                    {(s.campus !== "산격동" || s.remark) && (
                      <span className="pl-sec-note">{[s.campus !== "산격동" ? s.campus : "", s.remark].filter(Boolean).join(" | ")}</span>
                    )}
                  </div>
                );
              })}
              <div className="pl-hint">‘이 분반으로 고정’하면 이 과목은 시간표에 <b>반드시 이 분반으로</b> 들어가고, ‘이 분반 제외’하면 이 분반은 빼고 만들어요. 아직 안 담은 과목이면 자동으로 담겨요.</div>
            </div>
          </td>
        </tr>
      )}
    </Fragment>
  );
});
