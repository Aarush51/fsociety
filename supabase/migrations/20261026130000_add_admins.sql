-- ---------------------------------------------------------------------------
-- Admins: review organizations before they can host hackathons.
-- ---------------------------------------------------------------------------
-- Re-runnable: the table uses IF NOT EXISTS and every policy is dropped before
-- it is re-created. Nothing here loosens an existing policy: policies are OR'ed,
-- so normal users keep exactly the access they had before.
--
-- Add a review with the `insert` from the bottom of the file (run in Supabase),
-- never from the client: there is deliberately no write policy on public.admins.

-- ---------------------------------------------------------------------------
-- 1. public.admins
-- ---------------------------------------------------------------------------

create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admins enable row level security;

-- Read-only through the client: a signed-in user may see only their own row,
-- and no insert/update/delete policy exists, so writes are always denied even
-- if a grant is ever added back by accident.
grant select on public.admins to authenticated;
revoke insert, update, delete on public.admins from anon, authenticated;

drop policy if exists "Admins can read their own row" on public.admins;
create policy "Admins can read their own row"
  on public.admins for select
  to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 2. public.is_admin()
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER so the caller does not need the admins read policy for other
-- rows, and search_path is empty so nothing in public can shadow the names.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admins a
    where a.user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. organizations: admins can read every row and review any row
-- ---------------------------------------------------------------------------
-- The existing triggers still apply: organizations_prepare_insert stamps new
-- rows as pending, and organizations_protect_review_state restores status,
-- review_note, agreed_at, owner_id and created_at whenever the caller is the
-- owner, so an owner can never approve themselves even with these policies.

drop policy if exists "Admins can read every organization" on public.organizations;
create policy "Admins can read every organization"
  on public.organizations for select
  to authenticated
  using (public.is_admin());

drop policy if exists "Admins can review organizations" on public.organizations;
create policy "Admins can review organizations"
  on public.organizations for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 4. hackathons and registrations: admins can read every row
-- ---------------------------------------------------------------------------

drop policy if exists "Admins can read every hackathon" on public.hackathons;
create policy "Admins can read every hackathon"
  on public.hackathons for select
  to authenticated
  using (public.is_admin());

drop policy if exists "Admins can read every registration" on public.registrations;
create policy "Admins can read every registration"
  on public.registrations for select
  to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 5. Make yourself an admin (run this once, in the Supabase SQL editor)
-- ---------------------------------------------------------------------------
-- insert into public.admins (user_id)
-- select id from auth.users where email = 'you@example.com'
-- on conflict (user_id) do nothing;
