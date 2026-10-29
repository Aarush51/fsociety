-- Teammate reviews are stored separately from public.reviews (which is used for
-- project reviews). Existing public.reviews policies and functions are untouched.
-- The current registrations schema has no check-in field. If checked_in_at or
-- checked_in is later added to registrations or team_members, both reviewers
-- must have a non-null / true check-in value.

begin;

create table if not exists public.team_reviews (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  hackathon_id uuid not null references public.hackathons (id) on delete cascade,
  from_user uuid not null references public.profiles (id) on delete cascade,
  to_user uuid not null references public.profiles (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  tags text[] not null default '{}',
  endorsed text[] not null default '{}',
  comment text check (comment is null or char_length(comment) <= 2000),
  created_at timestamptz not null default now(),
  constraint team_reviews_not_self_check check (from_user <> to_user),
  constraint team_reviews_one_per_pair unique (team_id, from_user, to_user)
);

create index if not exists team_reviews_to_user_idx
  on public.team_reviews (to_user, created_at desc);
create index if not exists team_reviews_team_idx
  on public.team_reviews (team_id, created_at desc);

alter table public.team_reviews enable row level security;
revoke all on public.team_reviews from public, anon, authenticated;
grant select on public.team_reviews to authenticated;

drop policy if exists "Users read their own team reviews" on public.team_reviews;
create policy "Users read their own team reviews"
  on public.team_reviews for select
  to authenticated
  using (from_user = (select auth.uid()) or to_user = (select auth.uid()));


-- All writes go through this security-definer function. The caller is derived
-- from auth.uid(); clients cannot insert directly or choose from_user.
create or replace function public.submit_team_review(
  p_team_id uuid,
  p_hackathon_id uuid,
  p_to_user uuid,
  p_rating integer,
  p_tags text[] default '{}',
  p_endorsed text[] default '{}',
  p_comment text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  event_end timestamptz;
  inserted_id uuid;
  sender_checked boolean;
  recipient_checked boolean;
  tag_values text[] := coalesce(p_tags, array[]::text[]);
  endorsed_values text[] := coalesce(p_endorsed, array[]::text[]);
  member_user_ids uuid[];
begin
  if caller is null then
    raise exception 'Log in to review a teammate.';
  end if;
  if p_to_user is null or caller = p_to_user then
    raise exception 'You cannot review yourself.';
  end if;
  if p_rating is null or p_rating not between 1 and 5 then
    raise exception 'Rating must be between 1 and 5 stars.';
  end if;
  if p_comment is not null and char_length(p_comment) > 2000 then
    raise exception 'Keep comments under 2000 characters.';
  end if;
  if coalesce(cardinality(tag_values), 0) > 6 or exists (
    select 1
    from unnest(tag_values) as tag(value)
    where value is null
      or trim(value) not in (
        'Collaborative', 'Reliable', 'Creative', 'Helpful',
        'Communicative', 'Problem-solving'
      )
  ) then
    raise exception 'Choose only the supported teammate review tags.';
  end if;
  if coalesce(cardinality(endorsed_values), 0) > 30 or exists (
    select 1
    from unnest(endorsed_values) as skill(value)
    where value is null or char_length(trim(value)) not between 1 and 80
  ) then
    raise exception 'Use at most 30 skill endorsements, each 1 to 80 characters.';
  end if;
  if coalesce(cardinality(tag_values), 0) <> (
    select count(distinct trim(tag.value)) from unnest(tag_values) as tag(value)
  ) or coalesce(cardinality(endorsed_values), 0) <> (
    select count(distinct lower(trim(skill.value))) from unnest(endorsed_values) as skill(value)
  ) then
    raise exception 'Duplicate review tags or skill endorsements are not allowed.';
  end if;
  if p_team_id is null or p_hackathon_id is null then
    raise exception 'A team and hackathon are required.';
  end if;

  select h.ends_at into event_end
  from public.hackathons h
  where h.id = p_hackathon_id
  for share;
  if not found or event_end is null then
    raise exception 'That hackathon does not exist.';
  end if;
  if event_end > now() then
    raise exception 'Reviews open after the hackathon has ended.';
  end if;

  -- Lock the team while validating membership to avoid a concurrent team change
  -- between the authorization check and insert.
  perform 1
  from public.teams t
  where t.id = p_team_id and t.hackathon_id = p_hackathon_id
  for update;
  if not found then
    raise exception 'That team does not belong to this hackathon.';
  end if;

  select array_agg(tm.user_id) into member_user_ids
  from public.team_members tm
  where tm.team_id = p_team_id;
  if not (caller = any(coalesce(member_user_ids, array[]::uuid[])))
    or not (p_to_user = any(coalesce(member_user_ids, array[]::uuid[]))) then
    raise exception 'Both people must be members of the same team.';
  end if;

  -- Endorsements must be skills already on the recipient's profile.
  if exists (
    select 1
    from unnest(endorsed_values) as submitted(skill_name)
    where not exists (
      select 1
      from public.user_skills us
      join public.skills skill on skill.id = us.skill_id
      where us.user_id = p_to_user
        and lower(skill.name) = lower(trim(submitted.skill_name))
    )
  ) then
    raise exception 'You can endorse only skills listed on your teammate’s profile.';
  end if;

  -- Optional check-in enforcement, guarded so this works on the current schema
  -- (which has no check-in column) without attempting to reference absent fields.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'registrations'
      and column_name = 'checked_in_at'
  ) then
    execute
      'select exists (select 1 from public.registrations where hackathon_id = $1 and user_id = $2 and checked_in_at is not null), '
      || 'exists (select 1 from public.registrations where hackathon_id = $1 and user_id = $3 and checked_in_at is not null)'
      into sender_checked, recipient_checked
      using p_hackathon_id, caller, p_to_user;
  elsif exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'registrations'
      and column_name = 'checked_in'
  ) then
    execute
      'select exists (select 1 from public.registrations where hackathon_id = $1 and user_id = $2 and checked_in), '
      || 'exists (select 1 from public.registrations where hackathon_id = $1 and user_id = $3 and checked_in)'
      into sender_checked, recipient_checked
      using p_hackathon_id, caller, p_to_user;
  elsif exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'team_members'
      and column_name = 'checked_in_at'
  ) then
    execute
      'select exists (select 1 from public.team_members where team_id = $1 and user_id = $2 and checked_in_at is not null), '
      || 'exists (select 1 from public.team_members where team_id = $1 and user_id = $3 and checked_in_at is not null)'
      into sender_checked, recipient_checked
      using p_team_id, caller, p_to_user;
  elsif exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'team_members'
      and column_name = 'checked_in'
  ) then
    execute
      'select exists (select 1 from public.team_members where team_id = $1 and user_id = $2 and checked_in), '
      || 'exists (select 1 from public.team_members where team_id = $1 and user_id = $3 and checked_in)'
      into sender_checked, recipient_checked
      using p_team_id, caller, p_to_user;
  else
    sender_checked := true;
    recipient_checked := true;
  end if;
  if not coalesce(sender_checked, false) or not coalesce(recipient_checked, false) then
    raise exception 'Both teammates must have checked in before they can review each other.';
  end if;

  insert into public.team_reviews (
    team_id, hackathon_id, from_user, to_user, rating, tags, endorsed, comment
  )
  values (
    p_team_id,
    p_hackathon_id,
    caller,
    p_to_user,
    p_rating::smallint,
    (select coalesce(array_agg(trim(value)), array[]::text[]) from unnest(tag_values) as tag(value)),
    (select coalesce(array_agg(trim(value)), array[]::text[]) from unnest(endorsed_values) as skill(value)),
    nullif(trim(p_comment), '')
  )
  on conflict (team_id, from_user, to_user) do nothing
  returning id into inserted_id;

  if inserted_id is null then
    raise exception 'You have already reviewed this teammate for this team.';
  end if;
  return inserted_id;
