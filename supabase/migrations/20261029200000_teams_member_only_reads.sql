-- 2026-10-29 — teams are readable only by their own members.
--
-- Before this migration public.teams and public.team_members had RLS enabled
-- with no policies and no grants, so direct table reads were impossible — but
-- public.list_hackathon_teams(uuid) is SECURITY DEFINER and was executable by
-- anon, so anyone (signed in or not) could list every team in a hackathon with
-- its members. That is the public directory this migration removes.
--
-- After it:
--   * Members can read their own team row and that team's member rows through
--     new, narrow SELECT policies. No other policy is changed or loosened:
--     organizers keep their existing RPC-based access and nothing new is
--     granted to anon.
--   * list_hackathon_teams() returns the caller's own team(s) only; an
--     organizer or admin still gets every team of the hackathon they run.
--     Signed-out visitors get nothing.
--
-- Safe to run twice: policies are dropped before being created, the function is
-- replaced, and no table, row or column is removed.

-- ---------------------------------------------------------------------------
-- 1. Members-only direct reads
-- ---------------------------------------------------------------------------

grant select on public.teams, public.team_members to authenticated;
revoke select on public.teams, public.team_members from anon;

drop policy if exists "Team members can read their team" on public.teams;
create policy "Team members can read their team"
  on public.teams for select
  to authenticated
  using (public.is_team_member(teams.id));

drop policy if exists "Team members can read their teammates" on public.team_members;
create policy "Team members can read their teammates"
  on public.team_members for select
  to authenticated
  using (public.is_team_member(team_members.team_id));

-- ---------------------------------------------------------------------------
-- 2. The listing RPC: no more public directory
--
--    Same JSON shape the organizer page already reads, but the caller only
--    sees teams they belong to unless they organize (or administer) this
--    hackathon. Team size is read from the row's JSON so the function works
--    with teams.max_members and with the renamed teams.size.
-- ---------------------------------------------------------------------------

create or replace function public.list_hackathon_teams(p_hackathon_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', t.id,
        'name', t.name,
        'description', t.description,
        'max_members', coalesce(
          (to_jsonb(t) ->> 'max_members')::integer,
          (to_jsonb(t) ->> 'size')::integer,
          1
        ),
        'size', coalesce(
          (to_jsonb(t) ->> 'size')::integer,
          (to_jsonb(t) ->> 'max_members')::integer,
          1
        ),
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
    ),
    '[]'::jsonb
  )
  from public.teams t
  join public.hackathons h on h.id = t.hackathon_id
  where t.hackathon_id = p_hackathon_id
    and h.status in ('upcoming', 'active')
    and (
      public.is_hackathon_organizer(p_hackathon_id)
      or exists (
        select 1
        from public.profiles admin
        where admin.id = (select auth.uid())
          and admin.role = 'admin'
      )
      or exists (
        select 1
        from public.team_members mine
        where mine.team_id = t.id
          and mine.user_id = (select auth.uid())
      )
    );
$$;

revoke all on function public.list_hackathon_teams(uuid) from public, anon;
grant execute on function public.list_hackathon_teams(uuid) to authenticated;

comment on function public.list_hackathon_teams(uuid) is
  'Teams for one hackathon: the caller''s own teams only, or all teams for the hackathon organizer/admin. Never a public directory.';

notify pgrst, 'reload schema';
