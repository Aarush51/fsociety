-- Team formation inside hackathon registration.
--
-- This reshapes the existing team tables rather than adding a second team model.
-- Read the notes at the top of each section before running it; take a database
-- backup first.
--
-- Before this migration:
--   public.teams          id, hackathon_id, name, description, max_members,
--                         created_by, created_at, updated_at
--   public.team_members   team_id, user_id, role, joined_at
--   public.team_invites   did not exist
--   public.match_pool     did not exist
--
-- After:
--   public.teams          max_members is renamed to size, clamped to 1..6
--                         (1 is a Solo team; the hackathon maximum is 2..6)
--   public.team_members   hackathon_id added, unique (hackathon_id, user_id)
--   public.team_invites   new: pending/accepted/declined/expired
--   public.match_pool     new: open spots the organizer fills by hand
--
-- Registration is no longer a direct table insert: the client insert policy is
-- dropped and INSERT is revoked. Every registration goes through
-- public.register_for_hackathon() or public.accept_invite(), both SECURITY
-- DEFINER with an empty search_path.
--
-- Access stays RPC-only, as before: teams/team_members keep RLS enabled with no
-- policies, and the new tables do the same. Members can only read their own
-- team, invites and member names; organizers/admins can read every team for
-- their own hackathons. No function returns an email or phone.
--
-- One transaction: any failure leaves the old schema in place (except old data
-- that was already migrated, which is rolled back with it).

begin;

-- ---------------------------------------------------------------------------
-- 1. Retire the old free-form team RPCs. Teams are created by registration now.
-- ---------------------------------------------------------------------------

drop function if exists public.create_hackathon_team(uuid, text, text, integer);
drop function if exists public.join_hackathon_team(uuid);
drop function if exists public.list_hackathon_teams(uuid);

-- ---------------------------------------------------------------------------
-- 2. Hackathons: team size limit (2..6, default 4).
-- ---------------------------------------------------------------------------

alter table public.hackathons
  add column if not exists team_size_max smallint not null default 4
  check (team_size_max between 2 and 6);

-- ---------------------------------------------------------------------------
-- 3. Teams: max_members becomes size, clamped into 1..6.
--    Existing team names and rows are kept; the flow generates a name.
-- ---------------------------------------------------------------------------

alter table public.teams rename column max_members to size;

alter table public.teams drop constraint if exists teams_max_members_check;

update public.teams
set size = least(greatest(size, 1), 6)
where size < 1 or size > 6;

alter table public.teams
  add constraint teams_size_check check (size between 1 and 6);

alter table public.teams alter column size set default 4;

-- ---------------------------------------------------------------------------
-- 4. Team members: every membership now knows its hackathon, and a person can
--    only be in one team per hackathon.
-- ---------------------------------------------------------------------------

alter table public.team_members
  add column if not exists hackathon_id uuid references public.hackathons (id) on delete cascade;

update public.team_members tm
set hackathon_id = t.hackathon_id
from public.teams t
where t.id = tm.team_id
  and tm.hackathon_id is null;

-- Fails loudly (and rolls the migration back) if existing data already puts a
-- person in two teams for the same hackathon. Inspect and fix those rows first.
alter table public.team_members alter column hackathon_id set not null;

create unique index if not exists team_members_hackathon_user_uidx
  on public.team_members (hackathon_id, user_id);

create index if not exists team_members_hackathon_id_idx
  on public.team_members (hackathon_id);

-- ---------------------------------------------------------------------------
-- 5. Invites and the matching pool.
-- ---------------------------------------------------------------------------

create table if not exists public.team_invites (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  hackathon_id uuid not null references public.hackathons (id) on delete cascade,
  invited_user uuid not null references public.profiles (id) on delete cascade,
  invited_by uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'expired')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint team_invites_team_user_key unique (team_id, invited_user)
);

create index if not exists team_invites_invited_user_idx
  on public.team_invites (invited_user, hackathon_id);
create index if not exists team_invites_team_id_idx
  on public.team_invites (team_id);

