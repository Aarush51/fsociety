-- ---------------------------------------------------------------------------
-- Attendance and published results for offline hackathons.
-- ---------------------------------------------------------------------------
-- Run after 20261026120000_add_organizations_and_offline_hackathons.sql
-- (public.is_hackathon_organizer) and 20261026130000_add_admins.sql
-- (public.is_admin). Independent of the tier columns.
--
-- What this adds, in order
--   1. public.attendance   one row per registered participant per hackathon
--                          (hackathon_id + user_id unique)
--   2. public.results      one row per participant per hackathon with an
--                          optional place (1..10) or an honourable mention, and
--                          a published flag (hackathon_id + user_id unique)
--   3. RLS                 only the hackathon's organizer can write either table;
--                          attendees and admins can read attendance; everyone can
--                          read results, but only once they are published (the
--                          organizer and admins see them either way)
--   4. RPCs                get_hackathon_roster, save_hackathon_attendance,
--                          save_hackathon_results, publish_hackathon_results
--
-- Safe to run twice: tables use IF NOT EXISTS, indexes use IF NOT EXISTS, the
-- functions are CREATE OR REPLACE and every policy is dropped before it is
-- re-created. No table is dropped, nothing is truncated or deleted, and no
-- existing policy is loosened (these are new tables with new policies).

-- ---------------------------------------------------------------------------
-- 1. attendance
-- ---------------------------------------------------------------------------

create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  hackathon_id uuid not null references public.hackathons (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  attended boolean not null default false,
  marked_by uuid references public.profiles (id) on delete set null,
  marked_at timestamptz not null default now(),
  constraint attendance_hackathon_user_key unique (hackathon_id, user_id)
);

create index if not exists attendance_hackathon_id_idx
  on public.attendance (hackathon_id);
create index if not exists attendance_user_id_idx
  on public.attendance (user_id);

alter table public.attendance enable row level security;

grant select, insert, update on public.attendance to authenticated;

drop policy if exists "Organizers can read attendance for their hackathons" on public.attendance;
create policy "Organizers can read attendance for their hackathons"
  on public.attendance for select
  to authenticated
  using (public.is_hackathon_organizer(hackathon_id));

drop policy if exists "Admins can read every attendance row" on public.attendance;
create policy "Admins can read every attendance row"
  on public.attendance for select
  to authenticated
  using (public.is_admin());

drop policy if exists "Organizers can mark attendance for their hackathons" on public.attendance;
create policy "Organizers can mark attendance for their hackathons"
  on public.attendance for insert
  to authenticated
  with check (public.is_hackathon_organizer(hackathon_id));

drop policy if exists "Organizers can update attendance for their hackathons" on public.attendance;
create policy "Organizers can update attendance for their hackathons"
  on public.attendance for update
  to authenticated
  using (public.is_hackathon_organizer(hackathon_id))
  with check (public.is_hackathon_organizer(hackathon_id));

-- No DELETE policy: attendance rows are corrected, never removed.

-- ---------------------------------------------------------------------------
-- 2. results
-- ---------------------------------------------------------------------------
-- place is null for an honourable mention, and honourable_mention is false for a
-- placed entry, so a row can never be both.

