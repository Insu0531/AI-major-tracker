/** 계정 · 보관함(서버) · 친구 기능. 모든 권한 검사는 DB(RLS·함수)에서 한다 — supabase/schema.sql 참고 */
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import type { SavedPlan } from "./planner/storage";
import type { TimetableItem } from "./planner/exportImage";

export type Profile = { display_name: string; invite_code: string };
export type Friend = { friend_id: string; display_name: string; since: string };

const need = () => {
  if (!supabase) throw new Error("계정 기능이 꺼져 있어요");
  return supabase;
};
const check = <T,>(r: { data: T; error: { message: string } | null }): T => {
  if (r.error) throw new Error(r.error.message);
  return r.data;
};

export function useSession(): { session: Session | null; ready: boolean } {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!supabase);
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  return { session, ready };
}

export async function signInWithGoogle() {
  await need().auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${window.location.origin}/`, queryParams: { prompt: "select_account" } },
  });
}

export const signOut = () => need().auth.signOut();

export async function getProfile(): Promise<Profile | null> {
  const { data } = await need().from("profiles").select("display_name, invite_code").maybeSingle();
  return data as Profile | null;
}

/* ── 보관함 (서버) ── */

type PlanRow = { id: string; name: string; sem: string; items: SavedPlan["items"]; featured: boolean; saved_at: string };
const toPlan = (r: PlanRow): SavedPlan => ({ id: r.id, name: r.name, sem: r.sem, items: r.items, savedAt: r.saved_at, featured: r.featured, cloud: true });

export async function listCloudPlans(): Promise<SavedPlan[]> {
  const rows = check(await need().from("plans").select("id, name, sem, items, featured, saved_at").order("saved_at", { ascending: false }));
  return (rows as PlanRow[]).map(toPlan);
}

export async function addCloudPlan(p: { name: string; sem: string; items: SavedPlan["items"]; savedAt?: string }): Promise<SavedPlan> {
  const row = check(await need().from("plans")
    .insert({ name: p.name, sem: p.sem, items: p.items, ...(p.savedAt ? { saved_at: p.savedAt } : {}) })
    .select("id, name, sem, items, featured, saved_at").single());
  return toPlan(row as PlanRow);
}

export async function renameCloudPlan(id: string, name: string) { check(await need().from("plans").update({ name }).eq("id", id)); }
export async function deleteCloudPlan(id: string) { check(await need().from("plans").delete().eq("id", id)); }
export async function setFeatured(id: string) { check(await need().rpc("set_featured", { p_plan: id })); }
export async function unsetFeatured(id: string) { check(await need().from("plans").update({ featured: false }).eq("id", id)); }

/* ── 친구 ── */

export async function getFriends(): Promise<Friend[]> {
  return (check(await need().rpc("get_friends")) as Friend[]) ?? [];
}

export async function acceptInvite(code: string): Promise<string> {
  return check(await need().rpc("accept_invite", { p_code: code })) as string;
}

export async function removeFriend(id: string) { check(await need().rpc("remove_friend", { p_friend: id })); }

export async function regenerateInvite(): Promise<string> {
  return check(await need().rpc("regenerate_invite")) as string;
}

/** 친구의 그 학기 대표 시간표 (과목명·시간·교수님만). 없으면 null */
export async function getFriendTimetable(friendId: string, sem: string): Promise<{ name: string; items: TimetableItem[] } | null> {
  const rows = check(await need().rpc("get_friend_timetable", { p_friend: friendId, p_sem: sem })) as { plan_name: string; items: Omit<TimetableItem, "room">[] }[];
  if (!rows?.length) return null;
  return { name: rows[0].plan_name, items: rows[0].items.map((i) => ({ ...i, room: "" })) };
}

export async function deleteAccount() {
  check(await need().rpc("delete_account"));
  await need().auth.signOut();
}

export const inviteLink = (code: string) => `${window.location.origin}/?invite=${code}`;
