-- ===========================================================================
-- HackMate: Huddle chat, abuse reports, and hackathon-linked reviews
-- ---------------------------------------------------------------------------
-- What it adds, in order
--   1. public.friend_requests   table + indexes   (same definition as
--                              20261028120000_add_friends.sql; a no-op when
--                              that file has already been applied)
--   2. public.friendships       table + index     (same, no-op when applied)
--   3. public.messages          table + indexes   (new: team chat and 1:1 chat)
--   4. public.reports           table + index     (new: one report per pair)
--   5. public.reviews.hackathon_id  nullable column + FK + index + partial
--                                   unique key (existing rows keep NULL)
--   6. public.friend_pair_key(a, b)  ordered "uuid:uuid" helper for 1:1 chats
--   7. RLS + grants for all five tables; existing reviews policies untouched
--   8. Realtime on public.messages
--
-- Data impact
--   * Steps 1-4 create missing objects only; nothing existing is written.
--   * Step 5 only adds a nullable column. Every existing review keeps
--     hackathon_id = NULL, so no row is rewritten or re-validated.
--   * No table is dropped or truncated, no row is deleted, no existing policy
--     is removed or loosened, and no existing grant is widened.
--
-- Safe to run twice: create table/index/column if not exists, guarded
-- constraint and publication blocks, drop policy if exists before create.
-- Dependencies: 20261016231643 (profiles, teams, hackathons, reviews),
--               20261020143000 (is_team_member), 20261026130000 (is_admin).
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Friend requests
--    One row per (sender, recipient) pair. Same shape, names and constraints
--    as 20261028120000_add_friends.sql so both files agree.
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

-- ---------------------------------------------------------------------------
-- 2. Friendships
--    One row per pair, always stored user_a < user_b, so the pair is unique
--    no matter who accepted.
-- ---------------------------------------------------------------------------

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
-- 3. Messages
--    Exactly one destination per row: a team chat (team_id) or a 1:1 chat
--    (friend_pair). friend_pair is two UUIDs in ascending order joined by
--    ":", built with public.friend_pair_key() below. No edit or delete in this
--    version, so the client never gets UPDATE/DELETE.
-- ---------------------------------------------------------------------------

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles (id) on delete cascade,
  team_id uuid references public.teams (id) on delete cascade,
  friend_pair text,
  body text not null
    check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  constraint messages_one_chat check (num_nonnulls(team_id, friend_pair) = 1),
  constraint messages_friend_pair_shape check (
    friend_pair is null
    or friend_pair ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  )
);

create index if not exists messages_team_idx
  on public.messages (team_id, created_at desc);
create index if not exists messages_friend_pair_idx
  on public.messages (friend_pair, created_at desc);
create index if not exists messages_sender_idx
  on public.messages (sender_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 4. Reports
--    One report per (reporter, reported user) pair. Reasons are capped and
--    both parties must be different people.
-- ---------------------------------------------------------------------------

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  reported_user_id uuid not null references public.profiles (id) on delete cascade,
  reason text not null
    check (char_length(btrim(reason)) between 3 and 500),
  context text
    check (context is null or char_length(context) <= 2000),
  created_at timestamptz not null default now(),
  constraint reports_no_self check (reporter_id <> reported_user_id),
  constraint reports_reporter_reported_key unique (reporter_id, reported_user_id)
);

create index if not exists reports_reported_user_idx
  on public.reports (reported_user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 5. Reviews: link a review to a hackathon
--    public.reviews already exists (project_id, reviewer_id, reviewee_id,
--    rating, comment, created_at, updated_at). hackathon_id is added as a
--    NULLABLE column so every existing row stays valid and untouched.
-- ---------------------------------------------------------------------------

alter table public.reviews
  add column if not exists hackathon_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.reviews'::regclass
      and conname = 'reviews_hackathon_id_fkey'
  ) then
    alter table public.reviews
      add constraint reviews_hackathon_id_fkey
      foreign key (hackathon_id) references public.hackathons (id) on delete set null;
  end if;
end
$$;

create index if not exists reviews_hackathon_id_idx
  on public.reviews (hackathon_id);

-- One review per reviewer/reviewee inside a hackathon. Scoped to rows that
-- actually carry a hackathon_id, so the existing project-based rows and the
-- existing unique (project_id, reviewer_id, reviewee_id) are unaffected.
create unique index if not exists reviews_hackathon_pair_key
  on public.reviews (hackathon_id, reviewer_id, reviewee_id)
  where hackathon_id is not null;

-- ---------------------------------------------------------------------------
-- 6. Ordered pair key for 1:1 chats
--    friend_pair_key(a, b) === friend_pair_key(b, a), so both members of a
--    conversation read and write the same friend_pair value.
-- ---------------------------------------------------------------------------

create or replace function public.friend_pair_key(p_user_a uuid, p_user_b uuid)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_user_a is null or p_user_b is null or p_user_a = p_user_b then null
    else least(p_user_a, p_user_b)::text || ':' || greatest(p_user_a, p_user_b)::text
  end;
