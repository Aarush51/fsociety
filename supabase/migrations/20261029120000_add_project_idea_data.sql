-- 2026-10-29 — keep the whole generated idea with the project it became.
--
-- Why this exists
--   "Use This Idea" used to write only a composed text description into
--   public.projects, so the problem statement, risks, team roles, difficulty,
--   estimated time and the generator brief were lost and the Dashboard could
--   not reopen an idea. From now on the complete idea is stored as one JSON
--   object in public.projects.idea_data.
--
-- Shape of idea_data (written by src/lib/projects.js -> composeIdeaData)
--   {
--     "title": "...", "problem": "...", "solution": "...",
--     "key_features": ["..."], "target_users": "...", "tech_stack": ["..."],
--     "required_team_roles": ["..."], "difficulty": "...",
--     "estimated_time": "...", "risks": ["..."], "why_it_fits": "...",
--     "brief": { "hackathon": { "title": "...", "category": "..." },
--                "skills": ["..."], "teamSkills": ["..."],
--                "interests": "...", "time": "..." }
--   }
--   Projects created before this migration keep NULL here; the app shows their
--   title and description and labels them as incomplete.
--
-- Safety
--   * Safe to run twice: add column if not exists, and the constraint is only
--     added when it is not already there.
--   * No table is dropped, truncated or deleted from, and no row is rewritten.
--     The column is nullable, so every existing project stays exactly as it is.
--   * No policy or grant changes: authenticated users already hold select /
--     insert / update / delete on public.projects, which covers this column,
--     and RLS on public.projects is untouched.

alter table public.projects
  add column if not exists idea_data jsonb;

comment on column public.projects.idea_data is
  'Complete generated idea (problem, solution, key features, target users, tech stack, team roles, difficulty, estimated time, risks, why it fits) plus the generator brief. NULL for projects saved before this column existed.';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.projects'::regclass
      and conname = 'projects_idea_data_is_object'
  ) then
    alter table public.projects
      add constraint projects_idea_data_is_object
      check (idea_data is null or jsonb_typeof(idea_data) = 'object');
  end if;
end;
$$;

notify pgrst, 'reload schema';
