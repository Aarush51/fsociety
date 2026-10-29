-- ---------------------------------------------------------------------------
-- Hackathon tier claims, expected size, prize pool, and admin tier review.
-- ---------------------------------------------------------------------------
-- Safe to re-run and safe on live data:
--   * every column uses IF NOT EXISTS, so nothing is re-created or dropped
--   * functions use CREATE OR REPLACE, policies are dropped before re-created
--   * no table is dropped, nothing is truncated, no row is deleted
--   * existing rows are untouched: an approved hackathon stays approved and
--     visible, and keeps whatever tier columns it already had
--
-- What changes
--   1. hackathons gains the organizer's tier claim, the expected participant
--      count, the numeric prize pool, and the admin review fields.
--   2. A trigger forces every non-admin insert to 'pending' and clears tier,
--      tier_note, reviewed_by, reviewed_at and review_note. On update it puts
--      those fields back to their stored value, so an organizer can never set
--      their own tier or approve themselves.
--   3. Admins get an update policy (plus the UPDATE grant it needs) so they can
--      set the final tier. No other role gets an update policy, so organizers
--      still cannot change a review field even with the grant in place.
--   4. The public SELECT policy now also requires approval_status = 'approved',
--      so a pending event (for example a claimed Tier 1 hackathon) is hidden
--      from Home, Hackathons, the detail page and registration. Organizers keep
--      reading their own pending rows through their existing policy.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------

alter table public.hackathons
  add column if not exists claimed_tier smallint,
  add column if not exists claimed_tier_reason text,
  add column if not exists expected_participants integer,
  add column if not exists prize_pool numeric(12, 2) not null default 0,
  add column if not exists tier smallint,
  add column if not exists tier_note text,
  add column if not exists reviewed_by uuid references auth.users (id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_note text;

-- team_size_max arrived with the team formation migration. Say the default
-- again so this file leaves the column exactly as the form expects it.
alter table public.hackathons
  alter column team_size_max set default 4;

-- Constraints are added separately: ADD COLUMN IF NOT EXISTS silently skips a
-- column that already exists, so its checks have to be guarded by name.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.hackathons'::regclass
      and conname = 'hackathons_claimed_tier_check'
  ) then
    alter table public.hackathons
      add constraint hackathons_claimed_tier_check
      check (claimed_tier is null or claimed_tier between 1 and 3);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.hackathons'::regclass
      and conname = 'hackathons_claimed_tier_reason_check'
  ) then
    alter table public.hackathons
      add constraint hackathons_claimed_tier_reason_check
      check (claimed_tier_reason is null or char_length(claimed_tier_reason) <= 600);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.hackathons'::regclass
      and conname = 'hackathons_expected_participants_check'
  ) then
    alter table public.hackathons
      add constraint hackathons_expected_participants_check
      check (expected_participants is null or expected_participants between 1 and 1000000);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.hackathons'::regclass
      and conname = 'hackathons_prize_pool_check'
  ) then
    alter table public.hackathons
      add constraint hackathons_prize_pool_check
      check (prize_pool >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.hackathons'::regclass
      and conname = 'hackathons_tier_check'
  ) then
    alter table public.hackathons
      add constraint hackathons_tier_check
      check (tier is null or tier between 1 and 3);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.hackathons'::regclass
      and conname = 'hackathons_tier_note_check'
  ) then
    alter table public.hackathons
      add constraint hackathons_tier_note_check
      check (tier_note is null or char_length(tier_note) <= 1000);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.hackathons'::regclass
      and conname = 'hackathons_review_note_check'
  ) then
    alter table public.hackathons
      add constraint hackathons_review_note_check
      check (review_note is null or char_length(review_note) <= 1000);
  end if;
end;
$$;

create index if not exists hackathons_approval_status_idx
  on public.hackathons (approval_status);

-- ---------------------------------------------------------------------------
-- 2. Review state is server-owned
-- ---------------------------------------------------------------------------
-- public.is_admin() is SECURITY DEFINER with an empty search_path and reads
-- auth.uid(), so it answers correctly inside a trigger. With no JWT (the SQL
-- editor, service-role jobs) it is false, which is the safe default: an insert
-- that is not made by an admin always lands pending.

create or replace function public.enforce_hackathon_review_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_is_admin boolean := coalesce(public.is_admin(), false);
begin
  if tg_op = 'INSERT' then
    if not caller_is_admin then
      new.approval_status := 'pending';
      new.tier := null;
      new.tier_note := null;
      new.reviewed_by := null;
      new.reviewed_at := null;
      new.review_note := null;
    end if;
    return new;
  end if;

  -- UPDATE: an organizer may edit their own event, but never its review state.
  if not caller_is_admin then
    new.approval_status := old.approval_status;
    new.tier := old.tier;
    new.tier_note := old.tier_note;
    new.reviewed_by := old.reviewed_by;
    new.reviewed_at := old.reviewed_at;
    new.review_note := old.review_note;
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_hackathon_review_state()
  from public, anon, authenticated;

drop trigger if exists hackathons_enforce_review_state on public.hackathons;
create trigger hackathons_enforce_review_state
  before insert or update on public.hackathons
  for each row execute function public.enforce_hackathon_review_state();

-- ---------------------------------------------------------------------------
-- 3. Admin review access
-- ---------------------------------------------------------------------------
-- The grant is required for the policy below to be usable. It does not widen
-- anything by itself: rows are still filtered by RLS, and only the admin policy
-- allows an UPDATE. Organizers remain read/insert only.

grant update on public.hackathons to authenticated;

drop policy if exists "Admins can review hackathons" on public.hackathons;
create policy "Admins can review hackathons"
  on public.hackathons for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 4. Pending events stay private
-- ---------------------------------------------------------------------------
-- The original policy only looked at status, so a pending event with
-- status = 'upcoming' was readable by everyone. Approval is now required too.
-- Organizers still read their own rows through
-- "Organizers can view their own hackathons", and admins through
-- "Admins can read every hackathon".

drop policy if exists "Anyone can view upcoming and active hackathons" on public.hackathons;
drop policy if exists "Anyone can view approved upcoming and active hackathons" on public.hackathons;
create policy "Anyone can view approved upcoming and active hackathons"
  on public.hackathons for select
  to anon, authenticated
  using (status in ('upcoming', 'active') and approval_status = 'approved');

-- ---------------------------------------------------------------------------
-- 5. Make PostgREST pick up the new columns immediately
-- ---------------------------------------------------------------------------

notify pgrst, 'reload schema';
