create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null
    check (username ~ '^[A-Za-z0-9_]{3,30}$'),
  full_name text not null
    check (char_length(trim(full_name)) between 1 and 100),
  avatar_url text,
  bio text
    check (bio is null or char_length(bio) <= 500),
  institution text
    check (institution is null or char_length(institution) <= 150),
  location text
    check (location is null or char_length(location) <= 150),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index profiles_username_lower_uidx
  on public.profiles (lower(username));

create table public.skills (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
    check (char_length(trim(name)) between 1 and 80),
  category text
    check (category is null or char_length(category) <= 80),
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_skills (
  user_id uuid not null references public.profiles (id) on delete cascade,
  skill_id uuid not null references public.skills (id) on delete cascade,
  proficiency smallint not null default 1
    check (proficiency between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, skill_id)
);

create index user_skills_skill_id_idx on public.user_skills (skill_id);

create table public.hackathons (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique
    check (slug ~ '^[a-z0-9]+([a-z0-9-]*[a-z0-9])?$'),
  title text not null
    check (char_length(trim(title)) between 1 and 160),
  organizer text
    check (organizer is null or char_length(organizer) <= 160),
  description text,
  category text
    check (category is null or char_length(category) <= 100),
  location text
    check (location is null or char_length(location) <= 200),
  prize text
    check (prize is null or char_length(prize) <= 200),
  registration_deadline timestamptz,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'upcoming'
    check (status in ('draft', 'upcoming', 'active', 'completed', 'cancelled')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (registration_deadline is null or registration_deadline <= starts_at)
);

create index hackathons_status_starts_at_idx
  on public.hackathons (status, starts_at);
create index hackathons_created_by_idx on public.hackathons (created_by);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  hackathon_id uuid not null references public.hackathons (id) on delete cascade,
  name text not null
    check (char_length(trim(name)) between 1 and 100),
  description text
    check (description is null or char_length(description) <= 1000),
  max_members smallint not null default 4
    check (max_members between 1 and 100),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index teams_hackathon_name_lower_uidx
  on public.teams (hackathon_id, lower(name));
create index teams_created_by_idx on public.teams (created_by);

create table public.team_members (
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member'
    check (role in ('leader', 'member')),
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

create index team_members_user_id_idx on public.team_members (user_id);
create unique index team_members_one_leader_per_team_uidx
  on public.team_members (team_id)
  where role = 'leader';

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  title text not null
    check (char_length(trim(title)) between 1 and 160),
  description text,
  repository_url text,
  demo_url text,
  status text not null default 'draft'
    check (status in ('draft', 'in_progress', 'submitted', 'winner', 'archived')),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index projects_team_id_idx on public.projects (team_id);
create index projects_status_idx on public.projects (status);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  title text not null
    check (char_length(trim(title)) between 1 and 160),
  description text,
  status text not null default 'todo'
    check (status in ('todo', 'in_progress', 'done', 'blocked')),
  priority smallint not null default 3
    check (priority between 1 and 5),
  assigned_to uuid references public.profiles (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  due_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tasks_project_status_idx on public.tasks (project_id, status);
create index tasks_assigned_to_idx on public.tasks (assigned_to);
create index tasks_created_by_idx on public.tasks (created_by);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  reviewer_id uuid not null references public.profiles (id) on delete cascade,
  reviewee_id uuid not null references public.profiles (id) on delete cascade,
  rating smallint not null
    check (rating between 1 and 5),
  comment text
    check (comment is null or char_length(comment) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (reviewer_id <> reviewee_id),
  unique (project_id, reviewer_id, reviewee_id)
);

create index reviews_reviewee_id_idx on public.reviews (reviewee_id);
create index reviews_reviewer_id_idx on public.reviews (reviewer_id);

create table public.coin_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  amount integer not null
    check (amount <> 0),
  transaction_type text not null
    check (transaction_type in ('earned', 'spent', 'refund', 'adjustment')),
  description text
    check (description is null or char_length(description) <= 500),
  created_at timestamptz not null default now(),
  check (
    (transaction_type = 'spent' and amount < 0)
    or (transaction_type in ('earned', 'refund') and amount > 0)
    or transaction_type = 'adjustment'
  )
);

create index coin_transactions_user_created_at_idx
  on public.coin_transactions (user_id, created_at desc);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger skills_set_updated_at
  before update on public.skills
  for each row execute function public.set_updated_at();
create trigger user_skills_set_updated_at
  before update on public.user_skills
  for each row execute function public.set_updated_at();
create trigger hackathons_set_updated_at
  before update on public.hackathons
  for each row execute function public.set_updated_at();
create trigger teams_set_updated_at
  before update on public.teams
  for each row execute function public.set_updated_at();
create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();
create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();
create trigger reviews_set_updated_at
  before update on public.reviews
  for each row execute function public.set_updated_at();