$$;

comment on function public.friend_pair_key(uuid, uuid) is
  'Ordered "uuid:uuid" key used by public.messages.friend_pair.';

revoke all on function public.friend_pair_key(uuid, uuid) from public, anon;
grant execute on function public.friend_pair_key(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Row Level Security
--    Requests and friendships: read your own rows, no client writes.
--    Messages: read and send only inside a chat you belong to.
--    Reports: any signed-in user may file one; only admins may read them.
--    Reviews: RLS is already on and its policies are left exactly as they are.
-- ---------------------------------------------------------------------------

alter table public.friend_requests enable row level security;
alter table public.friendships enable row level security;
alter table public.messages enable row level security;
alter table public.reports enable row level security;
alter table public.reviews enable row level security;

-- Friend requests: no direct writes, ever.
revoke all on public.friend_requests from public, anon;
revoke insert, update, delete on public.friend_requests from authenticated;
grant select on public.friend_requests to authenticated;

drop policy if exists "Users can read their own friend requests" on public.friend_requests;
create policy "Users can read their own friend requests"
  on public.friend_requests for select
  to authenticated
  using (from_user = (select auth.uid()) or to_user = (select auth.uid()));

-- Friendships: no direct writes, ever.
revoke all on public.friendships from public, anon;
revoke insert, update, delete on public.friendships from authenticated;
grant select on public.friendships to authenticated;

drop policy if exists "Users can read their own friendships" on public.friendships;
create policy "Users can read their own friendships"
  on public.friendships for select
  to authenticated
  using (user_a = (select auth.uid()) or user_b = (select auth.uid()));

-- Messages: append-only for members of that chat.
revoke all on public.messages from public, anon, authenticated;
grant select, insert on public.messages to authenticated;

drop policy if exists "Members can read their chats" on public.messages;
create policy "Members can read their chats"
  on public.messages for select
  to authenticated
  using (
    (team_id is not null and public.is_team_member(team_id))
    or (
      friend_pair is not null
      and (select auth.uid())::text in (
        split_part(friend_pair, ':', 1),
        split_part(friend_pair, ':', 2)
      )
    )
  );

drop policy if exists "Members can send in their chats" on public.messages;
create policy "Members can send in their chats"
  on public.messages for insert
  to authenticated
  with check (
    sender_id = (select auth.uid())
    and (
      (team_id is not null and public.is_team_member(team_id))
      or (
        friend_pair is not null
        and (select auth.uid())::text in (
          split_part(friend_pair, ':', 1),
          split_part(friend_pair, ':', 2)
        )
      )
    )
  );

-- Reports: insert your own, read only as an admin. No update, no delete.
revoke all on public.reports from public, anon, authenticated;
grant select, insert on public.reports to authenticated;

drop policy if exists "Users can file a report" on public.reports;
create policy "Users can file a report"
  on public.reports for insert
  to authenticated
  with check (
    reporter_id = (select auth.uid())
    and reported_user_id <> (select auth.uid())
  );

drop policy if exists "Admins can read reports" on public.reports;
create policy "Admins can read reports"
  on public.reports for select
  to authenticated
  using (public.is_admin());

-- Reviews: RLS stays enabled and every existing policy is untouched, so the
-- new hackathon_id column cannot widen who sees a review.

-- ---------------------------------------------------------------------------
-- 8. Realtime on messages
--    Supabase's publication is created by the platform; only add the table if
--    the publication exists and does not already contain it. replica identity
--    full makes the row payload complete enough for the RLS policies above.
-- ---------------------------------------------------------------------------

alter table public.messages replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'messages'
    ) then
      alter publication supabase_realtime add table public.messages;
    end if;
  end if;
end
$$;

commit;

-- ---------------------------------------------------------------------------
-- Verification (read-only; run while signed in as a real member)
--
--   -- 1. Only my own requests and friendships:
--   select * from public.friend_requests;
--   select * from public.friendships;
--
--   -- 2. Only chats I belong to (zero rows unless I am a member):
--   select * from public.messages;
--
--   -- 3. Reports: insert works, select returns nothing unless I am an admin:
--   -- insert into public.reports (reporter_id, reported_user_id, reason)
--   --   values ((select auth.uid()), '<other uuid>', 'spam');
--   select * from public.reports;
--
--   -- 4. A second report for the same person is rejected by the unique key.
--
--   -- 5. Realtime is on:
--   select * from pg_publication_tables
--    where pubname = 'supabase_realtime' and tablename = 'messages';
--
--   -- 6. Reviews keep their old rows:
--   select count(*) filter (where hackathon_id is null) as project_reviews,
--          count(*) filter (where hackathon_id is not null) as event_reviews
--     from public.reviews;
-- ---------------------------------------------------------------------------

notify pgrst, 'reload schema';
