# HackMate

HackMate is a community site for students who want to find a hackathon, meet
teammates, and build something that matters. This repository is a **Vite +
React** single-page app backed by **Supabase** (Auth, Postgres, RLS, and RPCs).

The original plain HTML/CSS/JavaScript version is preserved in
[`legacy/`](legacy/) for reference. It is not used by the app or the build.

---

## Stack

| Layer      | Technology                                              |
| ---------- | ------------------------------------------------------- |
| UI         | React 19, React Router 7                                |
| Build      | Vite 8 (`@vitejs/plugin-react`)                         |
| Styling    | One global stylesheet (`src/styles.css`), light + dark  |
| Backend    | Supabase Postgres, Row Level Security, SQL RPC functions |
| Auth       | Supabase Auth (email + password, persistent sessions)    |
| Data calls | `@supabase/supabase-js` in the browser with the publishable key |

No UI framework, CSS framework, or state library is used. Theme and auth state
are small React contexts.

---

## Features

- **Home** — hero, live upcoming hackathons, featured builders, live
  leaderboard, and calls to action.
- **Hackathons** — live event listing with text search, category filters,
  deadline sorting (ascending/descending), loading/empty/error states, and a
  retry action.
- **Hackathon detail** — database-backed page at `/hackathons/:slug`, with
  organizer, dates, location, prize, registration deadline, and sample tracks
  for the bundled events.
- **Teams** — pick an upcoming hackathon, browse its teams and members (skills,
  reputation, leader badge), join a team, or create one. One team per user per
  hackathon, capacity enforced in SQL.
- **Leaderboard** — top 10 builders ranked by coin balance and reputation, with
  Bronze → Unreal tiers. Clearly labelled demo rows appear until real profiles
  exist.
- **Dashboard** (protected) — profile summary, coin balance, reputation, team
  memberships, team projects, tasks, and upcoming events.
- **Profile** (protected) — edit name, username, bio, and up to 20 skills; coin
  and reputation stats; atomic save through an RPC.
- **Auth** — log in, sign up with a full name, sign out, redirect back to the
  originally requested page, and post-signup email-confirmation messaging.
- **Theme** — light/dark toggle persisted in `localStorage`, synced across tabs,
  and applied before first paint (no flash).
- **404** page for unknown routes.
- **Graceful fallbacks** — if Supabase is not configured or the database has no
  rows yet, the marketing pages show bundled sample events, members, and teams.
  Protected pages explain that Supabase setup is required.

---

## Getting started

### Prerequisites

- Node.js **20.19+** (or 22.12+) and npm
- A Supabase project

### 1. Install

```bash
npm install
```

### 2. Configure the environment

```bash
cp .env.example .env
```

Fill in the two public values from **Supabase → Project Settings → API**:

| Variable                 | Where it is used | Notes                                                        |
| ------------------------ | ---------------- | ------------------------------------------------------------ |
| `VITE_SUPABASE_URL`      | Browser          | `https://<project-ref>.supabase.co`                          |
| `VITE_SUPABASE_ANON_KEY` | Browser          | Publishable/anon key. Safe to expose; RLS protects the data. |
| `SUPABASE_SERVICE_ROLE_KEY` | Local scripts only | Optional. Needed only by `npm run seed`. Put it in `.env.local`, **never** in `.env` or any `VITE_*` variable. |

`.env` is gitignored. Never put a service-role key in a `VITE_` variable: Vite
inlines those into the browser bundle.

### 3. Run

```bash
npm run dev       # http://localhost:5173
npm run build     # production bundle in dist/
npm run preview   # preview the production bundle
```

> If port 5173 is unavailable, Vite automatically picks the next free port.

### 4. Set up the database

Apply every file in `supabase/migrations/` **in filename order**. Either:

**Option A — Supabase CLI (recommended)**

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

**Option B — SQL Editor**

Open each migration in `supabase/migrations/` and run it in the Supabase SQL
Editor in filename order.

**Option C — already-provisioned live project**

The live project this app points at by default has the schema through
`20261019154800_add_hackathon_approval_status`. Only the new seed migration
(`20261020120000_seed_hackathons.sql`) needs to be applied there.

### 5. Seed hackathon data

The app reads hackathons from Supabase. Two equivalent ways to push the three
flagship events (`next-billion`, `climate-impact`, `open-innovation`):

```bash
# Uses the SQL migration (requires a linked CLI)
npx supabase db push

# …or push directly with the service-role key in .env.local
npm run seed
```

Both paths are idempotent — they upsert by `slug`, so re-running updates the
rows instead of duplicating them. Without seeded or organizer-created rows the
site still renders, but falls back to bundled sample events.

### 6. Auth settings

In **Supabase → Authentication**:

- Enable the **Email** provider with email/password.
- Set **Site URL** and **Redirect URLs** to your dev and production origins
  (for example `http://localhost:5173` and `https://your-domain.com`).
- Decide whether email confirmation is required. If it is on, signup shows a
  “check your email” message; if it is off, the user is signed in immediately.
- The `handle_new_user` trigger creates the matching `profiles` row on signup.

---

## Scripts

| Command              | What it does                                                        |
| -------------------- | ------------------------------------------------------------------- |
| `npm run dev`        | Start the Vite dev server with HMR.                                 |
| `npm run build`      | Build the production bundle into `dist/`.                           |
| `npm run preview`    | Serve the production bundle locally.                                |
| `npm run serve:dist` | Tiny SPA-aware static server for `dist/` (useful for smoke tests).  |
| `npm run seed`       | Upsert the bundled hackathons using `SUPABASE_SERVICE_ROLE_KEY`.    |

---

## Routes

