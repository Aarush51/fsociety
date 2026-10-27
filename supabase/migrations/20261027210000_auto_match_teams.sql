-- Automatic, skill-based team matching.
--
-- Registration creates a team and, when the registrant asks for matching, a
-- match_pool row. This migration fills those teams from other matching teams of
-- the same requested size:
--
--   * only teams that opted into matching (they have a match_pool row) are used
--   * only teams with the same size are combined
--   * a team that still has pending invites is never used as a donor, so nobody
--     loses an invite; a team that has pending invites can still receive people
--     because those reserved spots count against its size
--   * the pair with the least skill overlap is chosen first, so teammates bring
--     different skills rather than duplicates
--   * the older team keeps its name and leader; the newer team's members join it
--     as members and the empty donor team is deleted
--
-- Matching runs automatically after a match_pool row is inserted, after an invite
-- is accepted/declined/expires, and once for any rows that already exist.
--
-- Everything here runs after 20261027200000_registration_team_formation.sql and
-- 20261027180000_add_profile_skills_interests_hobbies.sql.

begin;

-- A team can be full only because pending invites are reserved. Keep a
-- spots_wanted = 0 row as an "opted into matching" marker so a declined invite
-- can be replaced later.
alter table public.match_pool
  drop constraint if exists match_pool_spots_wanted_check;

alter table public.match_pool
  add constraint match_pool_spots_wanted_check
  check (spots_wanted between 0 and 6);

-- ---------------------------------------------------------------------------
-- 1. Skills for one member and one team.
-- ---------------------------------------------------------------------------

create or replace function public.profile_skill_names(p_user_id uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    array_agg(distinct lower(skill) order by lower(skill)),
    array[]::text[]
  )
  from (
    select jsonb_object_keys(coalesce(p.skills, '{}'::jsonb)) as skill
    from public.profiles p
    where p.id = p_user_id
    union
    select s.name
    from public.user_skills us
    join public.skills s on s.id = us.skill_id
    where us.user_id = p_user_id
  ) member_skills;
$$;

revoke all on function public.profile_skill_names(uuid) from public, anon, authenticated;

create or replace function public.team_skill_names(p_team_id uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    array_agg(distinct skill order by skill),
    array[]::text[]
  )
  from (
    select unnest(public.profile_skill_names(tm.user_id)) as skill
    from public.team_members tm
    where tm.team_id = p_team_id
  ) member_skills;
$$;

revoke all on function public.team_skill_names(uuid) from public, anon, authenticated;

create or replace function public.skill_overlap(a text[], b text[])
returns integer
language sql
immutable
set search_path = ''
as $$
  select count(*)::integer
  from (
    select unnest(coalesce(a, array[]::text[]))
    intersect
    select unnest(coalesce(b, array[]::text[]))
  ) shared_skills;
$$;

revoke all on function public.skill_overlap(text[], text[]) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. One matching pass for a hackathon.
-- ---------------------------------------------------------------------------