create table if not exists public.match_pool (
  hackathon_id uuid not null references public.hackathons (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  spots_wanted smallint not null check (spots_wanted between 1 and 6),
  created_at timestamptz not null default now(),
  primary key (hackathon_id, user_id)
);

alter table public.team_invites enable row level security;
alter table public.match_pool enable row level security;
revoke all on public.team_invites, public.match_pool from public, anon, authenticated;

-- teams/team_members were already RLS-enabled and revoked; say it again so this
-- file is self-contained and no policy is ever added by accident.
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
revoke all on public.teams, public.team_members from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Registration is function-only from now on.
-- ---------------------------------------------------------------------------

drop policy if exists "Participants can register themselves" on public.registrations;
revoke insert on public.registrations from authenticated;

-- ---------------------------------------------------------------------------
-- 7. Size names used in messages ("Squad (4)").
-- ---------------------------------------------------------------------------

create or replace function public.team_size_label(p_size integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_size
    when 1 then 'Solo'
    when 2 then 'Duo'
    when 3 then 'Trio'
    when 4 then 'Squad'
    when 5 then 'Crew'
    when 6 then 'Pack'
    else p_size::text
  end;
$$;

revoke all on function public.team_size_label(integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 8. Register and form a team.
--
--    p_size includes the caller. p_friend_codes are six-digit friend IDs.
--    p_use_matching lets skill-based matching fill whatever friends do not.
--    p_paid is set only after the placeholder payment flow reports success.
-- ---------------------------------------------------------------------------

create or replace function public.register_for_hackathon(
  p_hackathon_id uuid,
  p_size integer,
  p_friend_codes text[] default '{}',
  p_use_matching boolean default false,
  p_paid boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  target record;
  requested_size integer := coalesce(p_size, 0);
  friend_ids uuid[] := array[]::uuid[];
  friend_count integer := 0;
  open_for_matching integer := 0;
  code text;
  friend_id uuid;
  registration_id uuid;
  new_team_id uuid;
  display_name text;
  generated_name text;
  name_attempt integer := 0;
  people_count integer;
  registered_count integer;
  size_name text;
  suggested_name text;
begin
  if current_user_id is null then
    raise exception 'Log in to register for a hackathon.';
  end if;

  -- Locking the hackathon serialises capacity checks and duplicate checks.
  select h.id, h.title, h.starts_at, h.approval_status, h.status, h.capacity,
         h.price, h.team_size_max, h.created_by
  into target
  from public.hackathons h
  where h.id = p_hackathon_id
  for update;

  if not found then
    raise exception 'This hackathon does not exist.';
  end if;
  if target.approval_status <> 'approved' then
    raise exception 'This hackathon is not open for registration.';
  end if;
  if target.status not in ('upcoming', 'active') or now() >= target.starts_at then
    raise exception 'Registration closed when this hackathon started.';
  end if;
  if target.created_by = current_user_id or public.is_hackathon_organizer(target.id) then
    raise exception 'Organizers cannot register for their own hackathon.';
  end if;
  if requested_size < 1 or requested_size > target.team_size_max then
    raise exception 'Choose between 1 and % people for this hackathon.', target.team_size_max;
  end if;

  select count(*) into registered_count
  from public.registrations r
  where r.hackathon_id = target.id;

  if target.capacity is not null and registered_count >= target.capacity then
    raise exception 'This hackathon is full.';
  end if;

  if exists (
    select 1 from public.registrations r
    where r.hackathon_id = target.id and r.user_id = current_user_id
  ) then
    raise exception 'You are already registered for this hackathon.';
  end if;

  if exists (
    select 1 from public.team_members tm
    where tm.hackathon_id = target.id and tm.user_id = current_user_id
  ) then
    raise exception 'You are already on a team for this hackathon.';
  end if;

  if target.price > 0 and not coalesce(p_paid, false) then
    raise exception 'Payment is required before your registration can be saved.';
  end if;

  foreach code in array coalesce(p_friend_codes, array[]::text[]) loop
    code := trim(coalesce(code, ''));
    continue when code = '';
    if code !~ '^[1-9][0-9]{5}$' then
      raise exception 'Friend IDs are six digits, from 100000 to 999999.';
    end if;
    select p.id into friend_id from public.profiles p where p.friend_code = code;
    if friend_id is null then
      raise exception 'No HackMate member has the friend ID %.', code;
    end if;
    if friend_id = current_user_id then
      raise exception 'You cannot invite yourself.';
    end if;
    if friend_id = any (friend_ids) then
      raise exception 'Friend ID % is listed twice.', code;
    end if;
    if exists (
      select 1 from public.team_members tm
      where tm.hackathon_id = target.id and tm.user_id = friend_id
    ) then
      raise exception 'That friend is already on a team for this hackathon.';
    end if;
    friend_ids := friend_ids || friend_id;
  end loop;

  friend_count := coalesce(array_length(friend_ids, 1), 0);

  if friend_count > requested_size - 1 then
    raise exception 'You picked % (%) but invited % friends. Choose a bigger team or remove a friend.',
      public.team_size_label(requested_size), requested_size, friend_count;
  end if;

  if coalesce(p_use_matching, false) then
    open_for_matching := requested_size - 1 - friend_count;
  end if;

  -- Step 2 rule: friends plus matching spots must fill every other seat.
  if friend_count + open_for_matching < requested_size - 1 then
    people_count := 1 + friend_count;
    size_name := public.team_size_label(requested_size);
    suggested_name := public.team_size_label(people_count);
    raise exception 'You picked % (%) but only have % %. Choose %, add more friends by ID, or choose skill-based matching to fill the remaining spots.',
      size_name,
      requested_size,
      people_count,
      case when people_count = 1 then 'person' else 'people' end,
      suggested_name;
  end if;

  insert into public.registrations (hackathon_id, user_id, paid)
  values (target.id, current_user_id, coalesce(p_paid, false))
  returning id into registration_id;

  select coalesce(nullif(trim(p.full_name), ''), 'HackMate')
  into display_name
  from public.profiles p
  where p.id = current_user_id;

  generated_name := left(display_name, 70) || '''s team';
  while exists (
    select 1 from public.teams t
    where t.hackathon_id = target.id and lower(t.name) = lower(generated_name)
  ) loop
    name_attempt := name_attempt + 1;
    generated_name := left(display_name, 70) || '''s team ' || name_attempt::text;
  end loop;

  insert into public.teams (hackathon_id, name, size, created_by)
  values (target.id, generated_name, requested_size, current_user_id)
  returning id into new_team_id;

  insert into public.team_members (team_id, hackathon_id, user_id, role)
  values (new_team_id, target.id, current_user_id, 'leader');

  if friend_count > 0 then
    insert into public.team_invites (team_id, hackathon_id, invited_user, invited_by, status)
    select new_team_id, target.id, friend.friend_user, current_user_id, 'pending'
    from unnest(friend_ids) as friend(friend_user);
  end if;

  if open_for_matching > 0 then
    insert into public.match_pool (hackathon_id, user_id, spots_wanted)
    values (target.id, current_user_id, open_for_matching)
    on conflict (hackathon_id, user_id)
    do update set spots_wanted = excluded.spots_wanted;
  end if;

  return jsonb_build_object(
    'registration_id', registration_id,
    'team_id', new_team_id,
    'team_name', generated_name,
    'size', requested_size,
    'friend_count', friend_count,
    'matching_spots', open_for_matching
  );
end;
$$;

revoke all on function public.register_for_hackathon(uuid, integer, text[], boolean, boolean)
  from public, anon;
grant execute on function public.register_for_hackathon(uuid, integer, text[], boolean, boolean)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 9. Accept / decline an invite.
-- ---------------------------------------------------------------------------

create or replace function public.accept_invite(p_invite_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  invite record;
  target record;
  member_count integer;
  registered_count integer;
  registration_id uuid;
begin
  if current_user_id is null then
    raise exception 'Log in to accept an invite.';
  end if;

  select ti.id, ti.team_id, ti.hackathon_id, ti.invited_user, ti.status,
         t.size, t.created_by
  into invite
  from public.team_invites ti
  join public.teams t on t.id = ti.team_id
  where ti.id = p_invite_id
  for update of ti, t;

  if not found then
    raise exception 'This invite does not exist.';
  end if;
  if invite.invited_user <> current_user_id then
    raise exception 'This invite is not for you.';
  end if;
  if invite.status <> 'pending' then
    raise exception 'This invite is no longer pending.';
  end if;

  select h.id, h.starts_at, h.approval_status, h.status, h.capacity, h.created_by
  into target
  from public.hackathons h
  where h.id = invite.hackathon_id
  for update;

  if now() >= target.starts_at then
    update public.team_invites
    set status = 'expired', responded_at = now()
    where id = invite.id;
    raise exception 'This invite expired when the hackathon started.';
  end if;
  if target.approval_status <> 'approved' or target.status not in ('upcoming', 'active') then
    raise exception 'This hackathon is no longer open.';
  end if;
  if target.created_by = current_user_id or public.is_hackathon_organizer(target.id) then
    raise exception 'Organizers cannot register for their own hackathon.';
  end if;

  if exists (
    select 1 from public.team_members tm
    where tm.hackathon_id = invite.hackathon_id and tm.user_id = current_user_id
  ) then
    if exists (
      select 1 from public.team_members tm
      where tm.team_id = invite.team_id and tm.user_id = current_user_id
    ) then
      update public.team_invites
      set status = 'accepted', responded_at = now()
      where id = invite.id;
      return jsonb_build_object('team_id', invite.team_id, 'already_member', true);
    end if;
    raise exception 'You are already on a team for this hackathon.';
  end if;

  select count(*) into member_count
  from public.team_members tm
  where tm.team_id = invite.team_id;

  if member_count >= invite.size then
    raise exception 'This team is full.';
  end if;

  select r.id into registration_id
  from public.registrations r
  where r.hackathon_id = invite.hackathon_id and r.user_id = current_user_id;

  if registration_id is null then
    select count(*) into registered_count
    from public.registrations r
    where r.hackathon_id = invite.hackathon_id;

    if target.capacity is not null and registered_count >= target.capacity then
      raise exception 'This hackathon is full.';
    end if;

    insert into public.registrations (hackathon_id, user_id, paid)
    values (invite.hackathon_id, current_user_id, false)
    returning id into registration_id;
  end if;

  insert into public.team_members (team_id, hackathon_id, user_id, role)
  values (invite.team_id, invite.hackathon_id, current_user_id, 'member');

  update public.team_invites
  set status = 'accepted', responded_at = now()
  where id = invite.id;

  return jsonb_build_object(
    'team_id', invite.team_id,
    'registration_id', registration_id,
    'already_member', false
  );
end;
$$;

revoke all on function public.accept_invite(uuid) from public, anon;
grant execute on function public.accept_invite(uuid) to authenticated;

create or replace function public.decline_invite(p_invite_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  invite record;
  starts_at timestamptz;
begin
  if current_user_id is null then
    raise exception 'Log in to decline an invite.';
  end if;

  select ti.id, ti.invited_user, ti.status, h.starts_at
  into invite
  from public.team_invites ti
  join public.hackathons h on h.id = ti.hackathon_id
  where ti.id = p_invite_id
  for update of ti;

  if not found then
    raise exception 'This invite does not exist.';
  end if;
  if invite.invited_user <> current_user_id then
    raise exception 'This invite is not for you.';
  end if;
  if invite.status <> 'pending' then
    raise exception 'This invite is no longer pending.';
  end if;

  starts_at := invite.starts_at;
  if now() >= starts_at then
    update public.team_invites
    set status = 'expired', responded_at = now()
    where id = invite.id;
    raise exception 'This invite expired when the hackathon started.';
  end if;

  update public.team_invites
  set status = 'declined', responded_at = now()
  where id = invite.id;

  return jsonb_build_object('status', 'declined');
end;
$$;

revoke all on function public.decline_invite(uuid) from public, anon;
grant execute on function public.decline_invite(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 10. Reduce a team's size after invites are declined. Only the creator can do
--     this, only before the start, and it never grows the team.
-- ---------------------------------------------------------------------------

create or replace function public.reduce_team_size(p_team_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  team_row record;
  target record;
  member_count integer;
  pending_count integer;
  matching_spots integer;
  new_size integer;
  new_matching integer;
begin
  if current_user_id is null then
    raise exception 'Log in to change your team.';
  end if;

  select t.id, t.hackathon_id, t.size, t.created_by
  into team_row
  from public.teams t
  where t.id = p_team_id
  for update;

  if not found then
    raise exception 'This team does not exist.';
  end if;
  if team_row.created_by <> current_user_id then
    raise exception 'Only the team creator can change the team size.';
  end if;

  select h.starts_at, h.team_size_max
  into target
  from public.hackathons h
  where h.id = team_row.hackathon_id;

  if now() >= target.starts_at then
    raise exception 'The team size cannot change after the hackathon starts.';
  end if;

  select count(*) into member_count
  from public.team_members tm
  where tm.team_id = p_team_id;

  select count(*) into pending_count
  from public.team_invites ti
  where ti.team_id = p_team_id
    and ti.status = 'pending'
    and now() < target.starts_at;

  select coalesce(mp.spots_wanted, 0) into matching_spots
  from public.match_pool mp
  where mp.hackathon_id = team_row.hackathon_id
    and mp.user_id = current_user_id;

  matching_spots := coalesce(matching_spots, 0);

  new_size := member_count + pending_count + matching_spots;
  new_size := greatest(new_size, 1);
  new_size := least(new_size, team_row.size, target.team_size_max);

  if new_size >= team_row.size then
    return jsonb_build_object('size', team_row.size, 'changed', false, 'matching_spots', matching_spots);
  end if;

  update public.teams set size = new_size where id = p_team_id;

  new_matching := greatest(new_size - member_count - pending_count, 0);
  if new_matching > 0 then
    insert into public.match_pool (hackathon_id, user_id, spots_wanted)
    values (team_row.hackathon_id, current_user_id, new_matching)
    on conflict (hackathon_id, user_id)
    do update set spots_wanted = excluded.spots_wanted;
  else
    delete from public.match_pool
    where hackathon_id = team_row.hackathon_id
      and user_id = current_user_id;
  end if;

  return jsonb_build_object(
    'size', new_size,
    'changed', true,
    'matching_spots', new_matching
  );
end;
$$;

revoke all on function public.reduce_team_size(uuid) from public, anon;
grant execute on function public.reduce_team_size(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 11. Read the caller's own view of one hackathon: registration, team, members,
--     invites and matching state. Only the caller's rows, and no emails.
-- ---------------------------------------------------------------------------

create or replace function public.get_my_hackathon_team(p_hackathon_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select auth.uid() as id
  ),
  my_team as (
    select t.id, t.name, t.size, t.created_by
    from public.teams t
    join public.team_members tm on tm.team_id = t.id
    where t.hackathon_id = p_hackathon_id
      and tm.user_id = (select id from me)
    limit 1
  ),
  member_totals as (
    select tm.team_id, count(*)::integer as member_count
    from public.team_members tm
    where tm.team_id in (select id from my_team)
    group by tm.team_id
  ),
  my_matching as (
    select mp.spots_wanted
    from public.match_pool mp
    where mp.hackathon_id = p_hackathon_id
      and mp.user_id = (select id from me)
  )
  select case
    when (select id from me) is null then null
    else jsonb_build_object(
      'registration', (
        select jsonb_build_object('id', r.id, 'paid', r.paid, 'created_at', r.created_at)
        from public.registrations r
        where r.hackathon_id = p_hackathon_id
          and r.user_id = (select id from me)
      ),
      'team', (
        select jsonb_build_object(
          'id', mt.id,
          'name', mt.name,
          'size', mt.size,
          'is_creator', mt.created_by = (select id from me),
          'member_count', coalesce(totals.member_count, 0),
          'open_spots', greatest(mt.size - coalesce(totals.member_count, 0), 0),
          'members', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', p.id,
                'full_name', p.full_name,
                'username', p.username,
                'role', tm.role
              )
              order by case when tm.role = 'leader' then 0 else 1 end, p.full_name
            )
            from public.team_members tm
            join public.profiles p on p.id = tm.user_id
            where tm.team_id = mt.id
          ), '[]'::jsonb)
        )
        from my_team mt
        left join member_totals totals on totals.team_id = mt.id
      ),
      'invites_for_me', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', ti.id,
            'team_id', ti.team_id,
            'team_name', t.name,
            'invited_by_name', inviter.full_name,
            'status', case when ti.status = 'pending' and now() >= h.starts_at
                           then 'expired' else ti.status end,
            'created_at', ti.created_at
          )
          order by ti.created_at desc
        )
        from public.team_invites ti
        join public.teams t on t.id = ti.team_id
        join public.hackathons h on h.id = ti.hackathon_id
        join public.profiles inviter on inviter.id = ti.invited_by
        where ti.hackathon_id = p_hackathon_id
          and ti.invited_user = (select id from me)
      ), '[]'::jsonb),
      'outgoing_invites', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', ti.id,
            'full_name', invited.full_name,
            'status', case when ti.status = 'pending' and now() >= h.starts_at
                           then 'expired' else ti.status end
          )
          order by ti.created_at desc
        )
        from public.team_invites ti
        join public.hackathons h on h.id = ti.hackathon_id
        join public.profiles invited on invited.id = ti.invited_user
        where ti.hackathon_id = p_hackathon_id
          and ti.invited_by = (select id from me)
      ), '[]'::jsonb),
      'matching_spots', coalesce((select spots_wanted from my_matching), 0),
      'waiting_for_match', coalesce((select spots_wanted from my_matching), 0) > 0
    )
  end;
