-- ===========================================================================
-- HackMate: friends, friend requests, and two personal read helpers
-- ---------------------------------------------------------------------------
-- One block. Run it in the Supabase SQL editor (or apply it as a migration).
--
-- What it adds
--   * public.friend_requests  one row per (sender, recipient) pair
--   * public.friendships      one row per pair, stored user_a < user_b
--   * send_friend_request(p_code)      request by six-digit ID, with every
--                                      rejection rule and a 20-a-day limit
--   * respond_friend_request(id, bool) recipient only; accepting creates the
--                                      friendship in the same transaction
--   * cancel_friend_request(id)        sender only, while still pending
--   * remove_friend(user_id)           either side can end a friendship
--   * list_friends()                   id + display name + six-digit ID only
--   * list_friend_requests()           the caller's own pending requests
--   * get_my_rank()                    points, position, total (Dashboard only)
--   * get_my_hackathons()              the caller's own registrations, even
--                                      after an event leaves public listing
--
-- Nothing is loosened: the tables only expose the caller's own rows, clients
-- cannot insert/update/delete either table, and every function is security
-- definer scoped to (select auth.uid()) with an empty search_path.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 0. Suspension flag
--    There is no suspension UI yet; set it from the Supabase table editor or
--    SQL. A signed-in user can never change it (trigger below).
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists suspended boolean not null default false;

create or replace function public.keep_suspended_flag()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- auth.uid() is null when the change comes from the SQL editor / service.
  if (select auth.uid()) is not null then
    new.suspended := old.suspended;
  end if;
  return new;
end;
$$;

revoke all on function public.keep_suspended_flag() from public, anon, authenticated;

drop trigger if exists profiles_keep_suspended_flag on public.profiles;
create trigger profiles_keep_suspended_flag
  before update on public.profiles
  for each row execute function public.keep_suspended_flag();

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null references public.profiles (id) on delete cascade,
  to_user uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint friend_requests_no_self check (from_user <> to_user),
  constraint friend_requests_pair_key unique (from_user, to_user)
);

create index if not exists friend_requests_to_user_idx
  on public.friend_requests (to_user, status);
create index if not exists friend_requests_from_user_idx
  on public.friend_requests (from_user, created_at desc);

create table if not exists public.friendships (
  user_a uuid not null references public.profiles (id) on delete cascade,
  user_b uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint friendships_pair_key primary key (user_a, user_b),
  constraint friendships_ordered check (user_a < user_b)
);

create index if not exists friendships_user_b_idx
  on public.friendships (user_b);

-- ---------------------------------------------------------------------------
-- 2. Row level security
--    Read your own rows only. No client writes at all: requests, friendships
--    and removals all go through the functions below.
-- ---------------------------------------------------------------------------

alter table public.friend_requests enable row level security;
alter table public.friendships enable row level security;

revoke all on public.friend_requests from public, anon;
revoke all on public.friendships from public, anon;
revoke insert, update, delete on public.friend_requests from authenticated;
revoke insert, update, delete on public.friendships from authenticated;
grant select on public.friend_requests to authenticated;
grant select on public.friendships to authenticated;

drop policy if exists "Users can read their own friend requests" on public.friend_requests;
create policy "Users can read their own friend requests"
  on public.friend_requests for select
  to authenticated
  using (from_user = (select auth.uid()) or to_user = (select auth.uid()));

