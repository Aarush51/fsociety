create unique index skills_name_lower_uidx
  on public.skills (lower(name));

alter table public.skills enable row level security;
alter table public.user_skills enable row level security;
alter table public.coin_transactions enable row level security;

grant select on public.skills to authenticated;
grant select, insert, update, delete on public.user_skills to authenticated;
grant select on public.coin_transactions to authenticated;

create policy "Authenticated users can read skills"
  on public.skills for select
  to authenticated
  using (true);

create policy "Users can read their own skills"
  on public.user_skills for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can add their own skills"
  on public.user_skills for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own skills"
  on public.user_skills for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can remove their own skills"
  on public.user_skills for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can read their own coin transactions"
  on public.coin_transactions for select
  to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.get_my_profile()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'full_name', p.full_name,
    'username', p.username,
    'bio', p.bio,
    'skills', coalesce((
      select jsonb_agg(s.name order by s.name)
      from public.user_skills us
      join public.skills s on s.id = us.skill_id
      where us.user_id = (select auth.uid())
    ), '[]'::jsonb),
    'coin_balance', coalesce((
      select sum(ct.amount)
      from public.coin_transactions ct
      where ct.user_id = (select auth.uid())
    ), 0),
    'reputation', coalesce((
      select round(avg(r.rating)::numeric, 1)
      from public.reviews r
      where r.reviewee_id = (select auth.uid())
    ), 0),
    'review_count', (
      select count(*)
      from public.reviews r
      where r.reviewee_id = (select auth.uid())
    )
  )
  from public.profiles p
  where p.id = (select auth.uid());
$$;

create or replace function public.save_my_profile(
  p_full_name text,
  p_username text,
  p_bio text,
  p_skills text[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  normalized_skills text[];
begin
  if current_user_id is null then
    raise exception 'You must be signed in to update your profile.';
  end if;
  if p_full_name is null or char_length(trim(p_full_name)) not between 1 and 100 then
    raise exception 'Name must be between 1 and 100 characters.';
  end if;
  if p_username is null or p_username !~ '^[A-Za-z0-9_]{3,30}$' then
    raise exception 'Username must be 3–30 characters using letters, numbers, or underscores.';
  end if;
  if p_bio is not null and char_length(p_bio) > 500 then
    raise exception 'Bio must be 500 characters or fewer.';
  end if;
  if coalesce(cardinality(p_skills), 0) > 20 then
    raise exception 'You can add up to 20 skills.';
  end if;

  select coalesce(array_agg(skill_name order by skill_name), array[]::text[])
  into normalized_skills
  from (
    select min(trim(value)) as skill_name
    from unnest(coalesce(p_skills, array[]::text[])) as submitted(value)
    where trim(value) <> ''
    group by lower(trim(value))
  ) submitted_skills;

  if exists (
    select 1
    from unnest(normalized_skills) as submitted(skill_name)
    where char_length(skill_name) > 80
  ) then
    raise exception 'Skills must be 80 characters or fewer.';
  end if;
  if cardinality(normalized_skills) > 20 then
    raise exception 'You can add up to 20 skills.';
  end if;

  update public.profiles
  set full_name = trim(p_full_name),
      username = trim(p_username),
      bio = nullif(trim(p_bio), '')
  where id = current_user_id;

  if not found then
    raise exception 'Your profile could not be found.';
  end if;

  insert into public.skills (name)
  select skill_name
  from unnest(normalized_skills) as submitted(skill_name)
  on conflict do nothing;

  delete from public.user_skills us
  where us.user_id = current_user_id
    and not exists (
      select 1 from public.skills s
      join unnest(normalized_skills) as submitted(skill_name)
        on lower(s.name) = lower(submitted.skill_name)
      where s.id = us.skill_id
    );

  insert into public.user_skills (user_id, skill_id)
  select current_user_id, s.id
  from public.skills s
  where exists (
    select 1 from unnest(normalized_skills) as submitted(skill_name)
    where lower(s.name) = lower(submitted.skill_name)
  )
  on conflict (user_id, skill_id) do nothing;
end;
$$;

revoke all on function public.get_my_profile() from public, anon;
revoke all on function public.save_my_profile(text, text, text, text[]) from public, anon;
grant execute on function public.get_my_profile() to authenticated;
grant execute on function public.save_my_profile(text, text, text, text[]) to authenticated;
