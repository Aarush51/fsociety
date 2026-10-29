-- Event reviews: participants rate a hackathon 1-5 once the event has ended.
--
--   * event_reviews       one row per (hackathon, reviewer), hidden = moderation
--   * RLS                 own rows only, no client deletes, admins read/moderate
--   * event_review_block_reason()  the eligibility rule used by the INSERT policy
--   * get_hackathon_rating / get_organization_rating   averages, hidden excluded
--
-- Extra functions beyond the two rating RPCs exist because public.profiles is
-- readable only by its owner: a reviewer's first name can never be joined on the
-- client, so the lists come from SECURITY DEFINER functions that expose the
-- first name and nothing else (no email, no phone, no username).

begin;

-- ---------------------------------------------------------------------------
-- 1. Table
-- ---------------------------------------------------------------------------
create table if not exists public.event_reviews (
  id uuid primary key default gen_random_uuid(),
  hackathon_id uuid not null references public.hackathons (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  rating integer not null
    check (rating between 1 and 5),
  comment text
    check (comment is null or char_length(btrim(comment)) <= 1000),
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_reviews_hackathon_user_key unique (hackathon_id, user_id)
);

create index if not exists event_reviews_user_id_idx
  on public.event_reviews (user_id);

-- ---------------------------------------------------------------------------
-- 2. Eligibility: registered (+ paid when the event is paid, + checked in when
--    registrations carries a checked_in_at column), event finished, not the
--    organizer. Returns NULL when the signed-in user may review.
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER so a completed hackathon row (its status is no longer
-- 'upcoming'/'active', so RLS hides it from participants) can still be evaluated
-- for eligibility, and so the insert policy sees the caller's own registration.
create or replace function public.event_review_block_reason(p_hackathon_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  viewer_id uuid := (select auth.uid());
  event_ends_at timestamptz;
  event_price numeric;
  registration_paid boolean := false;
  needs_checkin boolean;
  missing_checkin boolean := false;
begin
  if viewer_id is null then
    return 'Sign in to review this hackathon.';
  end if;
  if p_hackathon_id is null then
    return 'Pick a hackathon to review.';
  end if;

  select h.ends_at, coalesce(h.price, 0)
    into event_ends_at, event_price
  from public.hackathons h
  where h.id = p_hackathon_id;

  -- SELECT INTO leaves the targets NULL when no row matched, so test FOUND
  -- rather than the variable (a NULL would fall through as "eligible").
  if not found then
    return 'That hackathon could not be found.';
  end if;
  if event_ends_at > now() then
    return 'Reviews open when the event ends.';
  end if;
  if public.is_hackathon_organizer(p_hackathon_id) then
    return 'Organizers cannot review their own events.';
  end if;

  select coalesce(r.paid, false)
    into registration_paid
  from public.registrations r
  where r.hackathon_id = p_hackathon_id
    and r.user_id = viewer_id;

  if not found then
    return 'You did not register for this event, so you cannot review it.';
  end if;
  if event_price > 0 and coalesce(registration_paid, false) is not true then
    return 'Your registration for this event is not paid yet.';
  end if;

  -- Check-in only applies once a checked_in_at column exists on registrations.
  select exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'registrations'
      and c.column_name = 'checked_in_at'
  ) into needs_checkin;

  if needs_checkin then
    execute $sql$
      select r.checked_in_at is null
      from public.registrations r
      where r.hackathon_id = $1 and r.user_id = $2
    $sql$
    into missing_checkin
    using p_hackathon_id, viewer_id;

    if coalesce(missing_checkin, true) then
      return 'You have not been checked in at this event yet.';
    end if;
  end if;

  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Rating functions: hidden reviews are excluded everywhere
-- ---------------------------------------------------------------------------
create or replace function public.get_hackathon_rating(p_hackathon_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'hackathon_id', p_hackathon_id,
    'average', (
      select round(avg(r.rating)::numeric, 1)
      from public.event_reviews r
      where r.hackathon_id = p_hackathon_id and not r.hidden
    ),
    'count', (
      select count(*)
      from public.event_reviews r
      where r.hackathon_id = p_hackathon_id and not r.hidden
    )
  );
$$;

create or replace function public.get_organization_rating(p_organization_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'organization_id', p_organization_id,
    'average', (
      select round(avg(r.rating)::numeric, 1)
      from public.event_reviews r
      join public.hackathons h on h.id = r.hackathon_id
      where h.organization_id = p_organization_id and not r.hidden
    ),
    'count', (
      select count(*)
      from public.event_reviews r
      join public.hackathons h on h.id = r.hackathon_id
      where h.organization_id = p_organization_id and not r.hidden
    )
  );
$$;

-- ---------------------------------------------------------------------------
-- 4. Reads that carry a reviewer first name (profiles stay locked down)
-- ---------------------------------------------------------------------------
create or replace function public.list_hackathon_reviews(p_hackathon_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id,
      'rating', r.rating,
      'comment', r.comment,
      'created_at', r.created_at,
      'updated_at', r.updated_at,
      'mine', r.user_id = (select auth.uid()),
      'reviewer_first_name', coalesce(
        nullif(split_part(btrim(p.full_name), ' ', 1), ''),
        'A HackMate member'
      )
    ) order by r.created_at desc), '[]'::jsonb)
  from public.event_reviews r
  join public.profiles p on p.id = r.user_id
  where r.hackathon_id = p_hackathon_id
    and (select auth.uid()) is not null
    and (
      not r.hidden
      or r.user_id = (select auth.uid())
      or public.is_hackathon_organizer(r.hackathon_id)
      or public.is_admin()
    );
