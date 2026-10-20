create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile_name text;
  base_username text;
begin
  profile_name := nullif(trim(new.raw_user_meta_data ->> 'full_name'), '');
  if profile_name is null then
    profile_name := split_part(coalesce(new.email, 'user'), '@', 1);
  end if;

  base_username := lower(regexp_replace(
    coalesce(
      nullif(new.raw_user_meta_data ->> 'username', ''),
      split_part(coalesce(new.email, 'user'), '@', 1)
    ),
    '[^A-Za-z0-9_]+',
    '_',
    'g'
  ));
  base_username := left(trim(both '_' from base_username), 21);
  if char_length(base_username) < 3 then
    base_username := 'user';
  end if;

  insert into public.profiles (id, username, full_name)
  values (
    new.id,
    base_username || '_' || left(replace(new.id::text, '-', ''), 8),
    left(profile_name, 100)
  );

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;

create policy "Users can read their own profile"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);