drop policy if exists "Users can read their own friendships" on public.friendships;
create policy "Users can read their own friendships"
  on public.friendships for select
  to authenticated
  using (user_a = (select auth.uid()) or user_b = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 3. Send a request by six-digit ID
-- ---------------------------------------------------------------------------

create or replace function public.send_friend_request(p_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  code text := trim(coalesce(p_code, ''));
  target public.profiles%rowtype;
  incoming uuid;
  sent_today integer;
begin
  if me is null then
    raise exception 'Log in to add friends.';
  end if;
  if code !~ '^[1-9][0-9]{5}$' then
    raise exception 'A friend ID is exactly six digits, from 100000 to 999999.';
  end if;

  select * into target from public.profiles p where p.friend_code = code limit 1;
  if not found then
    raise exception 'No HackMate member has the ID %.', code;
  end if;
  if target.id = me then
    raise exception 'That is your own friend ID.';
  end if;
  if target.suspended then
    raise exception 'That account cannot receive friend requests.';
  end if;

  if exists (
    select 1 from public.friendships f
    where f.user_a = least(me, target.id) and f.user_b = greatest(me, target.id)
  ) then
    return jsonb_build_object(
      'status', 'friends',
      'friend', jsonb_build_object(
        'id', target.id, 'full_name', target.full_name, 'friend_code', target.friend_code
      )
    );
  end if;

  -- They already asked you: answer yes instead of creating a second request.
  select fr.id into incoming
  from public.friend_requests fr
  where fr.from_user = target.id and fr.to_user = me and fr.status = 'pending'
  limit 1;

  if incoming is not null then
    insert into public.friendships (user_a, user_b)
    values (least(me, target.id), greatest(me, target.id))
    on conflict do nothing;
    update public.friend_requests
       set status = 'accepted', responded_at = now()
     where id = incoming;
    return jsonb_build_object(
      'status', 'accepted',
      'friend', jsonb_build_object(
        'id', target.id, 'full_name', target.full_name, 'friend_code', target.friend_code
      )
    );
  end if;

  if exists (
    select 1 from public.friend_requests fr
    where fr.from_user = me and fr.to_user = target.id and fr.status = 'pending'
  ) then
    raise exception 'You already sent % a friend request.', split_part(target.full_name, ' ', 1);
  end if;

  select count(*) into sent_today
  from public.friend_requests fr
  where fr.from_user = me and fr.created_at > now() - interval '1 day';
  if sent_today >= 20 then
    raise exception 'You can send 20 friend requests a day. Try again tomorrow.';
  end if;

  -- A declined or accepted row for this pair is history: replace it so a new
  -- request can be sent after a decline or after being unfriended.
  delete from public.friend_requests fr
   where fr.from_user = me and fr.to_user = target.id;

  insert into public.friend_requests (from_user, to_user, status, created_at)
  values (me, target.id, 'pending', now());

  return jsonb_build_object(
    'status', 'pending',
    'friend', jsonb_build_object(
      'id', target.id, 'full_name', target.full_name, 'friend_code', target.friend_code
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Answer a request (recipient only)
-- ---------------------------------------------------------------------------

create or replace function public.respond_friend_request(p_request_id uuid, p_accept boolean)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  request_row public.friend_requests%rowtype;
begin
  if me is null then
    raise exception 'Log in to answer friend requests.';
  end if;

  select * into request_row
  from public.friend_requests fr
  where fr.id = p_request_id
  for update;

  if not found then
    raise exception 'That request is no longer available.';
  end if;
  if request_row.to_user <> me then
    raise exception 'Only the person who received a request can answer it.';
  end if;
  if request_row.status <> 'pending' then
    raise exception 'That request was already answered.';
  end if;

  if coalesce(p_accept, false) then
    insert into public.friendships (user_a, user_b)
    values (
      least(request_row.from_user, request_row.to_user),
      greatest(request_row.from_user, request_row.to_user)
    )
    on conflict do nothing;
    update public.friend_requests
       set status = 'accepted', responded_at = now()
     where id = request_row.id;
    return jsonb_build_object('status', 'accepted');
  end if;

  update public.friend_requests
     set status = 'declined', responded_at = now()
   where id = request_row.id;
  return jsonb_build_object('status', 'declined');
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Cancel a request you sent
-- ---------------------------------------------------------------------------

create or replace function public.cancel_friend_request(p_request_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  removed integer;
begin
  if me is null then
    raise exception 'Log in to cancel a friend request.';
  end if;

  delete from public.friend_requests fr
   where fr.id = p_request_id
     and fr.from_user = me
     and fr.status = 'pending';
  get diagnostics removed = row_count;

  if removed = 0 then
    raise exception 'That request was already answered or cancelled.';
  end if;

  return jsonb_build_object('status', 'cancelled');
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Remove a friend (either side)
-- ---------------------------------------------------------------------------

create or replace function public.remove_friend(p_user_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  removed integer;
begin
  if me is null then
    raise exception 'Log in to remove a friend.';
  end if;
  if p_user_id is null or p_user_id = me then
    raise exception 'That is not one of your friends.';
  end if;

  delete from public.friendships f
   where f.user_a = least(me, p_user_id) and f.user_b = greatest(me, p_user_id);
  get diagnostics removed = row_count;

  if removed = 0 then
    raise exception 'You are not friends with that person.';
  end if;

  return jsonb_build_object('status', 'removed');
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Reads: friends and the caller's own pending requests
--    id + display name + six-digit ID only. Never an email, phone or bio.
-- ---------------------------------------------------------------------------

create or replace function public.list_friends()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'full_name', p.full_name,
        'friend_code', p.friend_code
      )
      order by lower(p.full_name)
    ),
    '[]'::jsonb
  )
  from public.friendships f
  join public.profiles p
    on p.id = case
      when f.user_a = (select auth.uid()) then f.user_b
      else f.user_a
    end
  where (select auth.uid()) is not null
    and (f.user_a = (select auth.uid()) or f.user_b = (select auth.uid()));
$$;

create or replace function public.list_friend_requests()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'incoming', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', fr.id,
          'user_id', p.id,
          'full_name', p.full_name,
          'friend_code', p.friend_code,
          'created_at', fr.created_at
        ) order by fr.created_at desc
      )
      from public.friend_requests fr
      join public.profiles p on p.id = fr.from_user
      where fr.to_user = (select auth.uid()) and fr.status = 'pending'
    ), '[]'::jsonb),
    'sent', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', fr.id,
          'user_id', p.id,
          'full_name', p.full_name,
          'friend_code', p.friend_code,
          'created_at', fr.created_at
        ) order by fr.created_at desc
      )
      from public.friend_requests fr
      join public.profiles p on p.id = fr.to_user
      where fr.from_user = (select auth.uid()) and fr.status = 'pending'
    ), '[]'::jsonb)
  )
  where (select auth.uid()) is not null;
