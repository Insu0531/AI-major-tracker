"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MAJOR_LABELS, type Major } from "@/lib/courses";

const SORTED = (Object.entries(MAJOR_LABELS) as [Major, string][]).sort(([, a], [, b]) => {
  const aS = a.startsWith("["), bS = b.startsWith("[");
  if (aS !== bS) return aS ? 1 : -1;
  return a.localeCompare(b, "ko");
});

export default function MajorPicker({
  value,
  onChange,
  placeholder = "학과 선택",
  onRemove,
}: {
  value: Major | null;
  onChange: (m: Major) => void;
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

  const list = useMemo(() => {
    const t = q.replace(/\s/g, "");
    return t ? SORTED.filter(([, l]) => l.replace(/\s/g, "").includes(t)) : SORTED;
  }, [q]);

  return (
    <div className="pl-pop" ref={ref}>
      <div style={{ display: "flex" }}>
        <button
          type="button"
          className="pl-select"
          style={{ maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "left" }}
          onClick={() => { setOpen((v) => !v); setQ(""); }}
        >
          {value ? MAJOR_LABELS[value] : <span className="pl-muted">{placeholder}</span>}
        </button>
        {onRemove && <button type="button" className="pl-x" aria-label="복수전공 삭제" onClick={onRemove}>×</button>}
      </div>
      {open && (
        <div className="pl-pop-panel">
          <input autoFocus className="pl-field" placeholder="학과 검색" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="pl-pop-list">
            {list.length === 0 && <div className="pl-empty">찾는 학과가 없어요</div>}
            {list.map(([key, label]) => (
              <button key={key} type="button" aria-current={key === value} onClick={() => { onChange(key); setOpen(false); }}>
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
