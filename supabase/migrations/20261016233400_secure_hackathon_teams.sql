alter table public.teams enable row level security;
alter table public.team_members enable row level security;

revoke all on public.teams, public.team_members from anon, authenticated;

create or replace function public.list_hackathon_teams(p_hackathon_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', t.id,
      'name', t.name,
      'description', t.description,
      'max_members', t.max_members,
      'created_at', t.created_at,
      'members', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', p.id,
            'full_name', p.full_name,
            'username', p.username,
            'role', tm.role,
            'skills', coalesce((
              select jsonb_agg(s.name order by s.name)
              from public.user_skills us
              join public.skills s on s.id = us.skill_id
              where us.user_id = p.id
            ), '[]'::jsonb),
            'reputation', coalesce((
              select round(avg(r.rating)::numeric, 1)
              from public.reviews r
              where r.reviewee_id = p.id
            ), 0),
            'review_count', (
              select count(*)
              from public.reviews r
              where r.reviewee_id = p.id
            )
          )
          order by case when tm.role = 'leader' then 0 else 1 end, p.full_name
        )
        from public.team_members tm
        join public.profiles p on p.id = tm.user_id
        where tm.team_id = t.id
      ), '[]'::jsonb)
    )
    order by t.created_at desc
  ), '[]'::jsonb)
  from public.teams t
  join public.hackathons h on h.id = t.hackathon_id
  where t.hackathon_id = p_hackathon_id
    and h.status in ('upcoming', 'active');
$$;

create or replace function public.create_hackathon_team(
  p_hackathon_id uuid,
  p_name text,
  p_description text default null,
  p_max_members integer default 4
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  new_team_id uuid;
begin
  if current_user_id is null then
    raise exception 'You must be signed in to create a team.';
  end if;
  if p_name is null or char_length(trim(p_name)) not between 1 and 100 then
    raise exception 'Team name must be between 1 and 100 characters.';
  end if;
  if p_description is not null and char_length(p_description) > 1000 then
    raise exception 'Team description must be 1000 characters or fewer.';
  end if;
  if p_max_members is null or p_max_members not between 1 and 100 then
    raise exception 'Team size must be between 1 and 100.';
  end if;
  if not exists (
    select 1 from public.hackathons h
    where h.id = p_hackathon_id and h.status in ('upcoming', 'active')
  ) then
    raise exception 'This hackathon is not open for teams.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(current_user_id::text || ':' || p_hackathon_id::text, 0)
  );
  if exists (
    select 1
    from public.team_members tm
    join public.teams t on t.id = tm.team_id
    where tm.user_id = current_user_id and t.hackathon_id = p_hackathon_id
  ) then
    raise exception 'You are already a member of a team for this hackathon.';
  end if;

  insert into public.teams (hackathon_id, name, description, max_members, created_by)
  values (p_hackathon_id, trim(p_name), nullif(trim(p_description), ''), p_max_members, current_user_id)
  returning id into new_team_id;

  insert into public.team_members (team_id, user_id, role)
  values (new_team_id, current_user_id, 'leader');

  return new_team_id;
end;
$$;

create or replace function public.join_hackathon_team(p_team_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  target_hackathon_id uuid;
  target_max_members integer;
  current_member_count integer;
begin
  if current_user_id is null then
    raise exception 'You must be signed in to join a team.';
  end if;

  select t.hackathon_id, t.max_members
  into target_hackathon_id, target_max_members
  from public.teams t
  where t.id = p_team_id
  for update;

  if not found then
    raise exception 'This team does not exist.';
  end if;
  if not exists (
    select 1 from public.hackathons h
    where h.id = target_hackathon_id and h.status in ('upcoming', 'active')
  ) then
    raise exception 'This hackathon is not open for team membership.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(current_user_id::text || ':' || target_hackathon_id::text, 0)
  );
  if exists (
    select 1
    from public.team_members tm
    join public.teams t on t.id = tm.team_id
    where tm.user_id = current_user_id and t.hackathon_id = target_hackathon_id
  ) then
    raise exception 'You are already a member of a team for this hackathon.';
  end if;

  select count(*) into current_member_count
  from public.team_members tm
  where tm.team_id = p_team_id;
  if current_member_count >= target_max_members then
    raise exception 'This team is full.';
  end if;

  insert into public.team_members (team_id, user_id, role)
  values (p_team_id, current_user_id, 'member');
end;
$$;

revoke all on function public.list_hackathon_teams(uuid) from public;
revoke all on function public.create_hackathon_team(uuid, text, text, integer) from public, anon;
revoke all on function public.join_hackathon_team(uuid) from public, anon;
grant execute on function public.list_hackathon_teams(uuid) to anon, authenticated;
grant execute on function public.create_hackathon_team(uuid, text, text, integer) to authenticated;
grant execute on function public.join_hackathon_team(uuid) to authenticated;
