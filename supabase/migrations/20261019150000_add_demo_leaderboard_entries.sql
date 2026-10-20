create table public.leaderboard_demo_entries (
  username text primary key,
  full_name text not null,
  institution text not null,
  coins integer not null check (coins >= 0),
  reputation numeric(2, 1) not null default 0 check (reputation between 0 and 5),
  created_at timestamptz not null default now()
);

alter table public.leaderboard_demo_entries enable row level security;
revoke all on public.leaderboard_demo_entries from public, anon, authenticated;

insert into public.leaderboard_demo_entries (username, full_name, institution, coins, reputation)
values
  ('demo-maya', 'Maya Patel', 'University of Michigan', 2840, 4.8),
  ('demo-leo', 'Leo Chen', 'Stanford University', 2610, 4.7),
  ('demo-ava', 'Ava Kim', 'Georgia Institute of Technology', 2395, 4.6),
  ('demo-omar', 'Omar Nasser', 'UT Austin', 2120, 4.5)
on conflict (username) do update
set full_name = excluded.full_name,
    institution = excluded.institution,
    coins = excluded.coins,
    reputation = excluded.reputation;

create or replace function public.get_public_leaderboard()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with real_rows as (
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
      ), 0) as reputation,
      false as is_demo,
      p.created_at
    from public.profiles p
  ),
  demo_rows as (
    select
      d.full_name,
      d.username,
      d.institution,
      d.coins,
      d.reputation,
      true as is_demo,
      d.created_at
    from public.leaderboard_demo_entries d
    where not exists (select 1 from real_rows)
  ),
  candidates as (
    select * from real_rows
    union all
    select * from demo_rows
  )
  select coalesce(jsonb_agg(to_jsonb(ranked)), '[]'::jsonb)
  from (
    select full_name, username, institution, coins, reputation, is_demo
    from candidates
    order by coins desc, reputation desc, created_at asc, username asc
    limit 10
  ) ranked;
$$;

revoke all on function public.get_public_leaderboard() from public, anon;
grant execute on function public.get_public_leaderboard() to anon, authenticated;
