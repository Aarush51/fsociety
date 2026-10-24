-- Team-scoped Row Level Security for projects, tasks, and reviews.
--
-- Access model
--   * Anonymous visitors have no access at all.
--   * Signed-in users can read projects, tasks, and reviews only for teams they
--     belong to (a review's subject can always read reviews about themselves).
--   * Projects are managed by the team leader; other members get read access.
--   * Any team member can create and update tasks on their team's projects;
--     a task can be deleted by the team leader or by the person who created it.
--   * A review must be written by a member of the project's team about another
--     member of that same team, and only its author can edit or delete it.
--
-- Membership checks live in SECURITY DEFINER helpers because team_members has
-- RLS enabled with no policies: a policy expression runs with the caller's
-- privileges, so a direct subquery on team_members would see zero rows.
--
-- Idempotent: enabling RLS again is a no-op, and Postgres has no
-- CREATE POLICY IF NOT EXISTS, so every policy is dropped before re-creation.

-- ---------------------------------------------------------------------------
-- Membership helpers
-- ---------------------------------------------------------------------------

create or replace function public.is_team_member(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.team_members tm
    where tm.team_id = p_team_id
      and tm.user_id = (select auth.uid())
  );
$$;

create or replace function public.is_team_leader(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.team_members tm
    where tm.team_id = p_team_id
      and tm.user_id = (select auth.uid())
      and tm.role = 'leader'
  );
$$;

create or replace function public.is_project_team_member(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.projects pr
    join public.team_members tm on tm.team_id = pr.team_id
    where pr.id = p_project_id
      and tm.user_id = (select auth.uid())
  );
$$;

create or replace function public.is_project_team_leader(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.projects pr
    join public.team_members tm on tm.team_id = pr.team_id
    where pr.id = p_project_id
      and tm.user_id = (select auth.uid())
      and tm.role = 'leader'
  );
$$;

-- Used to validate that an assignee/reviewee belongs to the project's team.
create or replace function public.is_team_member_of_project(p_project_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.projects pr
    join public.team_members tm on tm.team_id = pr.team_id
    where pr.id = p_project_id
      and tm.user_id = p_user_id
  );
$$;

revoke all on function public.is_team_member(uuid) from public, anon;
revoke all on function public.is_team_leader(uuid) from public, anon;
revoke all on function public.is_project_team_member(uuid) from public, anon;
revoke all on function public.is_project_team_leader(uuid) from public, anon;
revoke all on function public.is_team_member_of_project(uuid, uuid) from public, anon;

grant execute on function public.is_team_member(uuid) to authenticated;
grant execute on function public.is_team_leader(uuid) to authenticated;
grant execute on function public.is_project_team_member(uuid) to authenticated;
grant execute on function public.is_project_team_leader(uuid) to authenticated;
grant execute on function public.is_team_member_of_project(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Grants + RLS
-- ---------------------------------------------------------------------------

revoke all on public.projects, public.tasks, public.reviews from public, anon;
grant select, insert, update, delete on public.projects, public.tasks, public.reviews to authenticated;

alter table public.projects enable row level security;
alter table public.tasks enable row level security;
alter table public.reviews enable row level security;

-- ---------------------------------------------------------------------------
-- projects
-- ---------------------------------------------------------------------------

drop policy if exists "Team members can read their team projects" on public.projects;
create policy "Team members can read their team projects"
  on public.projects for select
  to authenticated
  using (public.is_team_member(projects.team_id));

drop policy if exists "Team leaders can create projects" on public.projects;
create policy "Team leaders can create projects"
  on public.projects for insert
  to authenticated
  with check (public.is_team_leader(projects.team_id));

drop policy if exists "Team leaders can update their projects" on public.projects;
create policy "Team leaders can update their projects"
  on public.projects for update
  to authenticated
  using (public.is_team_leader(projects.team_id))
  with check (public.is_team_leader(projects.team_id));

drop policy if exists "Team leaders can delete their projects" on public.projects;
create policy "Team leaders can delete their projects"
  on public.projects for delete
  to authenticated
  using (public.is_team_leader(projects.team_id));

-- ---------------------------------------------------------------------------
-- tasks
-- ---------------------------------------------------------------------------

drop policy if exists "Team members can read their project tasks" on public.tasks;
create policy "Team members can read their project tasks"
  on public.tasks for select
  to authenticated
  using (public.is_project_team_member(tasks.project_id));

drop policy if exists "Team members can create project tasks" on public.tasks;
create policy "Team members can create project tasks"
  on public.tasks for insert
  to authenticated
  with check (
    public.is_project_team_member(tasks.project_id)
    and (tasks.created_by is null or tasks.created_by = (select auth.uid()))
    and (
      tasks.assigned_to is null
      or public.is_team_member_of_project(tasks.project_id, tasks.assigned_to)
    )
  );

drop policy if exists "Team members can update project tasks" on public.tasks;
create policy "Team members can update project tasks"
  on public.tasks for update
  to authenticated
  using (public.is_project_team_member(tasks.project_id))
  with check (
    public.is_project_team_member(tasks.project_id)
    and (
      tasks.assigned_to is null
      or public.is_team_member_of_project(tasks.project_id, tasks.assigned_to)
    )
  );

drop policy if exists "Team leaders and task creators can delete tasks" on public.tasks;
create policy "Team leaders and task creators can delete tasks"
  on public.tasks for delete
  to authenticated
  using (
    public.is_project_team_leader(tasks.project_id)
    or tasks.created_by = (select auth.uid())
  );

-- ---------------------------------------------------------------------------
-- reviews
-- ---------------------------------------------------------------------------

drop policy if exists "Team members can read project reviews" on public.reviews;
create policy "Team members can read project reviews"
  on public.reviews for select
  to authenticated
  using (
    public.is_project_team_member(reviews.project_id)
    or reviews.reviewee_id = (select auth.uid())
  );

drop policy if exists "Team members can write reviews for their teammates" on public.reviews;
create policy "Team members can write reviews for their teammates"
  on public.reviews for insert
  to authenticated
  with check (
    reviews.reviewer_id = (select auth.uid())
    and public.is_project_team_member(reviews.project_id)
    and public.is_team_member_of_project(reviews.project_id, reviews.reviewee_id)
  );

drop policy if exists "Authors can update their own reviews" on public.reviews;
create policy "Authors can update their own reviews"
  on public.reviews for update
  to authenticated
  using (reviews.reviewer_id = (select auth.uid()))
  with check (
    reviews.reviewer_id = (select auth.uid())
    and public.is_project_team_member(reviews.project_id)
    and public.is_team_member_of_project(reviews.project_id, reviews.reviewee_id)
  );

drop policy if exists "Authors can delete their own reviews" on public.reviews;
create policy "Authors can delete their own reviews"
  on public.reviews for delete
  to authenticated
  using (reviews.reviewer_id = (select auth.uid()));
