-- ===========================================================================
-- HackMate: teammate reviews after a hackathon ends
-- ---------------------------------------------------------------------------
-- The existing public.reviews table is NOT touched. This adds a separate table
-- for "review every other teammate once the event is over".
--
-- What it adds, in order
--   1. public.teammate_reviews
--        id, hackathon_id, reviewer_id, reviewee_id, rating 1-5, comment,
--        created_at, unique (hackathon_id, reviewer_id, reviewee_id),
--        reviewer <> reviewee
--   2. RLS: a member may insert only as themselves (and only for a teammate
--      from that hackathon, after it finished) and may read only the reviews
--      they wrote or received. No UPDATE, no DELETE.
--   3. public.can_review_teammate(hackathon_id, reviewee_id)  eligibility rule
--   4. public.pending_teammate_review_count()                 how many are left
--   5. public.get_teammate_reviews()                          one read for the
--                                                            Huddle Reviews tab
--   6. A BEFORE INSERT trigger on public.registrations that rejects a new
--      registration while reviews are pending.
--
-- Data impact: none on existing rows. Nothing is dropped, truncated or deleted,
-- and no existing policy, grant or function is loosened.
-- Safe to run twice: create table/index if not exists, create or replace
-- functions, drop policy/trigger if exists before re-creating them.
-- Dependencies: 20261016231643 (teams, team_members, profiles, hackathons),
--               20261029121000 (public.reports file, for the same schema habits).
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Table
-- ---------------------------------------------------------------------------

create table if not exists public.teammate_reviews (
  id uuid primary key default gen_random_uuid(),
  hackathon_id uuid not null references public.hackathons (id) on delete cascade,
  reviewer_id uuid not null references public.profiles (id) on delete cascade,
  reviewee_id uuid not null references public.profiles (id) on delete cascade,
  rating integer not null
    check (rating between 1 and 5),
  comment text
    check (comment is null or char_length(btrim(comment)) <= 1000),
  created_at timestamptz not null default now(),
  constraint teammate_reviews_no_self check (reviewer_id <> reviewee_id),
  constraint teammate_reviews_pair_key
    unique (hackathon_id, reviewer_id, reviewee_id)
);

create index if not exists teammate_reviews_reviewee_idx
  on public.teammate_reviews (reviewee_id, created_at desc);
create index if not exists teammate_reviews_reviewer_idx
  on public.teammate_reviews (reviewer_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 2. Eligibility rule
--    True only when the caller shared a team with the reviewee in that
--    hackathon AND the hackathon has already ended.
-- ---------------------------------------------------------------------------

create or replace function public.can_review_teammate(
  p_hackathon_id uuid,
  p_reviewee_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.team_members mine
    join public.teams t on t.id = mine.team_id
    join public.hackathons h on h.id = t.hackathon_id
    join public.team_members other
      on other.team_id = mine.team_id
     and other.user_id = p_reviewee_id
    where mine.user_id = (select auth.uid())
      and (select auth.uid()) is not null
      and t.hackathon_id = p_hackathon_id
      and p_reviewee_id <> (select auth.uid())
      and h.ends_at < now()
  );
$$;

comment on function public.can_review_teammate(uuid, uuid) is
  'True when the caller was on the same team as p_reviewee_id in an ended hackathon.';

-- ---------------------------------------------------------------------------
-- 3. How many reviews are still owed (used by the registration gate)
-- ---------------------------------------------------------------------------

create or replace function public.pending_teammate_review_count()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(distinct (t.hackathon_id, other.user_id))::integer
  from public.team_members mine
  join public.teams t on t.id = mine.team_id
  join public.hackathons h on h.id = t.hackathon_id
  join public.team_members other
    on other.team_id = mine.team_id
   and other.user_id <> mine.user_id
  left join public.teammate_reviews tr
    on tr.hackathon_id = t.hackathon_id
   and tr.reviewer_id = mine.user_id
   and tr.reviewee_id = other.user_id
  where mine.user_id = (select auth.uid())
    and (select auth.uid()) is not null
    and h.ends_at < now()
    and tr.id is null;
$$;

comment on function public.pending_teammate_review_count() is
  'Teammates from ended hackathons the caller has not reviewed yet.';

-- ---------------------------------------------------------------------------
-- 4. One read for the Huddle Reviews tab
--    pending -> who is still owed a review
--    written -> reviews the caller left
--    received -> reviews the caller got
-- ---------------------------------------------------------------------------

create or replace function public.get_teammate_reviews()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select (select auth.uid()) as uid
  ),
  pending as (
    select
      h.id as hackathon_id,
      h.title as hackathon_title,
      h.slug as hackathon_slug,
      t.id as team_id,
      t.name as team_name,
      other.user_id as reviewee_id,
      p.full_name as reviewee_name,
      p.friend_code as reviewee_friend_code,
      h.ends_at
    from public.team_members mine
    join public.teams t on t.id = mine.team_id
    join public.hackathons h on h.id = t.hackathon_id
    join public.team_members other
      on other.team_id = mine.team_id
     and other.user_id <> mine.user_id
    join public.profiles p on p.id = other.user_id
    left join public.teammate_reviews tr
      on tr.hackathon_id = h.id
     and tr.reviewer_id = mine.user_id
     and tr.reviewee_id = other.user_id
    where mine.user_id = (select uid from me)
      and h.ends_at < now()
      and tr.id is null
  ),
  written as (
    select
      tr.id,
      tr.hackathon_id,
      h.title as hackathon_title,
      tr.reviewee_id,
      p.full_name as reviewee_name,
      tr.rating,
      tr.comment,
      tr.created_at
    from public.teammate_reviews tr
    join public.hackathons h on h.id = tr.hackathon_id
    join public.profiles p on p.id = tr.reviewee_id
    where tr.reviewer_id = (select uid from me)
  ),
  received as (
    select
      tr.id,
      tr.hackathon_id,
      h.title as hackathon_title,
      tr.reviewer_id,
      p.full_name as reviewer_name,
      tr.rating,
      tr.comment,
      tr.created_at
    from public.teammate_reviews tr
    join public.hackathons h on h.id = tr.hackathon_id
    join public.profiles p on p.id = tr.reviewer_id
    where tr.reviewee_id = (select uid from me)
  )
  select jsonb_build_object(
    'pending', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'hackathon_id', pe.hackathon_id,
          'hackathon_title', pe.hackathon_title,
          'hackathon_slug', pe.hackathon_slug,
          'team_id', pe.team_id,
          'team_name', pe.team_name,
          'reviewee_id', pe.reviewee_id,
          'reviewee_name', pe.reviewee_name,
          'reviewee_friend_code', pe.reviewee_friend_code
        )
        order by pe.ends_at desc, lower(coalesce(pe.reviewee_name, ''))
      )
      from pending pe
    ), '[]'::jsonb),
    'written', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', w.id,
          'hackathon_id', w.hackathon_id,
          'hackathon_title', w.hackathon_title,
          'reviewee_id', w.reviewee_id,
          'reviewee_name', w.reviewee_name,
          'rating', w.rating,
          'comment', w.comment,
          'created_at', w.created_at
        )
        order by w.created_at desc
      )
      from written w
    ), '[]'::jsonb),
    'received', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', r.id,
          'hackathon_id', r.hackathon_id,
          'hackathon_title', r.hackathon_title,
          'reviewer_id', r.reviewer_id,
          'reviewer_name', r.reviewer_name,
          'rating', r.rating,
          'comment', r.comment,
          'created_at', r.created_at
        )
        order by r.created_at desc
      )
      from received r
    ), '[]'::jsonb)
  );
