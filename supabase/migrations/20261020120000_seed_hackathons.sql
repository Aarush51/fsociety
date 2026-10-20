-- Seed the three flagship hackathons shown on the marketing site.
-- Idempotent: re-running updates the rows in place instead of duplicating them.

insert into public.hackathons (
  slug,
  title,
  organizer,
  description,
  category,
  location,
  prize,
  registration_deadline,
  starts_at,
  ends_at,
  status,
  approval_status
)
values
  (
    'next-billion',
    'Build for the next billion',
    'Hack the Future',
    'Build thoughtful, accessible technology for the people who are too often left out of the conversation. Bring an idea, find your collaborators, and make something useful.',
    'AI & Machine Learning',
    'Online',
    '$12,000',
    '2026-10-22T23:59:00Z',
    '2026-10-24T09:00:00Z',
    '2026-10-26T18:00:00Z',
    'upcoming',
    'approved'
  ),
  (
    'climate-impact',
    'Small ideas, big impact',
    'Greenhouse Labs',
    'Turn local climate challenges into practical, community-powered solutions. From cleaner campuses to greener neighborhoods, the next small idea could make a big difference.',
    'Climate Tech',
    'Austin, TX',
    '$8,500',
    '2026-10-30T23:59:00Z',
    '2026-11-01T09:00:00Z',
    '2026-11-03T18:00:00Z',
    'upcoming',
    'approved'
  ),
  (
    'open-innovation',
    'Make the unthinkable',
    'Create / Connect',
    'A weekend for curious minds to experiment without a rulebook. Find a challenge you care about, build with a team, and share a prototype with the community.',
    'Open Innovation',
    'Online',
    '$5,000',
    '2026-11-06T23:59:00Z',
    '2026-11-08T09:00:00Z',
    '2026-11-10T18:00:00Z',
    'upcoming',
    'approved'
  )
on conflict (slug) do update
set title = excluded.title,
    organizer = excluded.organizer,
    description = excluded.description,
    category = excluded.category,
    location = excluded.location,
    prize = excluded.prize,
    registration_deadline = excluded.registration_deadline,
    starts_at = excluded.starts_at,
    ends_at = excluded.ends_at,
    status = excluded.status,
    approval_status = excluded.approval_status;
