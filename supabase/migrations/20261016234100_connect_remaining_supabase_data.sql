create or replace function public.get_public_leaderboard()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(to_jsonb(ranked)), '[]'::jsonb)
  from (
    select
      p.full_name,
      p.username,
      p.institution,
      coalesce((
        select sum(ct.amount)
        from public.coin_transactions ct
        where ct.user_id = p.id
      ), 0) as coins,
      coalesce((
        select round(avg(r.rating)::numeric, 1)
        from public.reviews r
        where r.reviewee_id = p.id
      ), 0) as reputation
    from public.profiles p
    order by coins desc, reputation desc, p.created_at asc
    limit 10
  ) ranked;
$$;

create or replace function public.get_featured_builders()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(to_jsonb(featured)), '[]'::jsonb)
  from (
    select
      p.full_name,
      p.username,
      p.institution,
      coalesce((
        select jsonb_agg(s.name order by s.name)
        from public.user_skills us
        join public.skills s on s.id = us.skill_id
        where us.user_id = p.id
      ), '[]'::jsonb) as skills,
      coalesce((
        select round(avg(r.rating)::numeric, 1)
        from public.reviews r
        where r.reviewee_id = p.id
      ), 0) as reputation
    from public.profiles p
    order by p.created_at desc
    limit 6
  ) featured;
$$;

create or replace function public.get_my_dashboard()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'profile', jsonb_build_object(
      'full_name', p.full_name,
      'username', p.username
    ),
    'coin_balance', coalesce((
      select sum(ct.amount)
      from public.coin_transactions ct
      where ct.user_id = p.id
    ), 0),
    'reputation', coalesce((
      select round(avg(r.rating)::numeric, 1)
      from public.reviews r
      where r.reviewee_id = p.id
    ), 0),
    'review_count', (
      select count(*) from public.reviews r where r.reviewee_id = p.id
    ),
    'teams', coalesce((
      select jsonb_agg(to_jsonb(user_team))
      from (
        select
          t.id,
          t.name,
          t.max_members,
          tm.role,
          h.slug as hackathon_slug,
          h.title as hackathon_title,
          (select count(*) from public.team_members members where members.team_id = t.id) as member_count
        from public.team_members tm
        join public.teams t on t.id = tm.team_id
        join public.hackathons h on h.id = t.hackathon_id
        where tm.user_id = p.id
        order by t.created_at desc
      ) user_team
    ), '[]'::jsonb),
    'projects', coalesce((
      select jsonb_agg(to_jsonb(user_project))
      from (
        select pr.id, pr.title, pr.status, t.name as team_name
        from public.team_members tm
        join public.teams t on t.id = tm.team_id
        join public.projects pr on pr.team_id = t.id
        where tm.user_id = p.id
        order by pr.updated_at desc
      ) user_project
    ), '[]'::jsonb),
    'tasks', coalesce((
      select jsonb_agg(to_jsonb(user_task))
      from (
        select tk.id, tk.title, tk.status, tk.due_at, pr.title as project_title
        from public.team_members tm
        join public.teams t on t.id = tm.team_id
        join public.projects pr on pr.team_id = t.id
        join public.tasks tk on tk.project_id = pr.id
        where tm.user_id = p.id
        order by case when tk.status = 'done' then 1 else 0 end, tk.due_at nulls last, tk.created_at desc
        limit 20
      ) user_task
    ), '[]'::jsonb)
  )
  from public.profiles p
  where p.id = (select auth.uid());
$$;

revoke all on function public.get_public_leaderboard() from public, anon;
revoke all on function public.get_featured_builders() from public, anon;
revoke all on function public.get_my_dashboard() from public, anon;
grant execute on function public.get_public_leaderboard() to anon, authenticated;
grant execute on function public.get_featured_builders() to anon, authenticated;
grant execute on function public.get_my_dashboard() to authenticated;
