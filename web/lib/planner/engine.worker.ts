import { runEngine } from "./engine";
import type { Conditions, EngineGroup } from "./types";

self.onmessage = (e: MessageEvent<{ id: number; groups: EngineGroup[]; cond: Conditions }>) => {
  const { id, groups, cond } = e.data;
  const res = runEngine(groups, cond);
  (self as unknown as Worker).postMessage({ id, ...res });
};
