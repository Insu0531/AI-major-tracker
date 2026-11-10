-- KNU 시간표 · 계정/친구 기능 스키마 (Supabase)
-- Supabase 대시보드 → SQL Editor 에 통째로 붙여 넣고 Run. 여러 번 실행해도 안전하다.
--
-- 표
--   profiles     로그인한 사람 (이름, 친구 초대 코드)
--   plans        보관함 시간표 (학기마다 대표 시간표 1개: featured)
--   friendships  친구 관계 (서로 한 줄씩, 두 줄)
-- 권한 원칙
--   - 내 데이터는 나만 읽고 쓴다 (RLS)
--   - 친구 데이터는 아래 함수로만 본다: 친구 목록, 친구의 "대표 시간표"(과목명·시간·교수님만, 강의실 제외)
--   - 친구 추가는 초대 코드로만 (accept_invite). 이메일 검색 기능은 없다.


-- ── 표 ─────────────────────────────────────────────

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  invite_code text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  created_at timestamptz not null default now()
);

create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  name text not null,
  sem text not null,
  items jsonb not null default '[]'::jsonb,
  featured boolean not null default false,
  saved_at timestamptz not null default now()
);
create index if not exists plans_user_idx on public.plans (user_id, saved_at desc);
-- 학기마다 대표 시간표는 하나
create unique index if not exists plans_one_featured_per_sem on public.plans (user_id, sem) where featured;

create table if not exists public.friendships (
  user_id uuid not null references auth.users (id) on delete cascade,
  friend_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  check (user_id <> friend_id)
);

-- ── 가입 시 프로필 자동 생성 ───────────────────────

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), nullif(new.raw_user_meta_data ->> 'name', ''), '익명')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── RLS ────────────────────────────────────────────

alter table public.profiles enable row level security;
alter table public.plans enable row level security;
alter table public.friendships enable row level security;

drop policy if exists "profiles: 내 것 읽기" on public.profiles;
create policy "profiles: 내 것 읽기" on public.profiles for select using (id = auth.uid());
drop policy if exists "profiles: 내 이름 바꾸기" on public.profiles;
create policy "profiles: 내 이름 바꾸기" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "plans: 내 것만" on public.plans;
create policy "plans: 내 것만" on public.plans for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "friendships: 내 친구 목록 읽기" on public.friendships;
create policy "friendships: 내 친구 목록 읽기" on public.friendships for select using (user_id = auth.uid());

-- 이름만 바꿀 수 있게 (초대 코드는 함수로만 새로 발급)
revoke update on public.profiles from anon, authenticated;
grant update (display_name) on public.profiles to authenticated;
grant select on public.profiles to authenticated;
grant select, insert, update, delete on public.plans to authenticated;
grant select on public.friendships to authenticated;

-- ── 함수 (친구 관련은 전부 여기로) ──────────────────

-- 대표 시간표 지정: 같은 학기의 다른 대표는 해제
create or replace function public.set_featured(p_plan uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_sem text;
begin
  select sem into v_sem from plans where id = p_plan and user_id = auth.uid();
  if v_sem is null then raise exception '시간표를 찾을 수 없어요'; end if;
  update plans set featured = false where user_id = auth.uid() and sem = v_sem and featured and id <> p_plan;
  update plans set featured = true where id = p_plan;
end;
$$;

-- 초대 코드로 친구 맺기 (양쪽에 한 줄씩). 친구 이름을 돌려준다.
create or replace function public.accept_invite(p_code text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_friend uuid; v_name text;
begin
  if auth.uid() is null then raise exception '로그인이 필요해요'; end if;
  select id, display_name into v_friend, v_name from profiles where invite_code = upper(trim(p_code));
  if v_friend is null then raise exception '초대 코드를 찾을 수 없어요'; end if;
  if v_friend = auth.uid() then raise exception '내 초대 코드예요'; end if;
  insert into friendships (user_id, friend_id) values (auth.uid(), v_friend), (v_friend, auth.uid())
  on conflict do nothing;
  return v_name;
end;
$$;

create or replace function public.remove_friend(p_friend uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from friendships
  where (user_id = auth.uid() and friend_id = p_friend) or (user_id = p_friend and friend_id = auth.uid());
$$;

-- 친구 목록 (이름만)
create or replace function public.get_friends()
returns table (friend_id uuid, display_name text, since timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select f.friend_id, p.display_name, f.created_at
  from friendships f join profiles p on p.id = f.friend_id
  where f.user_id = auth.uid()
  order by p.display_name;
$$;

-- 친구의 대표 시간표 (해당 학기). 강의실·분반 번호는 빼고 과목명·시간·교수님만.
create or replace function public.get_friend_timetable(p_friend uuid, p_sem text)
returns table (plan_name text, items jsonb)
language sql
stable
security definer
set search_path = public
as $$
  select pl.name,
         coalesce((
           select jsonb_agg(jsonb_build_object(
             'code', it ->> 'code', 'name', it ->> 'name', 'prof', it ->> 'prof',
             'credit', it -> 'credit', 'slots', it -> 'slots', 'color', it ->> 'color'))
           from jsonb_array_elements(pl.items) it
         ), '[]'::jsonb)
  from plans pl
  where pl.user_id = p_friend and pl.sem = p_sem and pl.featured
    and exists (select 1 from friendships f where f.user_id = auth.uid() and f.friend_id = p_friend);
$$;

-- 초대 코드 새로 발급 (예전 링크는 더 이상 안 됨)
create or replace function public.regenerate_invite()
returns text
language sql
security definer
set search_path = public
as $$
  update profiles set invite_code = upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))
  where id = auth.uid()
  returning invite_code;
$$;

-- 회원 탈퇴: 계정과 시간표·친구 관계를 모두 지움 (on delete cascade)
create or replace function public.delete_account()
returns void
language sql
security definer
set search_path = public, auth
as $$
  delete from auth.users where id = auth.uid();
$$;

revoke all on function public.set_featured(uuid), public.accept_invite(text), public.remove_friend(uuid),
  public.get_friends(), public.get_friend_timetable(uuid, text), public.regenerate_invite(), public.delete_account() from public, anon;
grant execute on function public.set_featured(uuid), public.accept_invite(text), public.remove_friend(uuid),
  public.get_friends(), public.get_friend_timetable(uuid, text), public.regenerate_invite(), public.delete_account() to authenticated;
