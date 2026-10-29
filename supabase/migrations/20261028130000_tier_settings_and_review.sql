-- ---------------------------------------------------------------------------
-- Tier settings, the admin review RPC, and re-review after a material edit.
-- ---------------------------------------------------------------------------
-- Safe to re-run: the table uses IF NOT EXISTS, the seed is an upsert, functions
-- use CREATE OR REPLACE, and every policy is dropped before it is re-created.
-- Nothing is dropped, truncated or deleted, and no existing row is modified.
--
-- What this adds
--   1. public.tier_settings   the three tiers, their examples and point
--                             multipliers (Tier 1 = 2.0, Tier 2 = 1.5,
--                             Tier 3 = 1.0). Readable by everyone, writable only
--                             by admins.
--   2. public.review_hackathon(id, decision, tier, note)
--                             admins only, SECURITY DEFINER, empty search_path.
--                             Approving needs a tier; rejecting needs a note; a
--                             tier lower than the organizer's claim needs a note.
--   3. Read policies          public sees approved events only, organizers see
--                             their own in any state, admins see everything.
--   4. The review trigger     now also sends an approved event back to pending
--                             when its title, venue, city, start, end, price or
--                             capacity is edited by someone who is not an admin.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Tier settings
-- ---------------------------------------------------------------------------

create table if not exists public.tier_settings (
  tier smallint primary key,
  label text not null,
  description text not null,
  examples text[] not null default '{}',
  criteria text not null,
  points_multiplier numeric(3, 2) not null default 1.00,
  updated_at timestamptz not null default now(),
  constraint tier_settings_tier_check check (tier between 1 and 3),
  constraint tier_settings_multiplier_check check (points_multiplier > 0)
);

-- Tier 1 is the HIGHEST level and Tier 3 the lowest. The examples match the
-- cards on the host form so an organizer reads the same wording in both places.
insert into public.tier_settings (tier, label, description, examples, criteria, points_multiplier)
values
  (
    1,
    'Tier 1 (highest)',
    'Flagship events with national reach.',
    array[
      'National or multi-college flagship event',
      '300+ participants',
      'Prize pool of ₹1,00,000 or more',
      'Well-known backing, industry judges, 24+ hours'
    ],
    'Flagship events, national or multi-college, 300+ participants, prize pool of ₹1,00,000 or more, well-known backing, industry judges, 24+ hours.',
    2.00
  ),
  (
    2,
    'Tier 2',
    'Solid college or company events.',
    array[
      'College or company hackathon',
      '100 to 300 participants',
      'Prize pool ₹20,000 to ₹1,00,000',
      'Mentors available'
    ],
    'Solid college or company events, 100 to 300 participants, prize pool ₹20,000 to ₹1,00,000, mentors.',
    1.50
  ),
  (
    3,
    'Tier 3',
    'Small, new or club-level events.',
    array[
      'Small, new or club-level event',
      'Under 100 participants',
      'Small or no prize pool',
      'First edition'
    ],
    'Small, new or club-level events, under 100 participants, small or no prize pool, first edition.',
    1.00
  )
on conflict (tier) do update
  set label = excluded.label,
      description = excluded.description,
      examples = excluded.examples,
      criteria = excluded.criteria,
      points_multiplier = excluded.points_multiplier,
      updated_at = now();

alter table public.tier_settings enable row level security;

grant select on public.tier_settings to anon, authenticated;
grant insert, update, delete on public.tier_settings to authenticated;

drop policy if exists "Anyone can read tier settings" on public.tier_settings;
create policy "Anyone can read tier settings"
  on public.tier_settings for select
  to anon, authenticated
  using (true);

-- Writes stay with admins. The policy covers insert, update and delete.
drop policy if exists "Admins can write tier settings" on public.tier_settings;
create policy "Admins can write tier settings"
  on public.tier_settings for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 2. review_hackathon
-- ---------------------------------------------------------------------------
-- One entry point for both decisions, so the rules live in one place:
--   * approve  requires p_tier 1..3
--   * reject   requires a note
--   * a tier LOWER than the organizer's claim (a bigger number) requires a note
--
-- The UPDATE below passes through enforce_hackathon_review_state, which lets an
-- admin change the review fields and blocks everyone else.

-- p_tier is integer on purpose. A smallint parameter cannot be called with a
-- plain integer literal (Postgres will not narrow it implicitly), which would
-- make both the SQL editor and PostgREST calls fail with 42883. The column stays
-- smallint; the value is cast on write.
-- The earlier smallint signature is removed if this file is re-run on a database
-- that already has it, so exactly one review_hackathon exists.
drop function if exists public.review_hackathon(uuid, text, smallint, text);