$$;

create or replace function public.get_my_review_state(p_hackathon_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'ended', coalesce((
      select h.ends_at <= now() from public.hackathons h where h.id = p_hackathon_id
    ), false),
    'block_reason', public.event_review_block_reason(p_hackathon_id),
    'review', (
      select jsonb_build_object(
        'id', r.id,
        'rating', r.rating,
        'comment', r.comment,
        'hidden', r.hidden,
        'created_at', r.created_at,
        'updated_at', r.updated_at
      )
      from public.event_reviews r
      where r.hackathon_id = p_hackathon_id
        and r.user_id = (select auth.uid())
    )
  );
$$;

create or replace function public.list_event_reviews_for_admin()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id,
      'rating', r.rating,
      'comment', r.comment,
      'hidden', r.hidden,
      'created_at', r.created_at,
      'updated_at', r.updated_at,
      'hackathon_id', r.hackathon_id,
      'hackathon_title', h.title,
      'hackathon_slug', h.slug,
      'reviewer_first_name', coalesce(
        nullif(split_part(btrim(p.full_name), ' ', 1), ''),
        'A HackMate member'
      )
    ) order by r.created_at desc), '[]'::jsonb)
  from public.event_reviews r
  join public.hackathons h on h.id = r.hackathon_id
  join public.profiles p on p.id = r.user_id
  where public.is_admin();
$$;

-- ---------------------------------------------------------------------------
-- 5. Guard trigger: updated_at is server-set, hidden is admin-only, and an
--    admin moderating someone else's row may only toggle hidden.
-- ---------------------------------------------------------------------------
create or replace function public.event_reviews_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();

  if new.hackathon_id is distinct from old.hackathon_id then
    new.hackathon_id := old.hackathon_id;
  end if;
  if new.user_id is distinct from old.user_id then
    new.user_id := old.user_id;
  end if;

  if new.hidden is distinct from old.hidden and not public.is_admin() then
    new.hidden := old.hidden;
  end if;

  if public.is_admin() and (select auth.uid()) is distinct from old.user_id then
    if new.rating is distinct from old.rating then
      new.rating := old.rating;
    end if;
    if new.comment is distinct from old.comment then
      new.comment := old.comment;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists event_reviews_guard on public.event_reviews;
create trigger event_reviews_guard
  before update on public.event_reviews
  for each row execute function public.event_reviews_guard();

-- ---------------------------------------------------------------------------
-- 6. Row Level Security
-- ---------------------------------------------------------------------------
alter table public.event_reviews enable row level security;

revoke all on public.event_reviews from public, anon;
revoke all on public.event_reviews from authenticated;

grant select on public.event_reviews to authenticated;
grant insert (hackathon_id, user_id, rating, comment) on public.event_reviews to authenticated;
grant update (rating, comment, hidden) on public.event_reviews to authenticated;
-- no delete grant anywhere: client deletes are impossible.

drop policy if exists "Users can read visible, own or managed event reviews" on public.event_reviews;
create policy "Users can read visible, own or managed event reviews"
  on public.event_reviews for select
  to authenticated
  using (
    not hidden
    or user_id = (select auth.uid())
    or public.is_hackathon_organizer(hackathon_id)
    or public.is_admin()
  );

drop policy if exists "Users can review events they attended" on public.event_reviews;
create policy "Users can review events they attended"
  on public.event_reviews for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and not hidden
    and public.event_review_block_reason(hackathon_id) is null
  );

drop policy if exists "Users can edit their own event review" on public.event_reviews;
create policy "Users can edit their own event review"
  on public.event_reviews for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Admins can moderate event reviews" on public.event_reviews;
create policy "Admins can moderate event reviews"
  on public.event_reviews for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- No DELETE policy exists, and authenticated holds no delete grant.

-- ---------------------------------------------------------------------------
-- 7. Grants: authenticated only, never anon/public
-- ---------------------------------------------------------------------------
revoke all on function public.event_review_block_reason(uuid) from public, anon;
revoke all on function public.get_hackathon_rating(uuid) from public, anon;
revoke all on function public.get_organization_rating(uuid) from public, anon;
revoke all on function public.list_hackathon_reviews(uuid) from public, anon;
revoke all on function public.get_my_review_state(uuid) from public, anon;
revoke all on function public.list_event_reviews_for_admin() from public, anon;
revoke all on function public.event_reviews_guard() from public, anon;

grant execute on function public.event_review_block_reason(uuid) to authenticated;
grant execute on function public.get_hackathon_rating(uuid) to authenticated;
grant execute on function public.get_organization_rating(uuid) to authenticated;
grant execute on function public.list_hackathon_reviews(uuid) to authenticated;
grant execute on function public.get_my_review_state(uuid) to authenticated;
grant execute on function public.list_event_reviews_for_admin() to authenticated;
grant execute on function public.event_reviews_guard() to authenticated;
-- The trigger function runs as the role performing the UPDATE (authenticated),
-- which is exactly what keeps is_admin() honest; execute stays closed to anon.

commit;
