-- Six-digit numeric friend IDs.
--
-- Replaces the previous "HM-XXXXXX" codes:
--
--   profiles.friend_code   text, unique, not null, exactly six digits
--                          100000-999999 (no leading zero)
--   generate_friend_code   picks a free number, repeating until it finds one
--   assign_friend_code     BEFORE INSERT: always generates the code, so a client
--                          cannot choose its own value
--   keep_friend_code       BEFORE UPDATE: restores the stored code, so a client
--                          cannot change or clear it
--   find_user_by_code      SECURITY DEFINER, authenticated only, trims its input,
--                          and returns only id, full_name and friend_code —
--                          never an email, phone or anything from auth.users
--
-- Existing rows are backfilled in place. The update trigger is disabled only for
-- that backfill and re-enabled before the new format constraint is added. Every
-- statement runs inside one transaction: if anything fails, all old codes stay.
--
-- The backfill only touches rows whose code is not already six numeric digits,
-- so re-running this file does not rotate codes that are already correct.
--
-- get_my_profile() already returns friend_code (20261027120000_add_friend_codes),
-- so the profile page needs no further SQL change.

begin;

-- ---------------------------------------------------------------------------
-- 1. Generator: a free number between 100000 and 999999.
-- ---------------------------------------------------------------------------

create or replace function public.generate_friend_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  candidate text;
begin
  loop
    candidate := (100000 + floor(random() * 900000)::integer)::text;
    exit when not exists (
      select 1 from public.profiles p where p.friend_code = candidate
    );
    -- Taken: draw another number and try again.
  end loop;
  return candidate;
end;
$$;

revoke all on function public.generate_friend_code() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Insert trigger: always generate. A client-supplied value is overwritten.
-- ---------------------------------------------------------------------------

create or replace function public.assign_friend_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.friend_code := public.generate_friend_code();
  return new;
end;
$$;

revoke all on function public.assign_friend_code() from public, anon, authenticated;

drop trigger if exists profiles_assign_friend_code on public.profiles;
create trigger profiles_assign_friend_code
  before insert on public.profiles
  for each row execute function public.assign_friend_code();

-- ---------------------------------------------------------------------------
-- 3. Update trigger: the stored code always wins.
-- ---------------------------------------------------------------------------

create or replace function public.keep_friend_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.friend_code is not null and new.friend_code is distinct from old.friend_code then
    new.friend_code := old.friend_code;
  end if;
  return new;
end;
$$;

revoke all on function public.keep_friend_code() from public, anon, authenticated;

drop trigger if exists profiles_keep_friend_code on public.profiles;
create trigger profiles_keep_friend_code
  before update on public.profiles
  for each row execute function public.keep_friend_code();

-- ---------------------------------------------------------------------------
-- 4. Backfill: replace every old-format (or missing) code.
--    The unique constraint stays in place; a collision is retried.
-- ---------------------------------------------------------------------------

alter table public.profiles
  drop constraint if exists profiles_friend_code_format;

alter table public.profiles disable trigger profiles_keep_friend_code;

do $$
declare
  target record;
  attempts integer;
begin
  for target in
    select id
    from public.profiles
    where friend_code is null
       or friend_code !~ '^[1-9][0-9]{5}$'
  loop
    attempts := 0;
    loop
      begin
        update public.profiles
        set friend_code = public.generate_friend_code()
        where id = target.id;
        exit;
      exception when unique_violation then
        attempts := attempts + 1;
        if attempts >= 50 then
          raise;
        end if;
      end;
    end loop;
  end loop;
end;
$$;

alter table public.profiles enable trigger profiles_keep_friend_code;

-- ---------------------------------------------------------------------------
-- 5. Lock the format down: six digits, 100000-999999, still unique and required.
-- ---------------------------------------------------------------------------

alter table public.profiles
  add constraint profiles_friend_code_format
  check (friend_code ~ '^[1-9][0-9]{5}$');

alter table public.profiles
  alter column friend_code set not null;

-- ---------------------------------------------------------------------------
-- 6. Lookup by ID — signed-in callers only, trimmed, six digits only.
--    The result carries no email, phone or auth.users data.
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
    when trim(coalesce(p_code, '')) !~ '^[1-9][0-9]{5}$' then null
    else (
      select jsonb_build_object(
        'id', p.id,
        'full_name', p.full_name,
        'friend_code', p.friend_code
      )
      from public.profiles p
      where p.friend_code = trim(p_code)
      limit 1
    )
  end;
$$;

revoke all on function public.find_user_by_code(text) from public, anon;
grant execute on function public.find_user_by_code(text) to authenticated;

commit;

-- ---------------------------------------------------------------------------
-- Verification (read-only; run after the block above)
--
--   -- 1. Every profile has a unique six-digit code.
--   select count(*)                                   as profiles,
--          count(distinct friend_code)                as distinct_codes,
--          count(*) filter (
--            where friend_code !~ '^[1-9][0-9]{5}$'
--          )                                          as not_six_digits
--   from public.profiles;
--   -- expect distinct_codes = profiles and not_six_digits = 0
--
--   -- 2. A client cannot change a code (run signed in as that user, then check).
--   --    update public.profiles set friend_code = '000000'
--   --    where id = (select auth.uid());
--   --    The update succeeds but the value is restored by profiles_keep_friend_code.
--
--   -- 3. A seven-digit or letter code is refused by the lookup, which returns null.
--   --    select public.find_user_by_code('1234567');  -- null
--   --    select public.find_user_by_code('ABC123');   -- null
--
--   -- 4. The lookup returns three keys only. Call it from the app (it needs the
--   --    signed-in JWT) and inspect the JSON: friend_code, full_name, id.
-- ---------------------------------------------------------------------------