create or replace function public.review_hackathon(
  p_hackathon_id uuid,
  p_decision text,
  p_tier integer default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  decision text := lower(trim(coalesce(p_decision, '')));
  note text := nullif(trim(coalesce(p_note, '')), '');
  target record;
begin
  if caller is null then
    raise exception 'Log in as an admin to review a hackathon.';
  end if;
  if not public.is_admin() then
    raise exception 'Only admins can review hackathons.';
  end if;

  -- Locking the row keeps two reviewers from overwriting each other.
  select h.id, h.title, h.approval_status, h.tier, h.claimed_tier
  into target
  from public.hackathons h
  where h.id = p_hackathon_id
  for update;

  if not found then
    raise exception 'This hackathon does not exist.';
  end if;

  if decision in ('approve', 'approved') then
    if p_tier is null or p_tier < 1 or p_tier > 3 then
      raise exception 'Pick a tier from 1 to 3 before approving.';
    end if;

    -- Tier 1 is the highest, so a bigger number is a lower tier.
    if target.claimed_tier is not null and p_tier > target.claimed_tier and note is null then
      raise exception
        'Tier % is lower than the claimed Tier %. Add a note explaining why.',
        p_tier, target.claimed_tier;
    end if;

    update public.hackathons
    set approval_status = 'approved',
        tier = p_tier::smallint,
        tier_note = note,
        review_note = null,
        reviewed_by = caller,
        reviewed_at = now()
    where id = target.id;

    return jsonb_build_object(
      'hackathon_id', target.id,
      'approval_status', 'approved',
      'tier', p_tier,
      'tier_note', note,
      'review_note', null
    );
  end if;

  if decision in ('reject', 'rejected') then
    if note is null then
      raise exception 'Add a reason before rejecting a hackathon.';
    end if;

    update public.hackathons
    set approval_status = 'rejected',
        tier = null,
        tier_note = null,
        review_note = note,
        reviewed_by = caller,
        reviewed_at = now()
    where id = target.id;

    return jsonb_build_object(
      'hackathon_id', target.id,
      'approval_status', 'rejected',
      'tier', null,
      'tier_note', null,
      'review_note', note
    );
  end if;

  raise exception 'Decision must be approve or reject, not "%".', coalesce(p_decision, '');
end;
$$;

revoke all on function public.review_hackathon(uuid, text, integer, text)
  from public, anon;
grant execute on function public.review_hackathon(uuid, text, integer, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Who reads what
-- ---------------------------------------------------------------------------
-- Same rules as before, restated so this file stands on its own:
--   public       approved events that are upcoming or active
--   organizers   their own rows in any status
--   admins       every row

drop policy if exists "Anyone can view approved upcoming and active hackathons" on public.hackathons;
create policy "Anyone can view approved upcoming and active hackathons"
  on public.hackathons for select
  to anon, authenticated
  using (approval_status = 'approved' and status in ('upcoming', 'active'));

drop policy if exists "Organizers can view their own hackathons" on public.hackathons;
create policy "Organizers can view their own hackathons"
  on public.hackathons for select
  to authenticated
  using (organization_id = public.current_organization_id());

drop policy if exists "Admins can read every hackathon" on public.hackathons;
create policy "Admins can read every hackathon"
  on public.hackathons for select
  to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 4. A material edit after approval goes back to pending
-- ---------------------------------------------------------------------------
-- Unchanged from the previous version: a non-admin insert is forced to pending
-- with no tier, and a non-admin update cannot touch the review fields. The new
-- part is the material change check at the end.

create or replace function public.enforce_hackathon_review_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_is_admin boolean := coalesce(public.is_admin(), false);
  material_change boolean := false;
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

  -- An admin's edit is a review action, so it is left alone.
  if caller_is_admin then
    return new;
  end if;

  new.approval_status := old.approval_status;
  new.tier := old.tier;
  new.tier_note := old.tier_note;
  new.reviewed_by := old.reviewed_by;
  new.reviewed_at := old.reviewed_at;
  new.review_note := old.review_note;

  material_change :=
       new.title is distinct from old.title
    or new.venue_name is distinct from old.venue_name
    or new.city is distinct from old.city
    or new.starts_at is distinct from old.starts_at
    or new.ends_at is distinct from old.ends_at
    or new.price is distinct from old.price
    or new.capacity is distinct from old.capacity;

  if material_change and old.approval_status = 'approved' then
    new.approval_status := 'pending';
    new.tier := null;
    new.tier_note := null;
    new.reviewed_by := null;
    new.reviewed_at := null;
    new.review_note := null;
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
-- 5. Reload the API schema
-- ---------------------------------------------------------------------------

notify pgrst, 'reload schema';
