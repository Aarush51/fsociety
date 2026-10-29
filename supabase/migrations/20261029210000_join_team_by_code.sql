-- 2026-10-29 — join one team by the code its leader shared.
--
-- public.join_team_by_code(p_hackathon_id uuid, p_team_code text) returns jsonb
-- and is executable by signed-in users only (public/anon are revoked).
--
-- The code can be the team uuid, the uuid without dashes, or the short code the
-- app shows (the first eight hex characters, e.g. 4F2A-91C7). Only teams of the
-- given hackathon are searched, so a code from another event is simply wrong.
--
-- It rejects, in this order, when the caller: is not signed in, is suspended,
-- is not registered for that hackathon, is already on a team there, pasted an
-- empty or unknown code, or the team has no free spot. On success it adds the
-- caller as a member and returns the team:
--   { id, name, description, size, member_count, spots_left }
-- No profile, email or phone number is returned.
--
-- Safe to run twice. It only creates/replaces this one function: no table,
-- column, policy or grant is changed, and no existing function is touched.
--
-- Note: public.join_hackathon_team_by_id(uuid, text) from 20261029160000 is left
-- in place for anything still calling it; this function is the one the app uses.

create or replace function public.join_team_by_code(
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
  v_code text := replace(
    replace(lower(btrim(coalesce(p_team_code, ''))), '-', ''),
    ' ',
    ''
  );
  v_team_id uuid;
  v_team_name text;
  v_team_description text;
  v_team_size integer;
  v_members integer;
  v_suspended boolean;
  v_registered boolean;
begin
  if v_user is null then
    raise exception 'Log in to join a team.';
  end if;

  select coalesce(p.suspended, false)
  into v_suspended
  from public.profiles p
  where p.id = v_user;

  if coalesce(v_suspended, false) then
    raise exception 'This account is suspended, so it cannot join a team.';
  end if;

  select exists (
    select 1
    from public.registrations r
    where r.hackathon_id = p_hackathon_id
      and r.user_id = v_user
  )
  into v_registered;

  if not coalesce(v_registered, false) then
    raise exception 'Register for this hackathon before joining a team.';
  end if;

  if exists (
    select 1
    from public.team_members tm
    join public.teams t on t.id = tm.team_id
    where tm.user_id = v_user
      and t.hackathon_id = p_hackathon_id
  ) then
    raise exception 'You are already on a team for this hackathon.';
  end if;

  if v_code = '' then
    raise exception 'Enter the team ID you were given.';
  end if;

  select t.id
  into v_team_id
  from public.teams t
  where t.hackathon_id = p_hackathon_id
    and (
      replace(t.id::text, '-', '') = v_code
      or left(replace(t.id::text, '-', ''), 8) = v_code
    )
  order by (replace(t.id::text, '-', '') = v_code) desc, t.created_at desc
  limit 1;

  if v_team_id is null then
    raise exception 'No team in this hackathon uses that team ID.';
  end if;

  -- Lock the team row so two people cannot take the same last spot.
  perform 1 from public.teams t where t.id = v_team_id for update;

  select
    t.name,
    t.description,
    coalesce(
      (to_jsonb(t) ->> 'size')::integer,
      (to_jsonb(t) ->> 'max_members')::integer,
      1
    )
  into v_team_name, v_team_description, v_team_size
  from public.teams t
  where t.id = v_team_id;

  select count(*)
  into v_members
  from public.team_members tm
  where tm.team_id = v_team_id;

  if v_members >= v_team_size then
    raise exception 'That team is full.';
  end if;

  begin
    insert into public.team_members (team_id, hackathon_id, user_id, role)
    values (v_team_id, p_hackathon_id, v_user, 'member');
  exception
    when undefined_column then
      -- Older team_members shape: no hackathon_id column.
      insert into public.team_members (team_id, user_id, role)
      values (v_team_id, v_user, 'member');
    when unique_violation then
      raise exception 'You are already on a team for this hackathon.';
  end;

  return jsonb_build_object(
    'id', v_team_id,
    'name', v_team_name,
    'description', v_team_description,
    'size', v_team_size,
    'member_count', v_members + 1,
    'spots_left', greatest(v_team_size - v_members - 1, 0)
  );
end;
$$;

comment on function public.join_team_by_code(uuid, text) is
  'Joins the signed-in caller to one team of a hackathon using the team ID shared by its leader. Rejects suspended or unregistered callers, an existing team, an unknown code and a full team. Returns the team without any member or profile data.';

revoke all on function public.join_team_by_code(uuid, text) from public, anon;
grant execute on function public.join_team_by_code(uuid, text) to authenticated;

notify pgrst, 'reload schema';