$$;

revoke all on function public.get_my_hackathon_team(uuid) from public, anon;
grant execute on function public.get_my_hackathon_team(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 12. Organizer/admin view of every team for one hackathon. Names and statuses
--     only — no emails, phones or auth.users data.
-- ---------------------------------------------------------------------------

create or replace function public.get_hackathon_teams(p_hackathon_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Log in to view teams.';
  end if;
  if not (
    public.is_hackathon_organizer(p_hackathon_id)
    or public.is_admin()
    or exists (
      select 1 from public.hackathons h
      where h.id = p_hackathon_id and h.created_by = (select auth.uid())
    )
  ) then
    raise exception 'Only this hackathon''s organizer can view its teams.';
  end if;

  return jsonb_build_object(
    'teams', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', t.id,
          'name', t.name,
          'size', t.size,
          'created_by', t.created_by,
          'members', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', p.id,
                'full_name', p.full_name,
                'username', p.username,
                'role', tm.role
              )
              order by case when tm.role = 'leader' then 0 else 1 end, p.full_name
            )
            from public.team_members tm
            join public.profiles p on p.id = tm.user_id
            where tm.team_id = t.id
          ), '[]'::jsonb),
          'invites', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'full_name', invited.full_name,
                'status', case when ti.status = 'pending' and now() >= h.starts_at
                               then 'expired' else ti.status end
              )
              order by ti.created_at
            )
            from public.team_invites ti
            join public.profiles invited on invited.id = ti.invited_user
            join public.hackathons h on h.id = ti.hackathon_id
            where ti.team_id = t.id
          ), '[]'::jsonb)
        )
        order by t.created_at
      )
      from public.teams t
      where t.hackathon_id = p_hackathon_id
    ), '[]'::jsonb),
    'match_pool', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'full_name', p.full_name,
          'username', p.username,
          'spots_wanted', mp.spots_wanted
        )
        order by mp.created_at
      )
      from public.match_pool mp
      join public.profiles p on p.id = mp.user_id
      where mp.hackathon_id = p_hackathon_id
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_hackathon_teams(uuid) from public, anon;
grant execute on function public.get_hackathon_teams(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 13. Keep the existing read RPCs working with the renamed size column.
-- ---------------------------------------------------------------------------

create or replace function public.get_my_dashboard()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'profile', jsonb_build_object(
      'full_name', p.full_name,
      'username', p.username
    ),
    'coin_balance', coalesce((
      select sum(ct.amount)
      from public.coin_transactions ct
      where ct.user_id = p.id
    ), 0),
    'reputation', coalesce((
      select round(avg(r.rating)::numeric, 1)
      from public.reviews r
      where r.reviewee_id = p.id
    ), 0),
    'review_count', (
      select count(*) from public.reviews r where r.reviewee_id = p.id
    ),
    'teams', coalesce((
      select jsonb_agg(to_jsonb(user_team))
      from (
        select
          t.id,
          t.name,
          t.size,
          tm.role,
          h.slug as hackathon_slug,
          h.title as hackathon_title,
          (select count(*) from public.team_members members where members.team_id = t.id) as member_count
        from public.team_members tm
        join public.teams t on t.id = tm.team_id
        join public.hackathons h on h.id = t.hackathon_id
        where tm.user_id = p.id
        order by t.created_at desc
      ) user_team
    ), '[]'::jsonb),
    'projects', coalesce((
      select jsonb_agg(to_jsonb(user_project))
      from (
        select pr.id, pr.title, pr.status, t.name as team_name
        from public.team_members tm
        join public.teams t on t.id = tm.team_id
        join public.projects pr on pr.team_id = t.id
        where tm.user_id = p.id
        order by pr.updated_at desc
      ) user_project
    ), '[]'::jsonb),
    'tasks', coalesce((
      select jsonb_agg(to_jsonb(user_task))
      from (
        select tk.id, tk.title, tk.status, tk.due_at, pr.title as project_title
        from public.team_members tm
        join public.teams t on t.id = tm.team_id
        join public.projects pr on pr.team_id = t.id
        join public.tasks tk on tk.project_id = pr.id
        where tm.user_id = p.id
        order by case when tk.status = 'done' then 1 else 0 end, tk.due_at nulls last, tk.created_at desc
        limit 20
      ) user_task
    ), '[]'::jsonb)
  )
  from public.profiles p
  where p.id = (select auth.uid());
