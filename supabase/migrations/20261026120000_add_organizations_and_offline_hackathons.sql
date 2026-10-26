-- Organizer accounts for OFFLINE (in-person) hackathons.
--
-- Run this in the Supabase SQL editor (or with `supabase db push`). It is safe
-- to re-run: new columns use IF NOT EXISTS and every policy is dropped before it
-- is recreated.
--
-- What it does
--   1. public.organizations    organizer accounts + manual approval
--   2. hackathons              venue, address, city, maps link, capacity, price
--                              (and the columns the host form saves)
--   3. public.registrations    participant sign-ups, unique per hackathon+user
--   4. RLS
--        organizations  owners read/insert/update their own row, status is forced
--                       to 'pending' on insert and can never be changed by the
--                       owner afterwards; anyone can read approved organizations
--        hackathons     only an approved organization that owns the row can
--                       insert; organizers can read their own rows
--        registrations  participants read/insert their own row; organizers read
--                       the registrations for their own hackathons
--   5. Two read helpers so the app can show a public registration count and the
--      organizer's own hackathons without loosening RLS.
--
-- Manual approval for testing: change `status` to 'approved' (and optionally set
-- `review_note`) for the row in Table editor → organizations.

-- ---------------------------------------------------------------------------
-- 1. organizations
-- ---------------------------------------------------------------------------

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users (id) on delete cascade,
  org_name text not null
    check (char_length(trim(org_name)) between 2 and 160),
  org_type text not null
    check (org_type in ('college_club', 'company', 'community', 'individual')),
  contact_email text not null
    check (char_length(trim(contact_email)) between 3 and 160),
  phone text not null
    check (char_length(trim(phone)) between 6 and 24),
  city text not null
    check (char_length(trim(city)) between 2 and 100),
  address text not null
    check (char_length(trim(address)) between 4 and 300),
  website text
    check (website is null or char_length(website) <= 300),
  description text not null
    check (char_length(trim(description)) between 20 and 2000),
  proof_url text not null
    check (char_length(trim(proof_url)) between 8 and 500),
  coordinator_name text
    check (coordinator_name is null or char_length(coordinator_name) <= 120),
  coordinator_email text
    check (coordinator_email is null or char_length(coordinator_email) <= 160),
  signed_name text not null
    check (char_length(trim(signed_name)) between 2 and 120),
  agreed_at timestamptz not null default now(),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  review_note text
    check (review_note is null or char_length(review_note) <= 1000),
  created_at timestamptz not null default now(),
  -- College clubs must name a faculty coordinator.
  constraint organizations_college_coordinator_check
    check (
      org_type <> 'college_club'
      or (coordinator_name is not null and coordinator_email is not null)
    )
);

create index if not exists organizations_status_idx on public.organizations (status);

-- A new row always starts pending and the signature is always stamped server
-- side, so a client can never approve itself.
create or replace function public.prepare_organization_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.status := 'pending';
  new.review_note := null;
  new.agreed_at := now();
  if new.org_type <> 'college_club' then
    new.coordinator_name := null;
    new.coordinator_email := null;
  end if;
  return new;
end;
$$;

-- The owner may edit their own details, but never their own review state.
create or replace function public.protect_organization_review_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and (select auth.uid()) = old.owner_id then
    new.status := old.status;
    new.review_note := old.review_note;
    new.agreed_at := old.agreed_at;
    new.owner_id := old.owner_id;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

revoke all on function public.prepare_organization_insert() from public, anon, authenticated;
revoke all on function public.protect_organization_review_state() from public, anon, authenticated;

drop trigger if exists organizations_prepare_insert on public.organizations;
create trigger organizations_prepare_insert
  before insert on public.organizations
  for each row execute function public.prepare_organization_insert();

drop trigger if exists organizations_protect_review_state on public.organizations;
create trigger organizations_protect_review_state
  before update on public.organizations
  for each row execute function public.protect_organization_review_state();

alter table public.organizations enable row level security;

grant select on public.organizations to anon, authenticated;
grant insert, update on public.organizations to authenticated;

drop policy if exists "Anyone can read approved organizations" on public.organizations;
create policy "Anyone can read approved organizations"
  on public.organizations for select
  to anon, authenticated
  using (status = 'approved');

drop policy if exists "Owners can read their own organization" on public.organizations;
create policy "Owners can read their own organization"
  on public.organizations for select
  to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists "Owners can register their own organization" on public.organizations;
create policy "Owners can register their own organization"
  on public.organizations for insert
  to authenticated
  with check (owner_id = (select auth.uid()) and status = 'pending');

drop policy if exists "Owners can edit their own organization" on public.organizations;
create policy "Owners can edit their own organization"
  on public.organizations for update
  to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 2. hackathons: offline venue + pricing
-- ---------------------------------------------------------------------------
-- starts_at and ends_at already exist on the table and are reused as the event
-- start/end date and time.

