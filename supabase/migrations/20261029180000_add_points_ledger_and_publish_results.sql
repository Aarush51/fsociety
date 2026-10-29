-- ---------------------------------------------------------------------------
-- Points ledger, publishing with points, and the points leaderboard.
-- ---------------------------------------------------------------------------
-- Column names below are taken from the migrations that already exist:
--   hackathons.approved_tier         20261029120000_add_hackathon_tiers.sql
--   tier_settings(tier, multiplier)  20261029140000_hackathon_tier_settings_and_review.sql
--   results(place, honourable_mention, published)  20261029160000_add_attendance_and_results.sql
--   publish_hackathon_results(uuid, boolean)       20261029160000_add_attendance_and_results.sql
--
-- What this adds, in order
--   1. public.points_ledger      id, user_id, hackathon_id, points, reason,
--                                created_at. Readable by everyone; nobody can
--                                write it directly (no write policy, grants
--                                revoked).
--   2. public.publish_results    organizer only: publishes the result sheet
--                                (reusing publish_hackathon_results for the
--                                published flag and its validation), then
--                                replaces that hackathon's ledger rows with the
--                                points below.
--   3. public.unpublish_results  organizer only: unpublishes and deletes that
--                                hackathon's ledger rows.
--   4. public.get_points_leaderboard  read-only ranking by SUM(points).
--
-- Points: places 1..10 → 25, 18, 15, 12, 10, 8, 6, 4, 2, 1; each of the two
-- honourable mentions → 1. Multiplied by tier_settings.multiplier for the
-- hackathon's approved_tier (Tier 1 = 2.0, Tier 2 = 1.5, Tier 3 = 1.0) and
-- rounded. A missing approved_tier or a missing tier_settings row means × 1.0.
--
-- Safe to run twice: CREATE TABLE/INDEX IF NOT EXISTS, CREATE OR REPLACE
-- FUNCTION, and every policy is dropped before it is re-created. The only
-- DELETE is inside publish/unpublish, scoped to one hackathon's ledger rows.
-- No existing RLS policy is loosened — points_ledger is a new table.

-- ---------------------------------------------------------------------------
-- 1. points_ledger
-- ---------------------------------------------------------------------------

create table if not exists public.points_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  hackathon_id uuid not null references public.hackathons (id) on delete cascade,
  points integer not null,
  reason text not null
    check (char_length(trim(reason)) between 1 and 200),
  created_at timestamptz not null default now()
);

create index if not exists points_ledger_user_id_idx
  on public.points_ledger (user_id);
create index if not exists points_ledger_hackathon_id_idx
  on public.points_ledger (hackathon_id);

alter table public.points_ledger enable row level security;

-- Everyone reads, nobody writes. The security-definer functions below are the
-- only writers, so there is deliberately no insert/update/delete policy.
grant select on public.points_ledger to anon, authenticated;
revoke insert, update, delete on public.points_ledger from anon, authenticated;

drop policy if exists "Anyone can read the points ledger" on public.points_ledger;
create policy "Anyone can read the points ledger"
  on public.points_ledger for select
  to anon, authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- 2. publish_results(hackathon_id)
-- ---------------------------------------------------------------------------
-- The organizer's single Publish action: mark the results public, then rebuild
-- the ledger for this hackathon so re-publishing can never duplicate points.

create or replace function public.publish_results(p_hackathon_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_multiplier numeric := 1.0;
  v_awarded integer := 0;
  v_total integer := 0;
begin
  if not public.is_hackathon_organizer(p_hackathon_id) then
    raise exception 'Only this hackathon''s organizer can publish its results.'
      using errcode = '42501';
  end if;

  -- Sets published = true and enforces the result-sheet rules (at least one
  -- place, exactly two honourable mentions).
  perform public.publish_hackathon_results(p_hackathon_id, true);

  select ts.multiplier
    into v_multiplier
  from public.tier_settings ts
  join public.hackathons h on h.approved_tier = ts.tier
  where h.id = p_hackathon_id;

  v_multiplier := coalesce(v_multiplier, 1.0);

  -- Rebuild: remove this hackathon's rows first, then insert once.
  delete from public.points_ledger l where l.hackathon_id = p_hackathon_id;

  insert into public.points_ledger (user_id, hackathon_id, points, reason)
  select
    r.user_id,
    p_hackathon_id,
    round(
      (case
         when r.honourable_mention then 1
         when r.place = 1 then 25
         when r.place = 2 then 18
         when r.place = 3 then 15
         when r.place = 4 then 12
         when r.place = 5 then 10
         when r.place = 6 then 8
         when r.place = 7 then 6
         when r.place = 8 then 4
         when r.place = 9 then 2
         when r.place = 10 then 1
         else 0
       end) * v_multiplier
    )::integer,
    case
      when r.honourable_mention then 'Honourable mention'
      else 'Place ' || r.place::text
    end
  from public.results r
  where r.hackathon_id = p_hackathon_id
    and (r.place is not null or r.honourable_mention);

  get diagnostics v_awarded = row_count;

  select coalesce(sum(l.points), 0)
    into v_total
  from public.points_ledger l
  where l.hackathon_id = p_hackathon_id;

  return jsonb_build_object(
    'hackathon_id', p_hackathon_id,
    'published', true,
    'awarded', v_awarded,
    'total_points', v_total,
    'multiplier', v_multiplier
  );
end;
$$;

revoke all on function public.publish_results(uuid) from public, anon;
grant execute on function public.publish_results(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. unpublish_results(hackathon_id)
-- ---------------------------------------------------------------------------
-- Unpublishing takes the results off the public page and removes exactly this
-- hackathon's points, so nobody keeps points for a hidden result sheet.

create or replace function public.unpublish_results(p_hackathon_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_removed integer := 0;
begin
  if not public.is_hackathon_organizer(p_hackathon_id) then
    raise exception 'Only this hackathon''s organizer can unpublish its results.'
      using errcode = '42501';
  end if;

  perform public.publish_hackathon_results(p_hackathon_id, false);

  delete from public.points_ledger l where l.hackathon_id = p_hackathon_id;
  get diagnostics v_removed = row_count;

  return jsonb_build_object(
    'hackathon_id', p_hackathon_id,
    'published', false,
    'removed', v_removed
  );
end;
$$;

revoke all on function public.unpublish_results(uuid) from public, anon;
grant execute on function public.unpublish_results(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. get_points_leaderboard(limit)
-- ---------------------------------------------------------------------------
-- Ranked by SUM(points). Profiles are owner-only, so this SECURITY DEFINER
-- function exposes exactly the two public fields the leaderboard shows: a
-- display name and a username.

create or replace function public.get_points_leaderboard(p_limit integer default 25)
returns table (
  position bigint,
  user_id uuid,
  full_name text,
  username text,
  total_points bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    row_number() over (order by sum(l.points) desc, min(p.created_at) asc) as position,
    p.id,
    p.full_name,
    p.username,
    sum(l.points)::bigint
  from public.points_ledger l
  join public.profiles p on p.id = l.user_id
  group by p.id, p.full_name, p.username
  having sum(l.points) > 0
  order by sum(l.points) desc, min(p.created_at) asc
  limit greatest(1, least(coalesce(p_limit, 25), 100));
$$;

revoke all on function public.get_points_leaderboard(integer) from public;
grant execute on function public.get_points_leaderboard(integer) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Reload the API schema so the new table and functions are visible to PostgREST
-- ---------------------------------------------------------------------------

notify pgrst, 'reload schema';
