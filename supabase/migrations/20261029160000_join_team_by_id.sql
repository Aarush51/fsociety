-- 2026-10-29 — join a team by the ID its leader shared.
--
-- What this adds
--   public.join_hackathon_team_by_id(p_hackathon_id uuid, p_team_code text)
--   returns jsonb, SECURITY DEFINER, executable by signed-in users only.
--
--   The team page only offers "paste a team ID", so the database is where the
--   ID is resolved and every rule is enforced. It accepts the full team uuid,
--   the uuid without dashes, or the short code shown in the app (first eight
--   hex characters, e.g. 4F2A-91C7), and answers with one of:
--     { "ok": true,  "team_id": uuid, "team_name": text }
--     { "ok": false, "error": "invalid_id" | "unknown_team" | "wrong_hackathon"
--                            | "hackathon_closed" | "not_registered"
--                            | "already_in_team" | "team_full" | "not_signed_in" }
--
--   Checks, in order: signed in -> ID resolves to a team -> that team belongs
--   to the given hackathon -> hackathon still open -> caller registered for
--   that hackathon -> caller not already on a team there -> the team still has
--   a free spot (its own size limit) -> membership inserted.
--
-- Why a new function instead of changing the old one
--   join_hackathon_team(uuid) still exists and is left untouched for anything
--   calling it. This function adds the checks it never had (registration and
--   hackathon scoping) and returns messages the client can show verbatim.
--
-- Safety
--   * create or replace only; no table, column, row, policy or grant is removed
--     and no existing function is changed.
--   * Safe to run twice.
--   * The team's size column is read from the row's JSON, so the function works
--     whether this database still has teams.max_members or the renamed
--     teams.size. Membership is inserted with hackathon_id when that column
--     exists, and without it on the older table shape.
--   * Rows are locked (team row + per user/hackathon advisory lock) so two
--     people cannot take the same last spot.

create or replace function public.join_hackathon_team_by_id(
  p_hackathon_id uuid,
  p_team_code text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_compact text := replace(
    replace(lower(btrim(coalesce(p_team_code, ''))), '-', ''),
    ' ',
    ''
  );
  v_team_id uuid;
  v_team jsonb;
  v_team_name text;
  v_team_hackathon uuid;
  v_team_size integer;
  v_members integer;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;

  if v_compact = '' then
    return jsonb_build_object('ok', false, 'error', 'invalid_id');
  end if;

  -- Resolve the pasted value to exactly one team: full uuid, uuid without
  -- dashes, or the short code the app displays.
  select t.id
  into v_team_id
  from public.teams t
  where replace(t.id::text, '-', '') = v_compact
     or left(replace(t.id::text, '-', ''), 8) = v_compact
  -- A short code that happens to collide prefers this hackathon's team.
  order by (t.hackathon_id = p_hackathon_id) desc, t.created_at desc
  limit 1;

  if v_team_id is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_team');
  end if;

  -- Lock the team for the rest of this transaction so capacity cannot change
  -- between the count below and the insert.
  perform 1 from public.teams t where t.id = v_team_id for update;

  select t.name, t.hackathon_id
  into v_team_name, v_team_hackathon
  from public.teams t
  where t.id = v_team_id;

  select to_jsonb(t)
  into v_team
  from public.teams t
  where t.id = v_team_id;

  v_team_size := coalesce(
    (v_team ->> 'size')::integer,
    (v_team ->> 'max_members')::integer,
    1
  );

  if v_team_hackathon <> p_hackathon_id then
    return jsonb_build_object('ok', false, 'error', 'wrong_hackathon');
  end if;

  if not exists (
    select 1
    from public.hackathons h
    where h.id = p_hackathon_id
      and h.status in ('upcoming', 'active')
  ) then
    return jsonb_build_object('ok', false, 'error', 'hackathon_closed');
  end if;

  if not exists (
    select 1
    from public.registrations r
    where r.hackathon_id = p_hackathon_id
      and r.user_id = v_user
  ) then
    return jsonb_build_object('ok', false, 'error', 'not_registered');
  end if;

  if exists (
    select 1
    from public.team_members tm
    join public.teams t on t.id = tm.team_id
    where tm.user_id = v_user
      and t.hackathon_id = p_hackathon_id
  ) then
    return jsonb_build_object('ok', false, 'error', 'already_in_team');
  end if;

  select count(*)
  into v_members
  from public.team_members tm
  where tm.team_id = v_team_id;

  if v_members >= v_team_size then
    return jsonb_build_object('ok', false, 'error', 'team_full');
  end if;

  -- One person cannot end up on two teams for the same hackathon.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user::text || ':' || p_hackathon_id::text, 0)
  );

  if exists (
    select 1
    from public.team_members tm
    join public.teams t on t.id = tm.team_id
    where tm.user_id = v_user
      and t.hackathon_id = p_hackathon_id
  ) then
    return jsonb_build_object('ok', false, 'error', 'already_in_team');
  end if;

  select count(*)
  into v_members
  from public.team_members tm
  where tm.team_id = v_team_id;

  if v_members >= v_team_size then
    return jsonb_build_object('ok', false, 'error', 'team_full');
  end if;

  begin
    insert into public.team_members (team_id, hackathon_id, user_id, role)
    values (v_team_id, p_hackathon_id, v_user, 'member');
  exception
    when undefined_column then
      -- Older team_members shape: no hackathon_id column.
      insert into public.team_members (team_id, user_id, role)
      values (v_team_id, v_user, 'member');
  end;

  return jsonb_build_object('ok', true, 'team_id', v_team_id, 'team_name', v_team_name);
end;
$$;

comment on function public.join_hackathon_team_by_id(uuid, text) is
  'Joins the caller to a team in one hackathon using the team ID shared by its leader. Resolves a uuid or short code and enforces registration, hackathon scope and the team size limit. Returns { ok, error } so the client can show a specific message.';

revoke all on function public.join_hackathon_team_by_id(uuid, text) from public, anon;
grant execute on function public.join_hackathon_team_by_id(uuid, text) to authenticated;

notify pgrst, 'reload schema';
