-- Skills, interests and hobbies on the profile row.
--
--   profiles.skills     jsonb  { "React": 2, "Figma": 3 } — levels are 1..3
--   profiles.interests  text[] { "education", "climate" }
--   profiles.hobbies    text   free text, optional
--
-- Read and written through two new RPCs, so the existing profile calls are left
-- exactly as they are:
--
--   get_my_profile_extras()                      -> { skill_levels, interests, hobbies }
--   save_my_profile_extras(jsonb, text[], text)  validates, saves, echoes back
--
-- The signup form sends the same three fields as auth metadata, so a new account
-- keeps them even when the email has to be confirmed first: the
-- profiles_fill_signup_extras trigger copies skills, interests and hobbies out
-- of auth.users.raw_user_meta_data, using the same rules.
--
-- Validation lives in public.clean_skill_levels() and public.clean_interests()
-- and mirrors src/features/teams/SkillsFields.jsx: at most 20 skills with levels
-- 1..3, at most 15 interests, each name trimmed to 40 characters, no duplicates
-- that differ only by case, hobbies trimmed to 500 characters. Anything that
-- does not fit is dropped, never an error.
--
-- Nothing here touches RLS: a signed-in user can already write these columns on
-- their own row through the existing "Users can update their own profile"
-- policy, and the RPCs below go through auth.uid() as well. Existing rows keep
-- the defaults ('{}' / '{}' / null), so older profiles read as empty rather than
-- null. The free-text skills in public.skills and public.user_skills are
-- untouched — this is a second, level-based model that sits beside them.
--
-- Safe to re-run: the columns use IF NOT EXISTS, every function is replaced and
-- the trigger is dropped first.

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists skills jsonb not null default '{}'::jsonb,
  add column if not exists interests text[] not null default '{}'::text[],
  add column if not exists hobbies text;

-- ---------------------------------------------------------------------------
-- 2. The shared validation, used by both the RPC and the signup trigger
-- ---------------------------------------------------------------------------

create or replace function public.clean_skill_levels(p_skills jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  cleaned jsonb := '{}'::jsonb;
  seen text[] := array[]::text[];
  kept integer := 0;
  entry record;
  skill_name text;
  skill_level integer;
begin
  if p_skills is null or jsonb_typeof(p_skills) <> 'object' then
    return '{}'::jsonb;
  end if;

  for entry in select key, value from jsonb_each_text(p_skills) order by key loop
    exit when kept >= 20;
    skill_name := trim(entry.key);
    skill_level := case when entry.value in ('1', '2', '3') then entry.value::integer end;
    continue when skill_level is null
      or char_length(skill_name) not between 1 and 40
      or lower(skill_name) = any (seen);
    cleaned := cleaned || jsonb_build_object(skill_name, skill_level);
    seen := seen || lower(skill_name);
    kept := kept + 1;
  end loop;

  return cleaned;
end;
$$;

create or replace function public.clean_interests(p_interests text[])
returns text[]
language plpgsql
immutable
set search_path = ''
as $$
declare
  cleaned text[] := array[]::text[];
  seen text[] := array[]::text[];
  interest text;
begin
  foreach interest in array coalesce(p_interests, array[]::text[]) loop
    exit when cardinality(cleaned) >= 15;
    interest := trim(interest);
    continue when char_length(interest) not between 1 and 40
      or lower(interest) = any (seen);
    cleaned := cleaned || interest;
    seen := seen || lower(interest);
  end loop;

  return cleaned;
end;
$$;

revoke all on function public.clean_skill_levels(jsonb) from public, anon, authenticated;
revoke all on function public.clean_interests(text[]) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Read and write RPCs for the signed-in user
-- ---------------------------------------------------------------------------

create or replace function public.get_my_profile_extras()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select jsonb_build_object(
        'skill_levels', coalesce(p.skills, '{}'::jsonb),
        'interests', coalesce(p.interests, array[]::text[]),
        'hobbies', p.hobbies
      )
      from public.profiles p
      where p.id = (select auth.uid())
    ),
    jsonb_build_object(
      'skill_levels', '{}'::jsonb,
      'interests', array[]::text[],
      'hobbies', null
    )
  );
$$;

create or replace function public.save_my_profile_extras(
  p_skill_levels jsonb default '{}'::jsonb,
  p_interests text[] default array[]::text[],
  p_hobbies text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  next_skills jsonb;
  next_interests text[];
  next_hobbies text;
begin
  if current_user_id is null then
    raise exception 'You must be signed in to update your profile.';
  end if;

  next_skills := public.clean_skill_levels(p_skill_levels);
  next_interests := public.clean_interests(p_interests);
  next_hobbies := nullif(left(trim(coalesce(p_hobbies, '')), 500), '');

  update public.profiles
  set skills = next_skills,
      interests = next_interests,
      hobbies = next_hobbies
  where id = current_user_id;

  if not found then
    raise exception 'Your profile could not be found.';
  end if;

  return jsonb_build_object(
    'skill_levels', next_skills,
    'interests', next_interests,
    'hobbies', next_hobbies
  );
end;
$$;

revoke all on function public.get_my_profile_extras() from public, anon;
revoke all on function public.save_my_profile_extras(jsonb, text[], text) from public, anon;
grant execute on function public.get_my_profile_extras() to authenticated;
grant execute on function public.save_my_profile_extras(jsonb, text[], text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Keep what the signup form collected
-- ---------------------------------------------------------------------------
-- A new profile row is created by public.handle_new_user() from the signup
-- metadata. This trigger adds the three new fields to that row straight away, so
-- they survive the "confirm your email first" step.

create or replace function public.fill_signup_profile_extras()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  metadata jsonb;
  metadata_interests text[];
  metadata_hobbies text;
begin
  select u.raw_user_meta_data into metadata
  from auth.users u
  where u.id = new.id;

  if metadata is null
    or not (metadata ? 'skills' or metadata ? 'interests' or metadata ? 'hobbies') then
    return null;
  end if;

  if jsonb_typeof(metadata -> 'interests') = 'array' then
    select public.clean_interests(array_agg(item.value))
    into metadata_interests
    from jsonb_array_elements_text(metadata -> 'interests') as item(value);
  else
    metadata_interests := array[]::text[];
  end if;

  metadata_hobbies := case
    when jsonb_typeof(metadata -> 'hobbies') = 'string'
      then nullif(left(trim(metadata ->> 'hobbies'), 500), '')
  end;

  update public.profiles
  set skills = public.clean_skill_levels(metadata -> 'skills'),
      interests = metadata_interests,
      hobbies = metadata_hobbies
  where id = new.id;

  return null;
end;
$$;

revoke all on function public.fill_signup_profile_extras() from public, anon, authenticated;

drop trigger if exists profiles_fill_signup_extras on public.profiles;
create trigger profiles_fill_signup_extras
  after insert on public.profiles
  for each row execute function public.fill_signup_profile_extras();
