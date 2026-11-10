"use client";

import { dayCount, hourRange, type TimetableItem } from "@/lib/planner/exportImage";
import { DAY_NAMES, mergeSlots } from "@/lib/planner/data";

const LABEL_W = 34;

export default function Timetable({ items }: { items: TimetableItem[] }) {
  const [h0, h1] = hourRange(items);
  const days = dayCount(items);
  const cols = `${LABEL_W}px repeat(${days}, minmax(56px, 1fr))`;
  const hours = Array.from({ length: h1 - h0 }, (_, i) => h0 + i);
  const noTime = items.filter((i) => i.slots.length === 0);

  return (
    <div>
      <div className="pl-tt">
        <div className="pl-tt-head" style={{ gridTemplateColumns: cols }}>
          <div />
          {Array.from({ length: days }, (_, d) => <div key={d}>{DAY_NAMES[d]}</div>)}
        </div>
        <div className="pl-tt-body" style={{ gridTemplateColumns: cols, height: `calc(var(--hour) * ${h1 - h0})` }}>
          <div style={{ position: "relative" }}>
            {hours.map((h, i) => (
              <div key={h} className="pl-tt-hour" style={{ position: "absolute", right: 0, top: `calc(var(--hour) * ${i})` }}>{h}</div>
            ))}
          </div>
          {Array.from({ length: days }, (_, d) => (
            <div key={d} className="pl-tt-col">
              {hours.map((h, i) => <div key={h} className="pl-tt-line" style={{ top: `calc(var(--hour) * ${i})` }} />)}
              {items.flatMap((it) =>
                mergeSlots(it.slots)
                  .filter(([day]) => day === d)
                  .map(([, s, e]) => (
                    <div
                      key={`${it.code}-${s}`}
                      className="pl-tt-block"
                      title={`${it.name}\n${it.prof}\n${it.room}`}
                      style={{
                        background: it.color,
                        top: `calc(var(--hour) * ${(s - h0 * 60) / 60} + 1px)`,
                        height: `calc(var(--hour) * ${(e - s) / 60} - 2px)`,
                        left: 2,
                        right: 2,
                      }}
                    >
                      <strong>{it.name}</strong>
                      {it.prof && <span>{it.prof}</span>}
                      {it.room && <span>{it.room}</span>}
                    </div>
                  )),
              )}
            </div>
          ))}
        </div>
      </div>
      {noTime.length > 0 && (
        <div className="pl-notime">
          시간 미정 · {noTime.map((i) => `${i.name}(${i.credit})`).join(", ")}
        </div>
      )}
    </div>
  );
}
