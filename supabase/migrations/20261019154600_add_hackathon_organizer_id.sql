alter table public.hackathons
  add column organizer_id uuid references public.profiles (id) on delete set null;
