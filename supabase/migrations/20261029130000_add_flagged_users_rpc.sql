-- ===========================================================================
-- HackMate: admin-only "flagged users" read
-- ---------------------------------------------------------------------------
-- A user is flagged when TWO OR MORE DIFFERENT members reported them. One
-- person filing several reports only counts once, so a single grudge cannot
-- flag somebody.
--
-- What it adds
--   public.list_flagged_users() -> jsonb
--     [
--       {
--         user_id, full_name, friend_code,
--         reporter_count,   -- distinct reporter_id values (>= 2)
--         report_count,     -- total rows, including repeats by one reporter
--         reasons: [ "..." ],                       -- distinct reasons
--         reporters: [ { reporter_id, reporter_name, reason, context,
--                        created_at } ]             -- newest first
--       }
--     ]
--   Ordered by reporter_count desc, then name.
--
-- Access
--   SECURITY DEFINER, set search_path = public, and an explicit is_admin()
--   check inside the function. Revoked from public and anon; only
--   authenticated may call it, and non-admins get an exception.
--
-- Data impact: none. Reads public.reports and public.profiles only.
-- Safe to run twice: create or replace + repeated revoke/grant.
-- Dependencies: 20261029121000 (public.reports), 20261026130000 (public.is_admin).
-- ===========================================================================

begin;

create or replace function public.list_flagged_users()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  flagged jsonb;
begin
  if not public.is_admin() then
    raise exception 'Only admins can read flagged users.';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'user_id', f.reported_user_id,
        'full_name', coalesce(nullif(btrim(p.full_name), ''), 'A HackMate member'),
        'friend_code', p.friend_code,
        'reporter_count', f.reporter_count,
        'report_count', f.report_count,
        'reasons', f.reasons,
        'reporters', f.reporters
      )
      order by f.reporter_count desc, lower(coalesce(p.full_name, ''))
    ),
    '[]'::jsonb
  )
  into flagged
  from (
    select
      r.reported_user_id,
      count(distinct r.reporter_id) as reporter_count,
      count(*) as report_count,
      jsonb_agg(distinct r.reason) as reasons,
      jsonb_agg(
        jsonb_build_object(
          'reporter_id', r.reporter_id,
          'reporter_name', coalesce(nullif(btrim(rp.full_name), ''), 'A HackMate member'),
          'reason', r.reason,
          'context', r.context,
          'created_at', r.created_at
        )
        order by r.created_at desc
      ) as reporters
    from public.reports r
    left join public.profiles rp on rp.id = r.reporter_id
    group by r.reported_user_id
    having count(distinct r.reporter_id) >= 2
  ) f
  left join public.profiles p on p.id = f.reported_user_id;

  return flagged;
end;
$$;

comment on function public.list_flagged_users() is
  'Admins only: members reported by two or more different people, with every reason and reporter.';

revoke all on function public.list_flagged_users() from public, anon;
grant execute on function public.list_flagged_users() to authenticated;

commit;

-- ---------------------------------------------------------------------------
-- Verification (read-only; run while signed in as an admin)
--
--   select public.list_flagged_users();
--
--   -- A non-admin gets: ERROR: Only admins can read flagged users.
--   -- A signed-out caller gets: permission denied for function list_flagged_users
-- ---------------------------------------------------------------------------

notify pgrst, 'reload schema';
