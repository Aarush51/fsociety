-- 2026-10-29 — skill-based team suggestions without a team directory.
--
-- public.suggest_teams(p_hackathon_id uuid) returns jsonb: at most three open
-- teams in that hackathon that the caller is not in, best fit first, and an
-- empty array when nothing fits. Executable by signed-in users only.
--
-- For every open team it unions the skills (profiles.skills keys) and interests
-- (profiles.interests) of the team's members, then compares them with the
-- caller's own:
--   missing_skills   — the caller's skills the team does not have yet
--   shared_interests — interests the caller and the team have in common
--   score            — 3 per missing skill + 2 per shared interest, > 0 only
--
-- A row is exactly:
--   { team_id, team_name, member_count, spots_left,
--     missing_skills: [..], shared_interests: [..] }
-- No member name, username, id, email, phone or profile row is returned.
--
-- Both teams.max_members and the renamed teams.size are supported (the size is
-- read from the row's JSON), so this runs before or after that rename.
--
-- Safe to run twice: one create or replace, no table/policy/grant changes.

create or replace function public.suggest_teams(p_hackathon_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select
      coalesce(
        (
          select array_agg(distinct lower(btrim(skill)))
          from jsonb_object_keys(coalesce(p.skills, '{}'::jsonb)) as skill
          where btrim(skill) <> ''
        ),
        '{}'::text[]
      ) as skills,
      coalesce(p.interests, '{}'::text[]) as interests
    from public.profiles p
    where p.id = (select auth.uid())
  ),
  teams_with_size as (
    select
      t.id,
      t.name,
      coalesce(
        (to_jsonb(t) ->> 'size')::integer,
        (to_jsonb(t) ->> 'max_members')::integer,
        1
      ) as team_size,
      (
        select count(*)
        from public.team_members tm
        where tm.team_id = t.id
      ) as member_count
    from public.teams t
    where t.hackathon_id = p_hackathon_id
      and not exists (
        select 1
        from public.team_members mine
        where mine.team_id = t.id
          and mine.user_id = (select auth.uid())
      )
  ),
  open_teams as (
    select *
    from teams_with_size
    where member_count < team_size
  ),
  team_skills as (
    select
      o.id,
      coalesce(
        array_agg(distinct lower(btrim(skill))) filter (where btrim(skill) <> ''),
        '{}'::text[]
      ) as skills
    from open_teams o
    join public.team_members tm on tm.team_id = o.id
    join public.profiles p on p.id = tm.user_id
    left join lateral jsonb_object_keys(coalesce(p.skills, '{}'::jsonb)) as skill on true
    group by o.id
  ),
  team_interests as (
    select
      o.id,
      coalesce(
        array_agg(distinct lower(btrim(interest))) filter (where btrim(interest) <> ''),
        '{}'::text[]
      ) as interests
    from open_teams o
    join public.team_members tm on tm.team_id = o.id
    join public.profiles p on p.id = tm.user_id
    left join lateral unnest(coalesce(p.interests, '{}'::text[])) as interest on true
    group by o.id
  ),
  scored as (
    select
      o.id,
      o.name,
      o.member_count,
      greatest(o.team_size - o.member_count, 0) as spots_left,
      coalesce(
        (
          select array_agg(skill order by skill)
          from unnest(m.skills) as skill
          where skill = any(coalesce(ts.skills, '{}'::text[]))
        ),
        '{}'::text[]
      ) as missing_skills,
      coalesce(
        (
          select array_agg(interest order by interest)
          from unnest(m.interests) as interest
          where lower(btrim(interest)) = any(coalesce(ti.interests, '{}'::text[]))
        ),
        '{}'::text[]
      ) as shared_interests
    from open_teams o
    cross join me m
    left join team_skills ts on ts.id = o.id
    left join team_interests ti on ti.id = o.id
  ),
  ranked as (
    select
      s.id,
      s.name,
      s.member_count,
      s.spots_left,
      s.missing_skills,
      s.shared_interests,
      cardinality(s.missing_skills) * 3 + cardinality(s.shared_interests) * 2 as score
    from scored s
    where cardinality(s.missing_skills) > 0
       or cardinality(s.shared_interests) > 0
    order by
      cardinality(s.missing_skills) * 3 + cardinality(s.shared_interests) * 2 desc,
      s.spots_left desc,
      s.name asc
    limit 3
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'team_id', r.id,
        'team_name', r.name,
        'member_count', r.member_count,
        'spots_left', r.spots_left,
        'missing_skills', to_jsonb(r.missing_skills),
        'shared_interests', to_jsonb(r.shared_interests)
      )
      order by r.score desc, r.name asc
    ),
    '[]'::jsonb
  )
  from ranked r;
$$;

comment on function public.suggest_teams(uuid) is
  'Up to three open teams for one hackathon that the caller is not in, scored by the caller''s skills the team lacks and shared interests. Returns team id, name, member count, spots left, missing skills and shared interests only — never member or profile data.';

revoke all on function public.suggest_teams(uuid) from public, anon;
grant execute on function public.suggest_teams(uuid) to authenticated;

notify pgrst, 'reload schema';
