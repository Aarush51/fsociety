-- ---------------------------------------------------------------------------
-- Tier settings + admin hackathon review
-- ---------------------------------------------------------------------------
-- Run after 20261029120000_add_hackathon_tiers.sql (the tier columns and the
-- approved_tier guard) and 20261026130000_add_admins.sql (public.is_admin()).
--
-- What this adds, in order
--   1. public.tier_settings   tier (1..3) → multiplier, seeded 1 = 2.0,
--                             2 = 1.5, 3 = 1.0. Readable by everyone, writable
--                             only by admins. RLS is enabled.
--   2. public.review_hackathon(hackathon_id, decision, tier)
--                             the only way an approval is recorded: admins only,
--                             sets approval_status and approved_tier together.
--
-- Safe to run twice: the table uses IF NOT EXISTS, the seed uses ON CONFLICT DO
-- NOTHING (so an admin's edited multiplier is never overwritten), the function
-- is CREATE OR REPLACE and every policy is dropped before it is re-created.
-- No table is dropped, nothing is truncated or deleted, and no existing policy
-- is loosened (new policies are additive; tier_settings starts empty).

-- ---------------------------------------------------------------------------
-- 1. tier_settings
-- ---------------------------------------------------------------------------
-- multiplier is the weight an event's tier carries wherever tiers are ranked or
-- compared. It is data, not code, so an admin can retune it without a deploy.

create table if not exists public.tier_settings (
  tier integer primary key,
  multiplier numeric not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tier_settings_tier_check check (tier between 1 and 3),
  constraint tier_settings_multiplier_check check (multiplier > 0)
);

-- Seed the three tiers. ON CONFLICT DO NOTHING keeps a re-run harmless and never
-- clobbers a multiplier an admin has changed.
insert into public.tier_settings (tier, multiplier)
values (1, 2.0), (2, 1.5), (3, 1.0)
on conflict (tier) do nothing;

drop trigger if exists tier_settings_set_updated_at on public.tier_settings;
create trigger tier_settings_set_updated_at
  before update on public.tier_settings
  for each row execute function public.set_updated_at();

alter table public.tier_settings enable row level security;

-- Everyone may read the weights; only admins may change them. There is
-- deliberately no DELETE policy: a tier row is never removed.
grant select on public.tier_settings to anon, authenticated;
grant insert, update on public.tier_settings to authenticated;

drop policy if exists "Anyone can read tier settings" on public.tier_settings;
create policy "Anyone can read tier settings"
  on public.tier_settings for select
  to anon, authenticated
  using (true);

drop policy if exists "Admins can add tier settings" on public.tier_settings;
create policy "Admins can add tier settings"
  on public.tier_settings for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "Admins can update tier settings" on public.tier_settings;
create policy "Admins can update tier settings"
  on public.tier_settings for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 2. review_hackathon(hackathon_id, decision, tier)
-- ---------------------------------------------------------------------------
-- A single, admin-only entry point so an approval can never set one of
-- approval_status / approved_tier without the other.
--
--   p_decision = 'approved'  → approval_status = 'approved', approved_tier = p_tier
--                              (a tier of 1, 2 or 3 is required), and a draft
--                              event is moved to 'upcoming' so it publishes.
--   p_decision = 'rejected'  → approval_status = 'rejected', approved_tier = null.
--
-- `status` (upcoming/active/completed/cancelled) is otherwise left alone, so an
-- approval never reopens or unpublishes an event that already ran.

create or replace function public.review_hackathon(
  p_hackathon_id uuid,
  p_decision text,
  p_tier integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_decision text := lower(trim(coalesce(p_decision, '')));
  v_row public.hackathons;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can review a hackathon.'
      using errcode = '42501';
  end if;

  if v_decision not in ('approved', 'rejected') then
    raise exception 'Decision must be approved or rejected.'
      using errcode = '22023';
  end if;

  if v_decision = 'approved' and (p_tier is null or p_tier not between 1 and 3) then
    raise exception 'Approving a hackathon requires a tier of 1, 2 or 3.'
      using errcode = '22023';
  end if;

  update public.hackathons
     set approval_status = v_decision,
         approved_tier = case when v_decision = 'approved' then p_tier else null end,
         status = case
                    when v_decision = 'approved' and status = 'draft' then 'upcoming'
                    else status
                  end
   where id = p_hackathon_id
   returning * into v_row;

  if v_row.id is null then
    raise exception 'That hackathon does not exist.'
      using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'id', v_row.id,
    'slug', v_row.slug,
    'title', v_row.title,
    'approval_status', v_row.approval_status,
    'approved_tier', v_row.approved_tier,
    'status', v_row.status
  );
end;
$$;

revoke all on function public.review_hackathon(uuid, text, integer) from public, anon;
grant execute on function public.review_hackathon(uuid, text, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Reload the API schema so the new table and function are visible to PostgREST
-- ---------------------------------------------------------------------------

notify pgrst, 'reload schema';