create table if not exists public.results (
  id uuid primary key default gen_random_uuid(),
  hackathon_id uuid not null references public.hackathons (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  place integer,
  honourable_mention boolean not null default false,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint results_hackathon_user_key unique (hackathon_id, user_id),
  constraint results_place_check check (place is null or place between 1 and 10),
  constraint results_kind_check check (
    (place is not null and honourable_mention = false)
    or (place is null and honourable_mention = true)
  )
);

create index if not exists results_hackathon_id_idx
  on public.results (hackathon_id);
create index if not exists results_user_id_idx
  on public.results (user_id);

-- One participant per place, per hackathon.
create unique index if not exists results_hackathon_place_uidx
  on public.results (hackathon_id, place)
  where place is not null;

drop trigger if exists results_set_updated_at on public.results;
create trigger results_set_updated_at
  before update on public.results
  for each row execute function public.set_updated_at();

alter table public.results enable row level security;

-- Anon may read: the policy below still limits it to published rows only.
grant select on public.results to anon, authenticated;
grant insert, update on public.results to authenticated;

drop policy if exists "Anyone can read published results" on public.results;
create policy "Anyone can read published results"
  on public.results for select
  to anon, authenticated
  using (published);

drop policy if exists "Organizers can read their hackathon results" on public.results;
create policy "Organizers can read their hackathon results"
  on public.results for select
  to authenticated
  using (public.is_hackathon_organizer(hackathon_id));

drop policy if exists "Admins can read every result" on public.results;
create policy "Admins can read every result"
  on public.results for select
  to authenticated
  using (public.is_admin());

drop policy if exists "Organizers can add results for their hackathons" on public.results;
create policy "Organizers can add results for their hackathons"
  on public.results for insert
  to authenticated
  with check (public.is_hackathon_organizer(hackathon_id));

drop policy if exists "Organizers can update results for their hackathons" on public.results;
create policy "Organizers can update results for their hackathons"
  on public.results for update
  to authenticated
  using (public.is_hackathon_organizer(hackathon_id))
  with check (public.is_hackathon_organizer(hackathon_id));

-- ---------------------------------------------------------------------------
-- 3. get_hackathon_roster(hackathon_id)
-- ---------------------------------------------------------------------------
-- The organizer's attendance sheet. Profiles are readable only by their owner,
-- so this SECURITY DEFINER function is the one place a roster with names, friend
-- codes and team names is assembled — and only for the hackathon's organizer.

create or replace function public.get_hackathon_roster(p_hackathon_id uuid)
returns table (
  user_id uuid,
  full_name text,
  username text,
  friend_code text,
  team_name text,
  team_role text,
  registered_at timestamptz,
  attended boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (public.is_hackathon_organizer(p_hackathon_id) or public.is_admin()) then
    raise exception 'Only this hackathon''s organizer can read its roster.'
      using errcode = '42501';
  end if;

  return query
  select
    r.user_id,
    p.full_name,
    p.username,
    p.friend_code,
    t.name,
    tm.role,
    r.created_at,
    coalesce(a.attended, false)
  from public.registrations r
  join public.profiles p on p.id = r.user_id
  left join public.team_members tm
    on tm.user_id = r.user_id
   and tm.team_id in (
     select th.id from public.teams th where th.hackathon_id = p_hackathon_id
   )
  left join public.teams t on t.id = tm.team_id
  left join public.attendance a
    on a.hackathon_id = r.hackathon_id
   and a.user_id = r.user_id
  where r.hackathon_id = p_hackathon_id
  order by p.full_name asc, p.username asc;
end;
$$;

revoke all on function public.get_hackathon_roster(uuid) from public, anon;
grant execute on function public.get_hackathon_roster(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. save_hackathon_attendance(hackathon_id, attended_user_ids)
-- ---------------------------------------------------------------------------
-- The organizer sends everyone they ticked. Registered participants not in the
-- list are stored as not attended, so unticking and re-saving works, and a
-- participant who never registered can never get an attendance row.

create or replace function public.save_hackathon_attendance(
  p_hackathon_id uuid,
  p_user_ids uuid[] default '{}'::uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_marked integer;
  v_attended integer;
begin
  if not public.is_hackathon_organizer(p_hackathon_id) then
    raise exception 'Only this hackathon''s organizer can save attendance.'
      using errcode = '42501';
  end if;

  insert into public.attendance (hackathon_id, user_id, attended, marked_by, marked_at)
  select
    p_hackathon_id,
    r.user_id,
    (r.user_id = any (coalesce(p_user_ids, '{}'::uuid[]))),
    (select auth.uid()),
    now()
  from public.registrations r
  where r.hackathon_id = p_hackathon_id
  on conflict (hackathon_id, user_id) do update
    set attended = excluded.attended,
        marked_by = excluded.marked_by,
        marked_at = excluded.marked_at;

  select count(*), count(*) filter (where a.attended)
    into v_marked, v_attended
  from public.attendance a
  where a.hackathon_id = p_hackathon_id;

  return jsonb_build_object(
    'hackathon_id', p_hackathon_id,
    'marked', v_marked,
    'attended', v_attended,
    'eligible_for_certificates', v_attended
  );
end;
$$;

revoke all on function public.save_hackathon_attendance(uuid, uuid[]) from public, anon;
grant execute on function public.save_hackathon_attendance(uuid, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. save_hackathon_results(hackathon_id, entries)
-- ---------------------------------------------------------------------------
-- entries is a JSON array of { "user_id": uuid, "place": 1..10|null,
-- "honourable_mention": bool }. Rules enforced here, not only in the browser:
--   * only the organizer may save
--   * only attendees can be placed or mentioned
--   * a place can only be given once, and never together with an HM
--   * at most two honourable mentions
-- Rows dropped from the submission are cleared (place/HM reset) instead of
-- deleted, and `published` is never changed here — publishing is its own action.

create or replace function public.save_hackathon_results(
  p_hackathon_id uuid,
  p_entries jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry jsonb;
  v_user uuid;
  v_place integer;
  v_honourable boolean;
  v_places integer[] := '{}'::integer[];
  v_mentions integer := 0;
  v_saved integer := 0;
begin
  if not public.is_hackathon_organizer(p_hackathon_id) then
    raise exception 'Only this hackathon''s organizer can save results.'
      using errcode = '42501';
  end if;

  if p_entries is null or jsonb_typeof(p_entries) <> 'array' then
    raise exception 'Results must be sent as a list of entries.'
      using errcode = '22023';
  end if;

  for v_entry in select * from jsonb_array_elements(p_entries) loop
    v_user := nullif(v_entry->>'user_id', '')::uuid;
    v_place := nullif(v_entry->>'place', '')::integer;
    v_honourable := coalesce((v_entry->>'honourable_mention')::boolean, false);

    if v_user is null then
      raise exception 'Every result needs a participant.' using errcode = '22023';
    end if;
    if v_place is not null and v_place not between 1 and 10 then
      raise exception 'Places run from 1 to 10.' using errcode = '22023';
    end if;
    if v_place is not null and v_honourable then
      raise exception 'A result is either a place or an honourable mention, not both.'
        using errcode = '22023';
    end if;
    if v_place is not null and v_place = any (v_places) then
      raise exception 'Place % is already taken by another participant.', v_place
        using errcode = '22023';
    end if;

    if not exists (
      select 1 from public.attendance a
      where a.hackathon_id = p_hackathon_id
        and a.user_id = v_user
        and a.attended
    ) then
      raise exception 'Only attended participants can be placed or mentioned.'
        using errcode = '22023';
    end if;

    if v_place is not null then
      v_places := array_append(v_places, v_place);
    end if;
    if v_honourable then
      v_mentions := v_mentions + 1;
    end if;
  end loop;

  if v_mentions > 2 then
    raise exception 'Use at most two honourable mentions.'
      using errcode = '22023';
  end if;

  -- Anything no longer in the submission loses its place or mention.
  update public.results r
     set place = null,
         honourable_mention = false,
         updated_at = now()
   where r.hackathon_id = p_hackathon_id
     and not exists (
       select 1
       from jsonb_array_elements(p_entries) e
       where (e->>'user_id')::uuid = r.user_id
     );

  insert into public.results (hackathon_id, user_id, place, honourable_mention)
  select
    p_hackathon_id,
    (e->>'user_id')::uuid,
    nullif(e->>'place', '')::integer,
    coalesce((e->>'honourable_mention')::boolean, false)
  from jsonb_array_elements(p_entries) e
  on conflict (hackathon_id, user_id) do update
    set place = excluded.place,
        honourable_mention = excluded.honourable_mention,
        updated_at = now();

  get diagnostics v_saved = row_count;

  return jsonb_build_object(
    'hackathon_id', p_hackathon_id,
    'saved', v_saved,
    'places', coalesce(array_length(v_places, 1), 0),
    'honourable_mentions', v_mentions
  );
end;
$$;

revoke all on function public.save_hackathon_results(uuid, jsonb) from public, anon;
grant execute on function public.save_hackathon_results(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. publish_hackathon_results(hackathon_id, published)
-- ---------------------------------------------------------------------------
-- Publishing needs at least one place and exactly two honourable mentions, so a
-- half-finished result sheet cannot go public. Unpublishing has no such rule.

create or replace function public.publish_hackathon_results(
  p_hackathon_id uuid,
  p_published boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_publish boolean := coalesce(p_published, false);
  v_places integer := 0;
  v_mentions integer := 0;
  v_rows integer := 0;
begin
  if not public.is_hackathon_organizer(p_hackathon_id) then
    raise exception 'Only this hackathon''s organizer can publish results.'
      using errcode = '42501';
  end if;

  if v_publish then
    select
      count(*) filter (where place is not null),
      count(*) filter (where honourable_mention)
      into v_places, v_mentions
    from public.results
    where hackathon_id = p_hackathon_id;

    if v_places = 0 then
      raise exception 'Add at least one place before publishing.'
        using errcode = '22023';
    end if;
    if v_mentions <> 2 then
      raise exception 'Publishing needs exactly two honourable mentions.'
        using errcode = '22023';
    end if;
  end if;

  update public.results
     set published = v_publish,
         updated_at = now()
   where hackathon_id = p_hackathon_id;

  get diagnostics v_rows = row_count;

  return jsonb_build_object(
    'hackathon_id', p_hackathon_id,
    'published', v_publish,
    'rows', v_rows,
    'places', v_places,
    'honourable_mentions', v_mentions
  );
end;
$$;

revoke all on function public.publish_hackathon_results(uuid, boolean) from public, anon;
grant execute on function public.publish_hackathon_results(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Reload the API schema so the new tables and functions are visible to PostgREST
-- ---------------------------------------------------------------------------

notify pgrst, 'reload schema';
