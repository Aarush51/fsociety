-- ===========================================================================
-- HackMate: fix the six-digit friend-ID lookup
-- ---------------------------------------------------------------------------
-- Symptom
--   Looking a member up by their six-digit ID from The Huddle always failed.
--   PostgREST returned
--     { "code": "42703",
--       "message": "column \"your_actual_column_name\" does not exist" }
--   which the browser shows as a schema-cache / column-style error.
--
-- Cause (verified against the live project, not guessed)
--   The function public.find_user_by_code(text) that is deployed in the
--   database has a body left over from a draft: it still selects the literal
--   placeholder "your_actual_column_name" instead of public.profiles.friend_code.
--   The frontend is correct — FriendCodeInput calls
--     supabase.rpc("find_user_by_code", { p_code: "<six digits>" })
--   and reads id / full_name / friend_code, which is exactly the shape the
--   correct function returns. profiles.friend_code exists and is queryable.
--   Nothing in the repository defines the placeholder name, so the broken
--   definition was created directly in the SQL editor and has never been
--   replaced since. This file replaces it.
--
-- What it changes
--   * public.find_user_by_code(text)  create or replace, correct body
--   * its grants                      authenticated only (unchanged rule)
--
-- Data impact: none. No table, row, index, policy or grant is dropped.
-- Safe to run twice (create or replace + repeated revoke/grant).
-- Dependencies: after 20261027190000_six_digit_friend_codes.sql.
-- ===========================================================================

begin;

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
        'friend_code', p.friend_code            -- was the placeholder before
      )
      from public.profiles p
      where p.friend_code = trim(p_code)          -- was the placeholder before
      limit 1
    )
  end;
$$;

comment on function public.find_user_by_code(text) is
  'Signed-in lookup by six-digit friend ID. Returns id, full_name, friend_code only.';

revoke all on function public.find_user_by_code(text) from public, anon;
grant execute on function public.find_user_by_code(text) to authenticated;

commit;

-- ---------------------------------------------------------------------------
-- Verification (read-only; run while signed in as a real member, not postgres)
--
--   -- 1. The body no longer mentions the placeholder:
--   select prosrc from pg_proc where proname = 'find_user_by_code';
--
--   -- 2. A real code resolves (replace with a code from public.profiles):
--   select public.find_user_by_code('<six-digit code>');
--   -- returns {"id": ..., "full_name": ..., "friend_code": ...}
--
--   -- 3. Unknown / malformed codes return null, they do not raise:
--   select public.find_user_by_code('000001');   -- null
--   select public.find_user_by_code('1234567');  -- null
-- ---------------------------------------------------------------------------

notify pgrst, 'reload schema';