create or replace function public.run_hackathon_matching(p_hackathon_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  pair record;
  remaining integer;
  merged integer := 0;
begin
  -- Serialise matching for this hackathon. Registration already locks the
  -- hackathon row, so this also protects invite-driven matching.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_hackathon_id::text, 0)
  );

  loop
    select
      target.id as target_id,
      target.size as team_size,
      target.created_by as target_creator,
      target_counts.member_count as target_members,
      target_counts.pending as target_pending,
      candidate.id as candidate_id,
      candidate.created_by as candidate_creator,
      candidate.member_count as candidate_members
    into pair
    from public.teams target
    join public.match_pool target_pool
      on target_pool.hackathon_id = target.hackathon_id
     and target_pool.user_id = target.created_by
    join lateral (
      select
        (select count(*) from public.team_members tm where tm.team_id = target.id)
          as member_count,
        (
          select count(*)
          from public.team_invites ti
          join public.hackathons h on h.id = ti.hackathon_id
          where ti.team_id = target.id
            and ti.status = 'pending'
            and now() < h.starts_at
        ) as pending
    ) target_counts on true
    join lateral (
      select
        c.id,
        c.created_by,
        c.created_at,
        (select count(*) from public.team_members tm where tm.team_id = c.id)
          as member_count
      from public.teams c
      join public.match_pool candidate_pool
        on candidate_pool.hackathon_id = c.hackathon_id
       and candidate_pool.user_id = c.created_by
      where c.hackathon_id = target.hackathon_id
        and c.id <> target.id
        and c.size = target.size
        and not exists (
          select 1 from public.projects pr where pr.team_id = c.id
        )
        -- Never strand somebody's pending invite by deleting their team.
        and not exists (
          select 1 from public.team_invites ti
          where ti.team_id = c.id and ti.status = 'pending'
        )
        and (select count(*) from public.team_members tm where tm.team_id = c.id)
          <= target.size - target_counts.member_count - target_counts.pending
      order by
        public.skill_overlap(
          public.team_skill_names(target.id),
          public.team_skill_names(c.id)
        ),
        (select count(*) from public.team_members tm where tm.team_id = c.id) desc,
        c.created_at
      limit 1
    ) candidate on true
    where target.hackathon_id = p_hackathon_id
      and target.created_by is not null
      and now() < (
        select h.starts_at from public.hackathons h where h.id = target.hackathon_id
      )
      and not exists (
        select 1 from public.projects pr where pr.team_id = target.id
      )
      and target_counts.member_count + target_counts.pending < target.size
      and candidate.member_count
        <= target.size - target_counts.member_count - target_counts.pending
    order by target.created_at
    limit 1;

    exit when not found;

    -- Move the donor team's members onto the target team. They become ordinary
    -- members; the target keeps its original leader.
    update public.team_members
    set team_id = pair.target_id,
        role = 'member'
    where team_id = pair.candidate_id;

    delete from public.match_pool
    where hackathon_id = p_hackathon_id
      and user_id = pair.candidate_creator;

    delete from public.teams
    where id = pair.candidate_id;

    remaining := (
      pair.team_size
      - pair.target_members
      - pair.candidate_members
      - pair.target_pending
    )::integer;

    if remaining > 0 or pair.target_pending > 0 then
      -- A zero row is a marker, not a waiting state: it lets a declined invite
      -- reopen the team for matching later.
      update public.match_pool
      set spots_wanted = remaining
      where hackathon_id = p_hackathon_id
        and user_id = pair.target_creator;
    else
      delete from public.match_pool
      where hackathon_id = p_hackathon_id
        and user_id = pair.target_creator;
    end if;

    merged := merged + 1;
  end loop;

  return merged;
end;
$$;

revoke all on function public.run_hackathon_matching(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Run automatically when a team joins the pool or an invite changes.
-- ---------------------------------------------------------------------------

create or replace function public.run_matching_after_match_pool_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform public.run_hackathon_matching(new.hackathon_id);
  exception when others then
    -- Matching must never lose a registration. Keep the row and let the next
    -- registration or invite change try again.
    raise warning 'Automatic team matching failed for hackathon %: %',
      new.hackathon_id, sqlerrm;
  end;
  return new;
end;
$$;

revoke all on function public.run_matching_after_match_pool_insert()
  from public, anon, authenticated;

drop trigger if exists match_pool_auto_match on public.match_pool;
create trigger match_pool_auto_match
  after insert on public.match_pool
  for each row execute function public.run_matching_after_match_pool_insert();

create or replace function public.run_matching_after_invite_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status in ('accepted', 'declined', 'expired')
     and old.status is distinct from new.status then
    begin
      perform public.run_hackathon_matching(new.hackathon_id);
    exception when others then
      raise warning 'Automatic team matching failed for hackathon %: %',
        new.hackathon_id, sqlerrm;
    end;
  end if;
  return new;
end;
$$;

revoke all on function public.run_matching_after_invite_change()
  from public, anon, authenticated;

drop trigger if exists team_invites_auto_match on public.team_invites;
create trigger team_invites_auto_match
  after update of status on public.team_invites
  for each row execute function public.run_matching_after_invite_change();

-- ---------------------------------------------------------------------------
-- 4. Match rows that were already waiting before this migration.
-- ---------------------------------------------------------------------------

do $$
declare
  waiting_hackathon record;
begin
  for waiting_hackathon in
    select distinct mp.hackathon_id from public.match_pool mp
  loop
    begin
      perform public.run_hackathon_matching(waiting_hackathon.hackathon_id);
    exception when others then
      raise warning 'Could not match waiting teams for hackathon %: %',
        waiting_hackathon.hackathon_id, sqlerrm;
    end;
  end loop;
end;
$$;

commit;