$$;

-- ---------------------------------------------------------------------------
-- 8. Dashboard reads: my rank and my hackathons
-- ---------------------------------------------------------------------------

create or replace function public.get_my_rank()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with scores as (
    select
      p.id,
      p.created_at,
      coalesce((
        select sum(ct.amount)
        from public.coin_transactions ct
        where ct.user_id = p.id
      ), 0) as coins,
      coalesce((
        select round(avg(r.rating)::numeric, 1)
        from public.reviews r
        where r.reviewee_id = p.id
      ), 0) as reputation
    from public.profiles p
  ),
  mine as (
    select * from scores where id = (select auth.uid())
  )
  select case
    when (select auth.uid()) is null then null
    when not exists (select 1 from mine) then null
    else jsonb_build_object(
      'points', (select coins from mine),
      'position', (
        select count(*) + 1
        from scores s, mine m
        where s.coins > m.coins
           or (s.coins = m.coins and s.reputation > m.reputation)
           or (s.coins = m.coins and s.reputation = m.reputation and s.created_at < m.created_at)
      ),
      'total', (select count(*) from scores)
    )
  end;
$$;

create or replace function public.get_my_hackathons()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', h.id,
        'slug', h.slug,
        'title', h.title,
        'starts_at', h.starts_at,
        'ends_at', h.ends_at,
        'status', h.status,
        'venue_name', h.venue_name,
        'city', h.city,
        'registered_at', r.created_at,
        'paid', r.paid
      ) order by h.starts_at desc
    ),
    '[]'::jsonb
  )
  from public.registrations r
  join public.hackathons h on h.id = r.hackathon_id
  where r.user_id = (select auth.uid())
    and (select auth.uid()) is not null;
$$;

-- ---------------------------------------------------------------------------
-- 9. Grants: signed-in callers only
-- ---------------------------------------------------------------------------

revoke all on function public.send_friend_request(text) from public, anon;
revoke all on function public.respond_friend_request(uuid, boolean) from public, anon;
revoke all on function public.cancel_friend_request(uuid) from public, anon;
revoke all on function public.remove_friend(uuid) from public, anon;
revoke all on function public.list_friends() from public, anon;
revoke all on function public.list_friend_requests() from public, anon;
revoke all on function public.get_my_rank() from public, anon;
revoke all on function public.get_my_hackathons() from public, anon;

grant execute on function public.send_friend_request(text) to authenticated;
grant execute on function public.respond_friend_request(uuid, boolean) to authenticated;
grant execute on function public.cancel_friend_request(uuid) to authenticated;
grant execute on function public.remove_friend(uuid) to authenticated;
grant execute on function public.list_friends() to authenticated;
grant execute on function public.list_friend_requests() to authenticated;
grant execute on function public.get_my_rank() to authenticated;
grant execute on function public.get_my_hackathons() to authenticated;

commit;

-- ---------------------------------------------------------------------------
-- Verification (read-only; run while signed in as a real user, not as postgres)
--
--   -- 1. My own requests only (should return only rows where I am a party).
--   select * from public.friend_requests;
--
--   -- 2. My friendships only.
--   select * from public.friendships;
--
--   -- 3. Names without secrets.
--   select public.list_friends();        -- id, full_name, friend_code only
--   select public.list_friend_requests();
--
--   -- 4. Rejections (each should raise an exception):
--   select public.send_friend_request('<my own code>');
--   select public.send_friend_request('000001');
--   select public.send_friend_request('1234567');
--
--   -- 5. A client cannot write the tables directly (both should fail):
--   insert into public.friendships (user_a, user_b) values (gen_random_uuid(), gen_random_uuid());
--   insert into public.friend_requests (from_user, to_user) values (gen_random_uuid(), gen_random_uuid());
--
--   -- 6. Nobody can suspend themselves (the flag is restored):
--   update public.profiles set suspended = false where id = (select auth.uid());
-- ---------------------------------------------------------------------------
