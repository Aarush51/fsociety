-- Friend IDs: a short, shareable code that identifies every profile.
--
--   profiles.friend_code       "HM-" + 6 characters from A-Z and 2-9, unique,
--                              never null, never editable by a client
--   profiles_assign_friend_code  BEFORE INSERT: fills the code, retrying whenever
--                              the candidate is already taken
--   profiles_keep_friend_code    BEFORE UPDATE: restores the stored code, so the
--                              value cannot be changed (or cleared) by a client
--   find_user_by_code(text)    SECURITY DEFINER lookup for signed-in users only.
--                              Returns id, display name and friend_code — never
--                              an email or a phone number.
--   get_my_profile()           re-declared so a profile page can read its own code
--
-- "0", "O", "1" and "I" are left out of the alphabet because people read these
-- IDs aloud and type them by hand. That leaves 32 characters, so a code has
-- 32^6 ≈ 1.07 billion combinations; the unique index is the final guard and the
-- generator loops until it finds a free one.

-- ---------------------------------------------------------------------------
-- 1. Column (nullable first: existing rows are backfilled before NOT NULL).
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column friend_code text;

-- ---------------------------------------------------------------------------
-- 2. Generator: returns a code that no profile is using yet.
-- ---------------------------------------------------------------------------

create or replace function public.generate_friend_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  candidate text;
  slot integer;
begin
  loop
    candidate := 'HM-';
    for slot in 1..6 loop
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::integer, 1);
    end loop;
    exit when not exists (
      select 1 from public.profiles p where p.friend_code = candidate
    );
    -- Collision: generate another candidate and try again.
  end loop;
  return candidate;
end;
$$;

revoke all on function public.generate_friend_code() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Insert trigger: every new profile gets a unique code.
-- ---------------------------------------------------------------------------

create or replace function public.assign_friend_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- An existing code is never regenerated; only a missing one is filled in.
  if new.friend_code is null then
    new.friend_code := public.generate_friend_code();
  end if;
  return new;
end;
$$;

revoke all on function public.assign_friend_code() from public, anon, authenticated;

create trigger profiles_assign_friend_code
  before insert on public.profiles
  for each row execute function public.assign_friend_code();

-- ---------------------------------------------------------------------------
-- 4. Update trigger: clients can never change a friend code.
-- ---------------------------------------------------------------------------

create or replace function public.keep_friend_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- A null old value is the backfill path; anything else is restored, so an
  -- update that tries to change or clear the code silently keeps the original.
  if old.friend_code is not null and new.friend_code is distinct from old.friend_code then
    new.friend_code := old.friend_code;
  end if;
  return new;
end;
$$;

revoke all on function public.keep_friend_code() from public, anon, authenticated;

create trigger profiles_keep_friend_code
  before update on public.profiles
  for each row execute function public.keep_friend_code();

-- ---------------------------------------------------------------------------
-- 5. Backfill every existing profile (retries if a candidate is taken).
-- ---------------------------------------------------------------------------

do $$
declare
  target record;
  attempts integer;
begin
  for target in select id from public.profiles where friend_code is null loop
    attempts := 0;
    loop
      begin
        update public.profiles
        set friend_code = public.generate_friend_code()
        where id = target.id;
        exit;
      exception when unique_violation then
        attempts := attempts + 1;
        if attempts >= 25 then
          raise;
        end if;
      end;
    end loop;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Lock the format down: unique, non-null, always "HM-" + 6 allowed chars.
-- ---------------------------------------------------------------------------

alter table public.profiles
  add constraint profiles_friend_code_format
  check (friend_code ~ '^HM-[A-HJ-NP-Z2-9]{6}$');

alter table public.profiles
  add constraint profiles_friend_code_key unique (friend_code);

alter table public.profiles
  alter column friend_code set not null;

-- ---------------------------------------------------------------------------
-- 7. Lookup by friend ID — signed-in callers only.
--
-- Case-insensitive and trimmed ("hm-k7f2q9 " works), and it returns just the
-- id, the display name and the code. Returns null when nobody matches, when the
-- caller is not signed in, or when no code was supplied.
-- ---------------------------------------------------------------------------

create or replace function public.find_user_by_code(p_code text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when (select auth.uid()) is null then null
    when nullif(trim(coalesce(p_code, '')), '') is null then null
    else (
      select jsonb_build_object(
        'id', p.id,
        'full_name', p.full_name,
        'friend_code', p.friend_code
      )
      from public.profiles p
      where p.friend_code = upper(trim(p_code))
      limit 1
    )
  end;
$$;

revoke all on function public.find_user_by_code(text) from public, anon;
grant execute on function public.find_user_by_code(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. get_my_profile(): same payload as before, plus the caller's friend code so
--    the profile page can show and copy it in the same round trip.
-- ---------------------------------------------------------------------------

create or replace function public.get_my_profile()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'full_name', p.full_name,
    'username', p.username,
    'friend_code', p.friend_code,
    'bio', p.bio,
    'skills', coalesce((
      select jsonb_agg(s.name order by s.name)
      from public.user_skills us
      join public.skills s on s.id = us.skill_id
      where us.user_id = (select auth.uid())
    ), '[]'::jsonb),
    'coin_balance', coalesce((
      select sum(ct.amount)
      from public.coin_transactions ct
      where ct.user_id = (select auth.uid())
    ), 0),
    'reputation', coalesce((
      select round(avg(r.rating)::numeric, 1)
      from public.reviews r
      where r.reviewee_id = (select auth.uid())
    ), 0),
    'review_count', (
      select count(*)
      from public.reviews r
      where r.reviewee_id = (select auth.uid())
    )
  )
  from public.profiles p
  where p.id = (select auth.uid());
$$;

revoke all on function public.get_my_profile() from public, anon;
grant execute on function public.get_my_profile() to authenticated;