$$;

revoke all on function public.get_my_dashboard() from public, anon;
grant execute on function public.get_my_dashboard() to authenticated;

create or replace function public.get_project_tasks(p_project_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with access as (
    select pr.id
    from public.projects pr
    join public.team_members tm on tm.team_id = pr.team_id
    where pr.id = p_project_id
      and tm.user_id = (select auth.uid())
  )
  select case
    when not exists (select 1 from access) then null
    else jsonb_build_object(
      'project', (
        select to_jsonb(project_row)
        from (
          select pr.id,
                 pr.title,
                 pr.description,
                 pr.status,
                 pr.repository_url,
                 pr.demo_url,
                 pr.submitted_at,
                 pr.updated_at,
                 pr.team_id,
                 t.name as team_name,
                 t.size
          from public.projects pr
          join public.teams t on t.id = pr.team_id
          where pr.id = p_project_id
        ) project_row
      ),
      'tasks', coalesce((
        select jsonb_agg(
          to_jsonb(task_row)
          order by task_row.status = 'done', task_row.due_at nulls last, task_row.created_at
        )
        from (
          select tk.id,
                 tk.title,
                 tk.description,
                 tk.status,
                 tk.priority,
                 tk.due_at,
                 tk.completed_at,
                 tk.created_at,
                 tk.updated_at,
                 tk.assigned_to,
                 assignee.full_name as assignee_name,
                 assignee.username as assignee_username,
                 tk.created_by
          from public.tasks tk
          left join public.profiles assignee on assignee.id = tk.assigned_to
          where tk.project_id = p_project_id
        ) task_row
      ), '[]'::jsonb),
      'task_count', (
        select count(*) from public.tasks tk where tk.project_id = p_project_id
      ),
      'open_task_count', (
        select count(*)
        from public.tasks tk
        where tk.project_id = p_project_id
          and tk.status <> 'done'
      )
    )
  end;
$$;

revoke all on function public.get_project_tasks(uuid) from public, anon;
grant execute on function public.get_project_tasks(uuid) to authenticated;

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
    'team_size_max', (
      select h.team_size_max from public.hackathons h where h.id = p_hackathon_id
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

commit;
