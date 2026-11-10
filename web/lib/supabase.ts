/**
 * Supabase 클라이언트 (구글 로그인 · 보관함 동기화 · 친구).
 * NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY 가 없으면 null → 계정 기능이 화면에서 숨겨지고 지금처럼 동작한다.
 * DB 구조와 권한 규칙은 저장소 루트의 supabase/schema.sql.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase: SupabaseClient | null =
  URL && KEY && typeof window !== "undefined"
    ? createClient(URL, KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce" } })
    : null;

export const accountsEnabled = () => !!supabase;
