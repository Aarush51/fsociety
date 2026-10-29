-- ---------------------------------------------------------------------------
-- Hackathon tiers: an organizer CLAIMS a tier, only an admin APPROVES one.
-- ---------------------------------------------------------------------------
-- Run this in the Supabase SQL editor (or with `supabase db push`) after
-- 20261026130000_add_admins.sql, which defines public.is_admin().
--
-- What this changes, in order
--   A. hackathons gains: claimed_tier, approved_tier, tier_reason,
--      expected_participants, prize_pool. Every column is nullable, so existing
--      rows keep their data and simply have no tier yet.
--   B. Check constraints (tier 1..3, positive participants, non-negative money).
--   C. public.protect_hackathon_tier() + trigger: a new row always starts with
--      approved_tier = null, and a non-admin update can never change it. This is
--      what makes "only an admin can set approved_tier" true even if a policy is
--      ever widened by accident.
--   D. Admins get an UPDATE policy on hackathons (policies are OR'ed, so no
--      existing policy is loosened and organizers still cannot update rows).
--
-- Safe to run twice: columns use IF NOT EXISTS, constraints are guarded by
-- pg_constraint, the function is CREATE OR REPLACE and every policy is dropped
-- before it is re-created. No table is dropped, nothing is truncated or deleted.
--
-- Could it affect existing data? No row is touched. The trigger only rewrites
-- approved_tier (a column that is null on every existing row) on future writes.
-- Existing RLS policies are unchanged and no new read access is granted.

-- ---------------------------------------------------------------------------
-- A. Columns
-- ---------------------------------------------------------------------------
-- claimed_tier       the organizer's claim from the host form
-- approved_tier      the only tier the app ever displays; admins only
-- tier_reason        why the organizer believes this tier fits (required by the form)
-- expected_participants  how many people the organizer expects
-- prize_pool         total prize money in rupees

alter table public.hackathons
  add column if not exists claimed_tier integer,
  add column if not exists approved_tier integer,
  add column if not exists tier_reason text,
  add column if not exists expected_participants integer,
  add column if not exists prize_pool numeric(12, 2);

-- ---------------------------------------------------------------------------
-- B. Constraints (idempotent, nullable so existing rows stay valid)
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'hackathons_claimed_tier_check'
      and conrelid = 'public.hackathons'::regclass
  ) then
    alter table public.hackathons
      add constraint hackathons_claimed_tier_check
      check (claimed_tier is null or claimed_tier between 1 and 3);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'hackathons_approved_tier_check'
      and conrelid = 'public.hackathons'::regclass
  ) then
    alter table public.hackathons
      add constraint hackathons_approved_tier_check
      check (approved_tier is null or approved_tier between 1 and 3);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'hackathons_tier_reason_check'
      and conrelid = 'public.hackathons'::regclass
  ) then
    alter table public.hackathons
      add constraint hackathons_tier_reason_check
      check (tier_reason is null or char_length(tier_reason) <= 1000);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'hackathons_expected_participants_check'
      and conrelid = 'public.hackathons'::regclass
  ) then
    alter table public.hackathons
      add constraint hackathons_expected_participants_check
      check (expected_participants is null or expected_participants > 0);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'hackathons_prize_pool_check'
      and conrelid = 'public.hackathons'::regclass
  ) then
    alter table public.hackathons
      add constraint hackathons_prize_pool_check
      check (prize_pool is null or prize_pool >= 0);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- C. Only an admin can ever set approved_tier
-- ---------------------------------------------------------------------------
-- INSERT: whoever inserts the row (organizer, seed, future service) the claim
--         is unapproved until an admin says otherwise.
-- UPDATE: a caller who is not an admin has approved_tier reset to the stored
--         value, so no client can approve its own claim.
-- public.is_admin() is SECURITY DEFINER, so this guard works without granting
-- anyone read access to public.admins.

create or replace function public.protect_hackathon_tier()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.approved_tier := null;
    return new;
  end if;

  if not public.is_admin() then
    new.approved_tier := old.approved_tier;
  end if;
  return new;
end;
$$;

revoke all on function public.protect_hackathon_tier() from public, anon, authenticated;

drop trigger if exists hackathons_protect_tier on public.hackathons;
create trigger hackathons_protect_tier
  before insert or update on public.hackathons
  for each row execute function public.protect_hackathon_tier();

-- ---------------------------------------------------------------------------
-- D. Admins can approve a tier
-- ---------------------------------------------------------------------------
-- The table-level grant is required before a policy can allow the write. It is
-- not a loosening: the only UPDATE policy on public.hackathons is the admin one
-- below, so organizers are still denied by RLS.

grant select on public.hackathons to anon, authenticated;
grant update on public.hackathons to authenticated;

drop policy if exists "Admins can review hackathon tiers" on public.hackathons;
create policy "Admins can review hackathon tiers"
  on public.hackathons for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Reload the API schema so the new columns and trigger are visible to PostgREST
-- ---------------------------------------------------------------------------

notify pgrst, 'reload schema';