alter table public.hackathons
  add column if not exists organization_id uuid
    references public.organizations (id) on delete set null,
  add column if not exists venue_name text
    check (venue_name is null or char_length(venue_name) <= 200),
  add column if not exists address text
    check (address is null or char_length(address) <= 400),
  add column if not exists city text
    check (city is null or char_length(city) <= 120),
  add column if not exists maps_url text
    check (maps_url is null or char_length(maps_url) <= 500),
  add column if not exists capacity integer
    check (capacity is null or capacity > 0),
  add column if not exists price numeric(10, 2) not null default 0
    check (price >= 0),
  add column if not exists banner_url text
    check (banner_url is null or char_length(banner_url) <= 500),
  add column if not exists theme_tags text[] not null default '{}',
  add column if not exists rules text
    check (rules is null or char_length(rules) <= 5000),
  add column if not exists prize_details text
    check (prize_details is null or char_length(prize_details) <= 2000);

create index if not exists hackathons_organization_id_idx
  on public.hackathons (organization_id);

-- Helpers used by the policies below. SECURITY DEFINER so a policy never has to
-- re-open another table's RLS policies mid-query.
create or replace function public.current_organization_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select o.id
  from public.organizations o
  where o.owner_id = (select auth.uid());
$$;

create or replace function public.can_host_hackathons()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organizations o
    where o.owner_id = (select auth.uid())
      and o.status = 'approved'
  );
$$;

create or replace function public.is_hackathon_organizer(p_hackathon_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.hackathons h
    join public.organizations o on o.id = h.organization_id
    where h.id = p_hackathon_id
      and o.owner_id = (select auth.uid())
  );
$$;

revoke all on function public.current_organization_id() from public, anon;
revoke all on function public.can_host_hackathons() from public, anon;
revoke all on function public.is_hackathon_organizer(uuid) from public, anon;

grant execute on function public.current_organization_id() to authenticated;
grant execute on function public.can_host_hackathons() to authenticated;
grant execute on function public.is_hackathon_organizer(uuid) to authenticated;

grant select on public.hackathons to anon, authenticated;
grant insert on public.hackathons to authenticated;

drop policy if exists "Approved organizations can host hackathons" on public.hackathons;
create policy "Approved organizations can host hackathons"
  on public.hackathons for insert
  to authenticated
  with check (
    organization_id is not null
    and organization_id = public.current_organization_id()
    and created_by = (select auth.uid())
    and status = 'upcoming'
    and public.can_host_hackathons()
  );

drop policy if exists "Organizers can view their own hackathons" on public.hackathons;
create policy "Organizers can view their own hackathons"
  on public.hackathons for select
  to authenticated
  using (organization_id = public.current_organization_id());

-- ---------------------------------------------------------------------------
-- 3. registrations
-- ---------------------------------------------------------------------------
-- user_id follows the rest of the schema and points at public.profiles, which
-- is created automatically for every new auth user.

create table if not exists public.registrations (
  id uuid primary key default gen_random_uuid(),
  hackathon_id uuid not null references public.hackathons (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  paid boolean not null default false,
  created_at timestamptz not null default now(),
  constraint registrations_hackathon_user_key unique (hackathon_id, user_id)
);

create index if not exists registrations_hackathon_id_idx
  on public.registrations (hackathon_id);
create index if not exists registrations_user_id_idx
  on public.registrations (user_id);

alter table public.registrations enable row level security;

grant select, insert on public.registrations to authenticated;

drop policy if exists "Participants can read their own registrations" on public.registrations;
create policy "Participants can read their own registrations"
  on public.registrations for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Participants can register themselves" on public.registrations;
create policy "Participants can register themselves"
  on public.registrations for insert
  to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "Organizers can read registrations for their hackathons" on public.registrations;
create policy "Organizers can read registrations for their hackathons"
  on public.registrations for select
  to authenticated
  using (public.is_hackathon_organizer(hackathon_id));

-- ---------------------------------------------------------------------------
-- 4. Read helper: public registration count for one hackathon
-- ---------------------------------------------------------------------------
-- Participants cannot select other people's rows, so the count (and the
-- caller's own registration) come from this one call. It returns counts only,
-- never who registered.

create or replace function public.get_hackathon_registration_info(p_hackathon_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'hackathon_id', p_hackathon_id,
    'registered_count', (
      select count(*) from public.registrations r where r.hackathon_id = p_hackathon_id
    ),
    'capacity', (
      select h.capacity from public.hackathons h where h.id = p_hackathon_id
    ),
    'price', (
      select h.price from public.hackathons h where h.id = p_hackathon_id
    ),
    'my_registration', (
      select jsonb_build_object('id', r.id, 'paid', r.paid, 'created_at', r.created_at)
      from public.registrations r
      where r.hackathon_id = p_hackathon_id
        and r.user_id = (select auth.uid())
    )
  );
$$;

revoke all on function public.get_hackathon_registration_info(uuid) from public;
grant execute on function public.get_hackathon_registration_info(uuid) to anon, authenticated;
