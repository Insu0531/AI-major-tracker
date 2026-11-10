/**
 * Supabase 클라이언트 (구글 로그인 · 보관함 동기화 · 친구).
 * 켜는 조건: NEXT_PUBLIC_SUPABASE_URL · NEXT_PUBLIC_SUPABASE_ANON_KEY 가 있고, NEXT_PUBLIC_ACCOUNTS_LIVE=1 일 때.
 * 그 전에는 로그인·친구 버튼이 "준비 중"으로만 보이고 나머지는 지금처럼 동작한다.
 * DB 구조와 권한 규칙은 저장소 루트의 supabase/schema.sql.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const LIVE = process.env.NEXT_PUBLIC_ACCOUNTS_LIVE === "1";

export const supabase: SupabaseClient | null =
  LIVE && URL && KEY && typeof window !== "undefined"
    ? createClient(URL, KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce" } })
    : null;

export const accountsEnabled = () => !!supabase;
