"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { MajorInfo } from "@/lib/planner/majors";
import Icon from "./Icon";

const sortMajors = (list: MajorInfo[]) => [...list].sort((a, b) => {
  const aS = a.label.startsWith("["), bS = b.label.startsWith("[");
  if (aS !== bS) return aS ? 1 : -1;
  return a.label.localeCompare(b.label, "ko");
});

export default function MajorPicker({
  options,
  value,
  onChange,
  placeholder = "학과 선택",
  onRemove,
}: {
  options: MajorInfo[];
  value: string | null;
  onChange: (m: string) => void;
  placeholder?: string;
  onRemove?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const sorted = useMemo(() => sortMajors(options), [options]);
  const labelOf = (key: string) => options.find((m) => m.key === key)?.label ?? key;
  const list = useMemo(() => {
    const t = q.replace(/\s/g, "");
    return t ? sorted.filter((m) => m.label.replace(/\s/g, "").includes(t)) : sorted;
  }, [q, sorted]);

  return (
    <div className="pl-pop" ref={ref}>
      <div style={{ display: "flex" }}>
        <button
          type="button"
          className="pl-select"
          style={{ maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "left" }}
          onClick={() => { setOpen((v) => !v); setQ(""); }}
        >
          {value ? labelOf(value) : <span className="pl-muted">{placeholder}</span>}
        </button>
        {onRemove && <button type="button" className="pl-x" aria-label="복수전공 삭제" onClick={onRemove}><Icon name="close" /></button>}
      </div>
      {open && (
        <div className="pl-pop-panel">
          <input autoFocus className="pl-field" placeholder="학과 검색" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="pl-pop-list">
            {list.length === 0 && <div className="pl-empty">찾는 학과가 없어요</div>}
            {list.map((m) => (
              <button key={m.key} type="button" aria-current={m.key === value} onClick={() => { onChange(m.key); setOpen(false); }}>
                {m.label}{m.auto && !m.level && <span className="pl-badge" style={{ marginLeft: 6 }}>신규</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