| Path                  | Page            | Access    |
| --------------------- | --------------- | --------- |
| `/`                   | Home            | Public    |
| `/hackathons`         | Hackathon list  | Public    |
| `/hackathons/:slug`   | Hackathon detail| Public    |
| `/teams`              | Team browser    | Public (join/create requires sign-in) |
| `/leaderboard`        | Leaderboard     | Public    |
| `/login`              | Log in          | Public    |
| `/signup`             | Sign up         | Public    |
| `/dashboard`          | Dashboard       | Signed in |
| `/profile`            | Profile editor  | Signed in |
| `*`                   | 404             | Public    |

Protected routes redirect to `/login?redirect=<path>` and return there after a
successful sign-in. Only same-origin redirect targets are accepted.

---

## Project structure

```text
.
├── index.html                  # Vite HTML entry + pre-paint theme script
├── vite.config.js
├── .env.example
├── scripts/
│   ├── seed.mjs                # Service-role seed script (npm run seed)
│   └── serve-dist.mjs          # Static SPA server for dist/
├── src/
│   ├── main.jsx                # React root
│   ├── App.jsx                 # Routes + providers
│   ├── styles.css              # Global design system, responsive + dark mode
│   ├── components/             # Header, Footer, Layout, cards, icons, guards
│   ├── context/
│   │   ├── AuthContext.jsx     # Session, sign in/up/out, config errors
│   │   └── ThemeContext.jsx    # Persisted light/dark theme
│   ├── lib/
│   │   ├── supabase.js         # Client + configuration check
│   │   ├── demoData.js         # Sample events, people, teams, tiers
│   │   ├── format.js           # Dates, initials, numbers, redirect guard
│   │   └── leaderboard.js      # Leaderboard RPC → view model
│   └── pages/                  # Home, Hackathons, Detail, Teams, Leaderboard,
│                               # Dashboard, Profile, Login, Signup, NotFound
├── supabase/
│   ├── config.js               # Original site's public config (legacy)
│   └── migrations/             # Schema, RLS, RPCs, demo rows, hackathon seed
└── legacy/                     # Archived vanilla HTML/CSS/JS version
```

---

## Supabase schema and security

### Tables

`profiles`, `skills`, `user_skills`, `hackathons`, `teams`, `team_members`,
`projects`, `tasks`, `reviews`, `coin_transactions`, plus
`leaderboard_demo_entries` for clearly labelled sample rankings.

### RPCs used by the app

| Function | Access | Purpose |
| -------- | ------ | ------- |
| `get_public_leaderboard()` | anon + authenticated | Top 10 by coins/reputation; demo rows only when no real profiles exist. |
| `get_featured_builders()` | anon + authenticated | Recent profiles with skills and reputation. |
| `get_my_dashboard()` | authenticated | Profile, coins, reputation, teams, projects, and top 20 tasks. |
| `get_my_profile()` | authenticated | Profile + skills + stats for the editor. |
| `save_my_profile(...)` | authenticated | Validates and atomically saves profile and skill assignments. |
| `list_hackathon_teams(uuid)` | anon + authenticated | Teams and members for one open hackathon. |
| `create_hackathon_team(...)` | authenticated | Creates a team and makes the caller leader. Enforces one team per hackathon. |
| `join_hackathon_team(uuid)` | authenticated | Capacity, duplicate-membership, and status checks. |

### Security highlights

- RLS is enabled on every table the browser can reach; direct writes to team
  tables are revoked.
- Public read access to `hackathons` is limited to `upcoming` and `active` rows.
- Profiles are readable/updatable only by their owner; teams, projects, tasks,
  and reviews are exposed only through validated RPCs or owner policies.
- The browser never receives the service-role key.
- Hackathon rows carry `approval_status` (`pending` by default for new rows,
  `approved` for seeds) and `organizer_id` for future organizer workflows.

---

## Deployment

Deploy `dist/` to any static host. Because routing is client-side, rewrite all
unknown paths to `index.html`.

**Vercel** — build command `npm run build`, output directory `dist`; add a
rewrite of `/(.*)` → `/index.html`.

**Netlify** — build command `npm run build`, publish directory `dist`; add
`/* /index.html 200` to `_redirects`.

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the host’s environment
variables, then add the deployed origin to Supabase Auth’s redirect URLs.

---

## Troubleshooting

| Symptom | Fix |
| ------- | --- |
| “Supabase setup required” on dashboard/profile | `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` missing or still placeholders. Restart the dev server after editing `.env`. |
| “No live events yet; showing sample hackathons.” | Apply the migrations and run `npm run seed`, or create hackathon rows with `status = 'upcoming'`. |
| Login fails with “Invalid login credentials” | User does not exist, password is wrong, or email is unconfirmed. Check Supabase Auth users. |
| Signup succeeds but no profile appears | Ensure `20261016232000_create_profile_after_signup.sql` (trigger) was applied. |
| Empty teams list | Teams are per hackathon; pick another event, or create the first team while signed in. |
| `npm run seed` says the service-role key is missing | Add `SUPABASE_SERVICE_ROLE_KEY` to `.env.local` — the publishable key cannot bypass RLS. |
| Deep links 404 in production | Configure the SPA fallback/rewrite on the host. |

---

## Notes and limitations

- Hackathon creation/editing UI and organizer dashboards are not part of this
  frontend yet; events are seeded or created directly through Supabase.
- Reviews, coins, projects, and tasks are read on the dashboard but have no
  editing UI in this version.
- Demo leaderboard rows are intentionally visible (badged `DEMO`) until the
  first real profile is registered.
- `legacy/` contains the previous static implementation and can be deleted once
  it is no longer needed.
