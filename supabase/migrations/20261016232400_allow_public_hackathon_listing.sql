alter table public.hackathons enable row level security;

grant select on public.hackathons to anon, authenticated;

create policy "Anyone can view upcoming and active hackathons"
  on public.hackathons for select
  to anon, authenticated
  using (status in ('upcoming', 'active'));
