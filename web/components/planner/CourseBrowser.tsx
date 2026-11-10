"use client";

import { memo, useMemo, useState } from "react";
import { dayPatterns, formatSlots, sectionAllowed, type SectionFilter } from "@/lib/planner/data";
import { CATEGORY_LABEL, type CartItem, type CartMode, type Category, type Conditions, type Course, type RawSection, type Slot } from "@/lib/planner/types";

const CATS: Category[] = ["major", "major2", "gyoyang", "kyoshik", "ilban", "other"];
const TAGS = ["SDG", "인문교양", "KNU미래설계", "원격", "SU평가", "플립드"];
const GRADES = ["1", "2", "3", "4"];
const CAMPUSES = ["산격동", "동인동", "상주"];
const PAGE = 120;

function overlaps(a: Slot[], b: Slot[]) {
  return a.some(([d, s, e]) => b.some(([d2, s2, e2]) => d === d2 && s < e2 && s2 < e));
}

function sectionMeetsConditions(s: RawSection, c: Conditions) {
  return s.slots.every(([d, st, en]) =>
    !c.daysOff.includes(d) && !(c.startAfter && st < c.startAfter) && !(c.endBefore && en > c.endBefore));
}

type Props = {
  courses: Course[];
  cart: CartItem[];
  hasMajor: boolean;
  hasExtra: boolean;
  sectionFilter: SectionFilter;
  onCampusesChange: (c: string[]) => void;
  includeGrad: boolean;
  onIncludeGradChange: (v: boolean) => void;
  conditions: Conditions;
  busySlots: Slot[];
  onSetMode: (code: string, mode: CartMode | null) => void;
  onSection: (code: string, sectionId: string, action: "pin" | "exclude") => void;
};