$$;

comment on function public.get_teammate_reviews() is
  'Pending, written and received teammate reviews for the signed-in member.';

-- ---------------------------------------------------------------------------
-- 5. Registration gate
--    registrations is function-only (direct INSERT is revoked), so this trigger
--    is the one place that covers every registration path.
-- ---------------------------------------------------------------------------

create or replace function public.registrations_require_teammate_reviews()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- auth.uid() is the registering member inside register_for_hackathon().
  if new.user_id = (select auth.uid())
     and public.pending_teammate_review_count() > 0 then
    raise exception 'Review your teammates from your finished hackathon before registering for a new one. Open The Huddle → Reviews.';
  end if;
  return new;
end;
$$;

drop trigger if exists registrations_require_teammate_reviews on public.registrations;
create trigger registrations_require_teammate_reviews
  before insert on public.registrations
  for each row execute function public.registrations_require_teammate_reviews();

-- ---------------------------------------------------------------------------
-- 6. Row Level Security
-- ---------------------------------------------------------------------------

alter table public.teammate_reviews enable row level security;

revoke all on public.teammate_reviews from public, anon, authenticated;
grant select, insert on public.teammate_reviews to authenticated;
-- Deliberately no UPDATE or DELETE grant: a review is a one-time record.

drop policy if exists "Members read reviews they wrote or received" on public.teammate_reviews;
create policy "Members read reviews they wrote or received"
  on public.teammate_reviews for select
  to authenticated
  using (
    reviewer_id = (select auth.uid())
    or reviewee_id = (select auth.uid())
  );

drop policy if exists "Members review their own teammates" on public.teammate_reviews;
create policy "Members review their own teammates"
  on public.teammate_reviews for insert
  to authenticated
  with check (
    reviewer_id = (select auth.uid())
    and public.can_review_teammate(hackathon_id, reviewee_id)
  );

-- ---------------------------------------------------------------------------
-- 7. Grants
-- ---------------------------------------------------------------------------

revoke all on function public.can_review_teammate(uuid, uuid) from public, anon;
revoke all on function public.pending_teammate_review_count() from public, anon;
revoke all on function public.get_teammate_reviews() from public, anon;
revoke all on function public.registrations_require_teammate_reviews() from public, anon;

grant execute on function public.can_review_teammate(uuid, uuid) to authenticated;
grant execute on function public.pending_teammate_review_count() to authenticated;
grant execute on function public.get_teammate_reviews() to authenticated;
grant execute on function public.registrations_require_teammate_reviews() to authenticated;

commit;

-- ---------------------------------------------------------------------------
-- Verification (read-only unless noted; run while signed in as a member)
--
--   select public.pending_teammate_review_count();
--   select public.get_teammate_reviews();
--
--   -- Inserting your own review for a teammate from an ended hackathon works:
--   -- insert into public.teammate_reviews (hackathon_id, reviewer_id, reviewee_id, rating)
--   -- values ('<hackathon>', (select auth.uid()), '<teammate>', 5);
--
--   -- A second review for the same pair fails on teammate_reviews_pair_key.
--   -- Inserting as someone else fails the RLS policy.
--   -- A registration with reviews pending raises the gate message.
-- ---------------------------------------------------------------------------

notify pgrst, 'reload schema';
