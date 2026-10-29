-- ===========================================================================
-- HackMate: one read helper for both chat kinds
-- ---------------------------------------------------------------------------
-- Why this exists
--   public.profiles is readable only by its owner, so the browser cannot join
--   messages -> profiles to render a sender name. This SECURITY DEFINER read
--   returns the conversation plus the display names of its members, and nothing
--   else. It never exposes an email, phone, username or bio.
--
-- What it adds
--   public.list_chat_messages(p_team_id uuid, p_friend_pair text) -> jsonb
--     { participants: [{ id, full_name }], messages: [{ id, sender_id,
--       sender_name, body, created_at }] }
--     * team chat:    p_team_id, caller must be a member of that team
--     * 1:1 chat:     p_friend_pair ("uuid:uuid", either order), caller must be
--                     one of the two uuids
--     * returns NULL when the caller may not read the conversation
--     * newest 100 messages, returned oldest-first
--
-- Data impact: none. Reads only.
-- Safe to run twice: create or replace + repeated revoke/grant.
-- Dependencies: 20261029121000 (messages table), 20261020143000
--               (is_team_member).
-- ===========================================================================

begin;

create or replace function public.list_chat_messages(
  p_team_id uuid default null,
  p_friend_pair text default null
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select (select auth.uid()) as uid
  ),
  pair as (
    select
      split_part(p_friend_pair, ':', 1)::uuid as user_a,
      split_part(p_friend_pair, ':', 2)::uuid as user_b
    where p_friend_pair
      ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ),
  allowed as (
    select me.uid
    from me
    where me.uid is not null
      and (
        (p_team_id is not null and p_friend_pair is null
          and public.is_team_member(p_team_id))
        or (
          p_team_id is null
          and exists (
            select 1 from pair where me.uid in (pair.user_a, pair.user_b)
          )
        )
      )
  ),
  visible as (
    select
      m.id,
      m.sender_id,
      m.body,
      m.created_at,
      coalesce(nullif(btrim(p.full_name), ''), 'A HackMate member') as sender_name
    from public.messages m
    left join public.profiles p on p.id = m.sender_id
    where exists (select 1 from allowed)
      and (
        (p_team_id is not null and m.team_id = p_team_id)
        or (p_friend_pair is not null and m.friend_pair = p_friend_pair)
      )
    order by m.created_at desc
    limit 100
  ),
  participants as (
    select p.id, p.full_name
    from public.profiles p
    where p.id in (
      select tm.user_id
      from public.team_members tm
      where p_team_id is not null and tm.team_id = p_team_id
      union
      select pair.user_a from pair
      union
      select pair.user_b from pair
    )
  )
  select case
    when not exists (select 1 from allowed) then null
    else jsonb_build_object(
      'messages', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', v.id,
            'sender_id', v.sender_id,
            'sender_name', v.sender_name,
            'body', v.body,
            'created_at', v.created_at
          ) order by v.created_at
        )
        from visible v
      ), '[]'::jsonb),
      'participants', coalesce((
        select jsonb_agg(
          jsonb_build_object('id', pa.id, 'full_name', pa.full_name)
          order by lower(pa.full_name)
        )
        from participants pa
      ), '[]'::jsonb)
    )
  end;
$$;

comment on function public.list_chat_messages(uuid, text) is
  'Team or 1:1 chat for a participant only: messages with sender names. Returns null for anyone else.';

revoke all on function public.list_chat_messages(uuid, text) from public, anon;
grant execute on function public.list_chat_messages(uuid, text) to authenticated;

commit;

-- ---------------------------------------------------------------------------
-- Verification (read-only; run while signed in as a real member)
--
--   -- My team chat (replace with a team I am on):
--   select public.list_chat_messages('<team uuid>', null);
--
--   -- My 1:1 chat with a friend:
--   select public.list_chat_messages(null, '<my uuid>:<their uuid>');
--
--   -- Anyone else's conversation returns null:
--   select public.list_chat_messages('<team i am not on>', null);
-- ---------------------------------------------------------------------------

notify pgrst, 'reload schema';