end;
$$;

revoke all on function public.submit_team_review(uuid, uuid, uuid, integer, text[], text[], text)
  from public, anon;
grant execute on function public.submit_team_review(uuid, uuid, uuid, integer, text[], text[], text)
  to authenticated;

-- This RPC returns only the caller's team and review pairs involving the caller.
-- It is used by /teams because completed events are no longer in the public
-- hackathon listing. Review content is visible only to its author/recipient.
create or replace function public.get_my_team_reviews(p_hackathon_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  caller_team_id uuid;
begin
  if caller is null then
    raise exception 'Log in to read teammate reviews.';
  end if;
  if p_hackathon_id is null then
    raise exception 'A hackathon is required.';
  end if;

  select t.id into caller_team_id
  from public.teams t
  join public.team_members tm on tm.team_id = t.id
  where t.hackathon_id = p_hackathon_id and tm.user_id = caller
  limit 1;
  if caller_team_id is null then
    raise exception 'Only participants with a team can read teammate reviews.';
  end if;

  return jsonb_build_object(
    'hackathon', (
      select jsonb_build_object('id', h.id, 'ends_at', h.ends_at, 'team_id', caller_team_id)
      from public.hackathons h where h.id = p_hackathon_id
    ),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'full_name', p.full_name,
        'username', p.username,
        'role', tm.role,
        'team_id', tm.team_id,
        'hackathon_id', p_hackathon_id,
        'skills', coalesce((
          select jsonb_agg(skill.name order by skill.name)
          from public.user_skills us
          join public.skills skill on skill.id = us.skill_id
          where us.user_id = p.id
        ), '[]'::jsonb)
      ) order by case when tm.role = 'leader' then 0 else 1 end, p.full_name)
      from public.team_members tm
      join public.profiles p on p.id = tm.user_id
      where tm.team_id = caller_team_id
    ), '[]'::jsonb),
    'reviews', coalesce((
      select jsonb_agg(jsonb_build_object(
        'from_user', tr.from_user,
        'to_user', tr.to_user,
        'rating', tr.rating,
        'tags', tr.tags,
        'endorsed', tr.endorsed,
        'comment', tr.comment,
        'created_at', tr.created_at
      ) order by tr.created_at desc)
      from public.team_reviews tr
      where tr.team_id = caller_team_id
        and tr.hackathon_id = p_hackathon_id
        and (
          (tr.from_user = caller and tr.to_user in (
            select tm.user_id from public.team_members tm where tm.team_id = caller_team_id
          ))
          or
          (tr.to_user = caller and tr.from_user in (
            select tm.user_id from public.team_members tm where tm.team_id = caller_team_id
          ))
        )
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_my_team_reviews(uuid) from public, anon;
grant execute on function public.get_my_team_reviews(uuid) to authenticated;

create or replace function public.get_my_team_reviews_by_slug(p_hackathon_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_hackathon_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Log in to read teammate reviews.';
  end if;
  select h.id into target_hackathon_id
  from public.hackathons h
  where h.slug = p_hackathon_slug
    and exists (
      select 1 from public.teams t
      join public.team_members tm on tm.team_id = t.id
      where t.hackathon_id = h.id and tm.user_id = (select auth.uid())
    );
  if target_hackathon_id is null then
    raise exception 'That hackathon does not exist or you are not a team member.';
  end if;
  return public.get_my_team_reviews(target_hackathon_id);
end;
$$;

revoke all on function public.get_my_team_reviews_by_slug(text) from public, anon;
grant execute on function public.get_my_team_reviews_by_slug(text) to authenticated;

-- Aggregate-only API: it never returns comments, ids, individual reviews,
-- team identifiers, or reviewer identity. It permits users to inspect only
-- their own summary.
create or replace function public.get_review_summary(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
begin
  if caller is null then
    raise exception 'Log in to read a teammate review summary.';
  end if;
  if p_user_id is null or caller <> p_user_id then
    raise exception 'You can only read your own teammate review summary.';
  end if;

  return jsonb_build_object(
    'average_rating', coalesce((
      select round(avg(tr.rating)::numeric, 2)
      from public.team_reviews tr where tr.to_user = p_user_id
    ), 0),
    'review_count', (
      select count(*) from public.team_reviews tr where tr.to_user = p_user_id
    ),
    'tag_counts', coalesce((
      select jsonb_agg(jsonb_build_object('tag', counts.tag, 'count', counts.amount)
        order by counts.amount desc, counts.tag)
      from (
        select tag, count(*)::integer as amount
        from public.team_reviews tr
        cross join lateral unnest(tr.tags) as tags(tag)
        where tr.to_user = p_user_id
        group by tag
      ) counts
    ), '[]'::jsonb),
    'endorsed_skill_counts', coalesce((
      select jsonb_agg(jsonb_build_object('skill', counts.skill, 'count', counts.amount)
        order by counts.amount desc, counts.skill)
      from (
        select skill, count(*)::integer as amount
        from public.team_reviews tr
        cross join lateral unnest(tr.endorsed) as endorsements(skill)
        where tr.to_user = p_user_id
        group by skill
      ) counts
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_review_summary(uuid) from public, anon;
grant execute on function public.get_review_summary(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
