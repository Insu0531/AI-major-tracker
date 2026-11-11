"use client";

import { useCallback, useEffect, useState } from "react";
import { acceptInvite, getFriends, getFriendTimetable, getProfile, inviteLink, regenerateInvite, removeFriend, type Friend, type Profile } from "@/lib/account";
import { track } from "@/lib/analytics";
import type { TimetableItem } from "@/lib/planner/exportImage";
import { semLabel } from "@/lib/planner/semester";
import Timetable from "./Timetable";
import Icon from "./Icon";

/** 친구 창: 내 초대 링크 · 코드로 친구 추가 · 친구 목록 · 친구의 대표 시간표 */
export default function FriendsPanel({ sems, defaultSem, flash }: { sems: string[]; defaultSem: string; flash: (m: string) => void }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [friends, setFriends] = useState<Friend[] | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState<Friend | null>(null);
  const [sem, setSem] = useState(defaultSem);
  const [tt, setTt] = useState<{ name: string; items: TimetableItem[] } | null | "loading">("loading");

  const reload = useCallback(async () => {
    const [p, f] = await Promise.all([getProfile(), getFriends()]);
    setProfile(p);
    setFriends(f);
  }, []);
  useEffect(() => {
    let alive = true;
    Promise.all([getProfile(), getFriends()])
      .then(([p, f]) => { if (alive) { setProfile(p); setFriends(f); } })
      .catch((e: Error) => flash(e.message));
    return () => { alive = false; };
  }, [flash]);

  useEffect(() => {
    if (!viewing) return;
    let alive = true;
    getFriendTimetable(viewing.friend_id, sem)
      .then((r) => { if (alive) setTt(r); })
      .catch(() => { if (alive) setTt(null); });
    return () => { alive = false; };
  }, [viewing, sem]);

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); flash("복사했어요"); } catch { flash("복사에 실패했어요"); }
  };

  const add = async () => {
    if (!code.trim()) return;
    setBusy(true);
    try {
      const name = await acceptInvite(code.trim());
      flash(`${name}님과 친구가 됐어요`);
      track("friend_added", { via: "code" });
      setCode("");
      await reload();
    } catch (e) {
      flash((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (viewing) {
    return (
      <div className="pl-modal-body">
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <button className="pl-btn sm" onClick={() => { setViewing(null); setTt("loading"); }}>← 친구 목록</button>
          <b style={{ flex: 1 }}>{viewing.display_name}</b>
          <select className="pl-select" value={sem} onChange={(e) => { setSem(e.target.value); setTt("loading"); }} aria-label="학기">
            {sems.map((s) => <option key={s} value={s}>{semLabel(s)}</option>)}
          </select>
        </div>
        {tt === "loading" ? (
          <div className="pl-empty">불러오는 중…</div>
        ) : tt ? (
          <>
            <div className="pl-hint">{tt.name} | {tt.items.reduce((s, i) => s + i.credit, 0)}학점 | 과목명·시간·교수님만 보여요</div>
            <Timetable items={tt.items} />
          </>
        ) : (
          <div className="pl-empty">{viewing.display_name}님은 {semLabel(sem)} 대표 시간표를 아직 정하지 않았어요.</div>
        )}
        <button className="pl-link" style={{ alignSelf: "flex-start" }} onClick={async () => {
          if (!window.confirm(`${viewing.display_name}님을 친구에서 삭제할까요? 서로의 시간표를 더 볼 수 없어요.`)) return;
          await removeFriend(viewing.friend_id);
          track("friend_removed");
          setViewing(null);
          await reload();
        }}>친구 삭제</button>
      </div>
    );
  }

  return (
    <div className="pl-modal-body">
      <div className="pl-friend-invite">
        <div className="pl-label">내 초대 링크</div>
        <div className="pl-hint" style={{ marginBottom: 8 }}>친구에게 보내면, 친구가 로그인하는 순간 서로 친구가 돼요. 서로의 <b>대표 시간표</b>(과목명·시간·교수님)만 보여요.</div>
        {profile ? (
          <>
            <div style={{ display: "flex", gap: 6 }}>
              <input className="pl-field" style={{ flex: 1 }} readOnly value={inviteLink(profile.invite_code)} onFocus={(e) => e.target.select()} />
              <button className="pl-btn primary" onClick={() => { copy(inviteLink(profile.invite_code)); track("invite_copied"); }}>링크 복사</button>
            </div>
            <div className="pl-hint" style={{ marginTop: 6 }}>
              초대 코드 <b style={{ color: "var(--ink)", letterSpacing: "0.08em" }}>{profile.invite_code}</b> |{" "}
              <button className="pl-link" onClick={async () => {
                if (!window.confirm("새 코드를 만들면 예전 링크로는 더 이상 친구 추가가 안 돼요. 이미 맺은 친구는 그대로예요.")) return;
                const c = await regenerateInvite();
                setProfile({ ...profile, invite_code: c });
              }}>새 코드 만들기</button>
            </div>
          </>
        ) : <div className="pl-hint">불러오는 중…</div>}
      </div>

      <div>
        <div className="pl-label">초대 코드로 추가</div>
        <div style={{ display: "flex", gap: 6 }}>
          <input className="pl-field" style={{ flex: 1, textTransform: "uppercase" }} placeholder="친구에게 받은 8자리 코드" value={code}
            onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} maxLength={12} />
          <button className="pl-btn" disabled={busy || !code.trim()} onClick={add}>추가</button>
        </div>
      </div>

      <div>
        <div className="pl-label">친구 {friends?.length ?? ""}</div>
        {friends === null ? <div className="pl-hint">불러오는 중…</div>
          : friends.length === 0 ? <div className="pl-hint">아직 친구가 없어요. 위 링크를 친구에게 보내 보세요.</div>
          : friends.map((f) => (
            <button key={f.friend_id} className="pl-code-row pl-friend-row" onClick={() => { setViewing(f); setSem(defaultSem); setTt("loading"); track("friend_timetable_viewed"); }}>
              <span style={{ fontWeight: 600, textAlign: "left" }}>{f.display_name}</span>
              <span className="pl-muted">시간표 보기 <Icon name="right" /></span>
            </button>
          ))}
      </div>
    </div>
  );
}
