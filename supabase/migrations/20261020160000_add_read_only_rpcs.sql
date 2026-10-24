-- Read-only RPCs for project tasks, received reviews, and the coin ledger.
--
-- Why RPCs instead of table reads: tasks/projects/reviews are guarded by
-- team-scoped RLS policies, and coin_transactions only allows owners to select
-- their own rows. These functions are SECURITY DEFINER so a page can load the
-- data it needs in one round trip, and each one re-checks ownership with
-- auth.uid() before returning anything:
--
--   get_project_tasks(uuid)        team members only, otherwise NULL
--   get_my_received_reviews()      reviews where the caller is the reviewee
--   get_my_coin_transactions(int)  the caller's own ledger, newest first
--
-- Anonymous callers are revoked; signed-in callers who are not entitled to the
-- rows get NULL (tasks) or an empty list (reviews/coins) rather than an error.

-- ---------------------------------------------------------------------------
-- Project board: project header + its tasks
-- ---------------------------------------------------------------------------

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
                 t.max_members
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

-- ---------------------------------------------------------------------------
-- Reviews the caller received, newest first
-- ---------------------------------------------------------------------------

create or replace function public.get_my_received_reviews()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(to_jsonb(review_row) order by review_row.created_at desc), '[]'::jsonb)
  from (
    select rv.id,
           rv.rating,
           rv.comment,
           rv.created_at,
           rv.updated_at,
           rv.project_id,
           pr.title as project_title,
           t.id as team_id,
           t.name as team_name,
           rv.reviewer_id,
           reviewer.full_name as reviewer_name,
           reviewer.username as reviewer_username
    from public.reviews rv
    join public.projects pr on pr.id = rv.project_id
    join public.teams t on t.id = pr.team_id
    join public.profiles reviewer on reviewer.id = rv.reviewer_id
    where rv.reviewee_id = (select auth.uid())
  ) review_row;
$$;

-- ---------------------------------------------------------------------------
-- Coin ledger: balance, total count, and the newest page of transactions
-- ---------------------------------------------------------------------------

create or replace function public.get_my_coin_transactions(p_limit integer default 50)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with ledger as (
    select ct.id,
           ct.amount,
           ct.transaction_type,
           ct.description,
           ct.created_at
    from public.coin_transactions ct
    where ct.user_id = (select auth.uid())
  )
  select jsonb_build_object(
    'balance', coalesce((select sum(l.amount) from ledger l), 0),
    'transaction_count', (select count(*) from ledger l),
    'transactions', coalesce((
      select jsonb_agg(to_jsonb(page) order by page.created_at desc, page.id desc)
      from (
        select l.id, l.amount, l.transaction_type, l.description, l.created_at
        from ledger l
        order by l.created_at desc, l.id desc
        limit greatest(1, least(coalesce(p_limit, 50), 200))
      ) page
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.get_project_tasks(uuid) from public, anon;
revoke all on function public.get_my_received_reviews() from public, anon;
revoke all on function public.get_my_coin_transactions(integer) from public, anon;

grant execute on function public.get_project_tasks(uuid) to authenticated;
grant execute on function public.get_my_received_reviews() to authenticated;
grant execute on function public.get_my_coin_transactions(integer) to authenticated;