export default function CourseBrowser(p: Props) {
  const [q, setQ] = useState("");
  const [cats, setCats] = useState<Category[]>(p.hasMajor ? ["major"] : ["gyoyang"]);
  const [grades, setGrades] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [credits, setCredits] = useState<number[]>([]);
  const [onlyFree, setOnlyFree] = useState(false);
  const [more, setMore] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [openCode, setOpenCode] = useState<string | null>(null);

  const cartMap = useMemo(() => new Map(p.cart.map((c) => [c.code, c])), [p.cart]);
  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  const filtered = useMemo(() => {
    const t = q.trim().replace(/\s/g, "").toLowerCase();
    const out = p.courses.filter((c) => {
      if (!p.includeGrad && c.isGrad) return false;
      if (t) {
        const hay = `${c.name}${c.code}${c.dept}${c.sections.map((s) => s.profs.join("")).join("")}`.replace(/\s/g, "").toLowerCase();
        if (!hay.includes(t)) return false;
      } else if (cats.length && !cats.includes(c.category)) return false;
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
    const g = (x: string) => (GRADES.includes(x) ? Number(x) : 9);
    return out.sort((a, b) => g(a.grade) - g(b.grade) || a.name.localeCompare(b.name, "ko"));
  }, [p.courses, p.includeGrad, p.sectionFilter, p.conditions, p.busySlots, q, cats, grades, credits, tags, onlyFree, cartMap]);

  const activeExtra = grades.length + tags.length + credits.length + (p.includeGrad ? 1 : 0);

  return (
    <>
      <div className="pl-browse-head">
        <div className="pl-step-head">
          <h1>어떤 과목을 들을까요?</h1>
          <p>들을 만한 과목을 넉넉히 담아 두세요. 시간이 겹치지 않게 최대한 많이 넣은 시간표를 만들어 드려요.</p>
        </div>
        <div className="pl-search" data-tour="search">
          <input
            className="pl-field"
            placeholder="과목명, 코드, 교수, 학과로 검색"
            value={q}
            onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }}
          />
          <button className="pl-btn" onClick={() => setMore((v) => !v)} aria-expanded={more}>
            필터{activeExtra ? ` ${activeExtra}` : ""}
          </button>
        </div>
        <div className="pl-chips" aria-label="구분" data-tour="cats">
          {CATS.filter((c) => (c === "major" ? p.hasMajor : c === "major2" ? p.hasExtra : true)).map((c) => (
            <button key={c} className="pl-chip" aria-pressed={cats.includes(c)} disabled={!!q.trim()} onClick={() => { setCats(toggle(cats, c)); setLimit(PAGE); }}>
              {CATEGORY_LABEL[c]}
            </button>
          ))}
          {p.busySlots.length > 0 && (
            <button className="pl-chip" aria-pressed={onlyFree} onClick={() => setOnlyFree((v) => !v)} title="지금 고른 시간표의 빈 시간과 조건에 맞는 분반이 있는 과목만">
              빈 시간에 맞는 것만
            </button>
          )}
        </div>
        {more && (
          <div className="pl-filter-more">
            <div>
              <div className="pl-label">학년</div>
              <div className="pl-chips">{GRADES.map((g) => <button key={g} className="pl-chip" aria-pressed={grades.includes(g)} onClick={() => setGrades(toggle(grades, g))}>{g}학년</button>)}</div>
            </div>
            <div>
              <div className="pl-label">학점</div>
              <div className="pl-chips">{[1, 2, 3, 4].map((c) => <button key={c} className="pl-chip" aria-pressed={credits.includes(c)} onClick={() => setCredits(toggle(credits, c))}>{c === 4 ? "4학점+" : `${c}학점`}</button>)}</div>
            </div>
            <div>
              <div className="pl-label">특성</div>
              <div className="pl-chips">{TAGS.map((t) => <button key={t} className="pl-chip" aria-pressed={tags.includes(t)} onClick={() => setTags(toggle(tags, t))}>{t}</button>)}</div>
            </div>
            <div>
              <div className="pl-label">캠퍼스 · 과정</div>
              <div className="pl-chips">
                {CAMPUSES.map((c) => (
                  <button key={c} className="pl-chip" aria-pressed={p.sectionFilter.campuses.includes(c)} onClick={() => {
                    const next = toggle(p.sectionFilter.campuses, c);
                    if (next.length) p.onCampusesChange(next);
                  }}>{c}</button>
                ))}
                <button className="pl-chip" aria-pressed={p.includeGrad} onClick={() => p.onIncludeGradChange(!p.includeGrad)}>대학원 과목 포함</button>
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="pl-scroll">
        <div className="pl-hint" style={{ padding: "10px 24px 4px" }}>{filtered.length.toLocaleString()}과목{q.trim() ? " · 전체에서 검색 중" : ""}</div>
        {filtered.length === 0 && <div className="pl-empty">조건에 맞는 과목이 없어요.<br />구분이나 필터를 바꿔 보세요.</div>}
        {filtered.slice(0, limit).map((c) => (
          <CourseRow
            key={c.code}
            course={c}
            item={cartMap.get(c.code)}
            open={openCode === c.code}
            onToggleOpen={() => setOpenCode(openCode === c.code ? null : c.code)}
            sectionFilter={p.sectionFilter}
            onSetMode={p.onSetMode}
            onSection={p.onSection}
          />
        ))}
        {filtered.length > limit && (
          <div style={{ padding: 12, textAlign: "center" }}>
            <button className="pl-btn" onClick={() => setLimit(limit + PAGE)}>더 보기 ({(filtered.length - limit).toLocaleString()})</button>
          </div>
        )}
      </div>
    </>
  );
}

const CourseRow = memo(function CourseRow({
  course: c,
  item,
  open,
  onToggleOpen,
  sectionFilter,
  onSetMode,
  onSection,
}: {
  course: Course;
  item: CartItem | undefined;
  open: boolean;
  onToggleOpen: () => void;
  sectionFilter: SectionFilter;
  onSetMode: Props["onSetMode"];
  onSection: Props["onSection"];
}) {
  const secs = c.sections.filter((s) => sectionAllowed(s, sectionFilter));
  const days = dayPatterns(secs.map((s) => s.slots)) || "시간 미정";
  const toggle = () => onSetMode(c.code, item ? null : "maybe");

  return (
    <div className="pl-course">
      <div className="pl-course-row">
        <button className="pl-course-main" onClick={onToggleOpen} aria-expanded={open}>
          <div className="pl-course-name">
            {c.name}
            {c.category !== "other" && <span className={`pl-badge${c.category === "major" ? " accent" : ""}`}>{CATEGORY_LABEL[c.category]}</span>}
            {c.tags.filter((t) => t === "SDG" || t === "인문교양").map((t) => <span key={t} className="pl-badge">{t}</span>)}
          </div>
          <div className="pl-course-meta">
            {[c.grade && c.grade !== "*" ? `${c.grade}학년` : "", `${c.credit}학점`, c.dept].filter(Boolean).join(" · ")}
          </div>
          <div className="pl-course-meta">{days} <span className="pl-muted">· 분반 {secs.length}개 {open ? "▴" : "▾"}</span></div>
        </button>
        <div className="pl-add">
          <button className="pl-btn sm" aria-pressed={!!item} onClick={toggle} style={{ minWidth: 64 }}>{item ? "담음 ✓" : "담기"}</button>
        </div>
      </div>
      {open && (
        <div className="pl-sections">
          {secs.map((s) => {
            const pinned = item?.pinned === s.id;
            const excluded = item?.excluded.includes(s.id) ?? false;
            return (
              <div key={s.id} className={`pl-sec${pinned ? " pinned" : ""}${excluded ? " excluded" : ""}`}>
                <div>
                  <div><b>{s.id.split("-")[1]}</b> · {s.profs.join(", ") || "교수 미정"} · {formatSlots(s.slots)}</div>
                  <div className="pl-muted">
                    {[s.room, s.capacity ? `정원 ${s.capacity} · 신청 ${s.applied ?? 0}` : "", s.campus !== "산격동" ? s.campus : "", s.remark].filter(Boolean).join(" · ")}
                  </div>
                </div>
                {item && (
                  <div className="pl-sec-actions">
                    <button className="pl-btn sm" aria-pressed={pinned} onClick={() => onSection(c.code, s.id, "pin")}>{pinned ? "고정됨" : "고정"}</button>
                    <button className="pl-btn sm" onClick={() => onSection(c.code, s.id, "exclude")}>{excluded ? "복원" : "제외"}</button>
                  </div>
                )}
              </div>
            );
          })}
          {!item && <div className="pl-hint">담으면 원하는 분반만 고정하거나, 싫은 분반을 뺄 수 있어요.</div>}
        </div>
      )}
    </div>
  );
});
