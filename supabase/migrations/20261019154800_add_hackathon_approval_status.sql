alter table public.hackathons
  add column approval_status text not null default 'approved'
  check (approval_status in ('pending', 'approved', 'rejected'));

alter table public.hackathons
  alter column approval_status set default 'pending';
