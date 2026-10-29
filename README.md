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
| Server     | Supabase Edge Function for ideas; tiny Node HTTP server for `/api/roadmap` |
| AI         | Gemini via the `generate-ideas` Edge Function; OpenAI-compatible for roadmaps |
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
- **Idea generator** — pick an approved hackathon, review its problem/theme,
  then describe your skills, your teammates' skills, interests, and available
  development time. Skills already saved on your profile load automatically and
  edits stay temporary unless you press “Save skills to profile”. The Supabase
  Edge Function `generate-ideas` then drafts three ideas through Gemini; the
  Gemini key is an Edge Function secret and never reaches the browser. Each idea card shows the problem, solution, key features,
  target users, tech stack, required team roles, difficulty, estimated time,
  risks, and why it fits, with **View Details** (a keyboard-accessible dialog)
  and **Use This Idea**. The latter opens a review-first project creation dialog
  prefilled with the idea's title, description, key features, tech stack, and
  target users; the user picks one of the teams they lead and nothing is written
  until they press **Create project**. The complete idea (problem, solution,
  features, stack, roles, difficulty, time, risks, why it fits, and the brief)
  is saved with the project in `projects.idea_data`, so the Dashboard can reopen
  it. Duplicate titles for the same team are blocked, and team members who are
  not leaders see a leader-only message.
- **Saved ideas on the Dashboard** — each row under “Ideas in progress” opens the
  same detail view the generator uses (clicking it, or `/dashboard?idea=<id>`),
  with the brief, risks and the rest. **Back to dashboard** closes it. Ideas
  saved before `idea_data` existed show their title and description plus the
  note “This idea was saved before full details were stored.”
  **Generate Roadmap** turns the selected idea into seven phases (planning to
  final submission) with objectives, tasks, time estimates, suggested roles, and
  priorities that fit the chosen development time. Roadmaps live in page state
  and are never saved automatically. Once a roadmap exists, **Generate Tasks**
  converts its actions into reviewable drafts (title, description, phase,
  suggested role, estimate, priority). The user picks an existing project or
  creates one, reviews every draft, and only **Confirm & Save Tasks** writes to
  the existing `tasks` table; titles already on the project are skipped.
- **Leaderboard** — top 10 builders ranked by coin balance and reputation, with
  Bronze → Unreal tiers. Clearly labelled demo rows appear until real profiles
  exist.
- **Dashboard** (protected) — profile summary, coin balance, reputation, team
  memberships, team projects, tasks, and upcoming events.
- **Profile** (protected) — edit name, username, bio, and up to 20 skills; coin
  and reputation stats; the reviews you received and your coin ledger (newest
  first, ten at a time); atomic save through an RPC.
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
- The Supabase CLI via `npx supabase` (for deploying the Edge Function)

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
| `AI_API_KEY`            | Node server only | Required for `/api/roadmap`. Read by the Node server. **Never** prefix it with `VITE_`. |
| `GEMINI_API_KEY`        | Supabase Edge Function secret | Required for ideas. Set with `npx supabase secrets set`; never put it in `.env` or any `VITE_*` variable. |
| `AI_API_BASE_URL`       | Server only      | OpenAI-compatible base URL; defaults to `https://api.openai.com/v1`. |
| `AI_MODEL`              | Server only      | Model name; defaults to `gpt-4o-mini`. |

`.env` is gitignored. Never put a service-role key or the Gemini key in a
`VITE_` variable: Vite inlines those into the browser bundle. `GEMINI_API_KEY`
is read only inside the Edge Function, from its own secret environment.
Optional function secrets: `GEMINI_MODEL` (default `gemini-3.8-flash`),
`GEMINI_API_BASE_URL`, and `GEMINI_TIMEOUT_MS` (default `20000`).

### 3. Run

```bash
npm run dev:api   # Node API for /api/roadmap on http://127.0.0.1:8787
npm run dev       # http://localhost:5173 (Vite proxies /api to the API server)
npm run build     # production bundle in dist/
npm run serve:dist  # production server: dist/ + /api/roadmap on http://localhost:3000
```

Run `dev:api` and `dev` in two terminals. The Vite dev/preview proxy points at
`API_PORT` (default `8787`). `dev:api` is needed for **Generate Roadmap** only;
idea generation calls the deployed Supabase Edge Function directly.

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

### 6. Deploy the generate-ideas Edge Function

The idea generator runs on Supabase, not in Vite or the Node server. Store the
Gemini key as a function secret and deploy:

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase secrets set GEMINI_API_KEY=<your-gemini-api-key>
npx supabase functions deploy generate-ideas --no-verify-jwt
```

- The function reads `GEMINI_API_KEY` from its environment at request time. It
  is never sent to the browser, logged, or returned in a response.
- `--no-verify-jwt` keeps `/ideas` usable by signed-out visitors. The function
  still validates every request, owns the prompt, and applies CORS; there is no
  per-user quota.
- To test locally, copy `supabase/functions/.env.example` to
  `supabase/functions/.env.local`, fill in the key, then run
  `npx supabase functions serve generate-ideas --env-file supabase/functions/.env.local`.
  Local function serving needs Docker.
- Never put `GEMINI_API_KEY` in the repo-root `.env`, `.env.local`, or a `VITE_*`
  variable. If a key was ever committed or shared, rotate it in Google AI Studio.

### 7. Auth settings

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
| `npm run dev:api`    | Start the Node API server for `/api/roadmap` (default port 8787).    |
| `npm run build`      | Build the production bundle into `dist/`.                           |
| `npm run preview`    | Preview the bundle through Vite (proxies `/api` like dev).          |
| `npm run serve:dist` | Production server: serves `dist/` and `/api/roadmap` (default port 3000). |
| `npm run seed`       | Upsert the bundled hackathons using `SUPABASE_SERVICE_ROLE_KEY`.    |

---

## Routes

| Path                  | Page            | Access    |
| --------------------- | --------------- | --------- |
| `/`                   | Home            | Public    |
| `/hackathons`         | Hackathon list  | Public    |
| `/hackathons/:slug`   | Hackathon detail| Public    |
| `/ideas`              | AI idea generator | Public  |
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
├── server/
│   ├── env.mjs                 # Server-only .env/.env.local loading
│   └── roadmap.mjs             # /api/roadmap handler + AI provider call
├── scripts/
│   ├── api-server.mjs          # Dev API server for /api/roadmap (npm run dev:api)
│   ├── seed.mjs                # Service-role seed script (npm run seed)
│   └── serve-dist.mjs          # Production server: dist/ + /api/roadmap
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
│   │   ├── ideas.js            # Browser → Supabase generate-ideas (no provider secrets)
│   │   └── leaderboard.js      # Leaderboard RPC → view model
│   └── pages/                  # Home, Hackathons, Detail, IdeaGenerator, Teams,
│                               # Leaderboard, Dashboard, Profile, Login,
│                               # Signup, NotFound
├── supabase/
│   ├── config.js               # Original site's public config (legacy)
│   ├── functions/
│   │   ├── .env.example        # Local function environment template (no real key)
│   │   └── generate-ideas/     # Ideas Edge Function (Gemini secret lives here)
│   │       ├── index.ts        # Deno entrypoint
│   │       ├── handler.ts      # HTTP validation, CORS, Gemini call
│   │       └── logic.ts        # Prompt, schema, brief/response parsing
│   └── migrations/             # Schema, RLS, RPCs, demo rows, hackathon seed
└── legacy/                     # Archived vanilla HTML/CSS/JS version
```

---

## Supabase schema and security

### Tables

`profiles`, `skills`, `user_skills`, `hackathons`, `teams`, `team_members`,
`projects`, `tasks`, `reviews`, `coin_transactions`, plus
`leaderboard_demo_entries` for clearly labelled sample rankings.

### RPCs

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
| `get_project_tasks(uuid)` | authenticated | Project header plus ordered tasks, assignees, and open/done counts for a team member; `null` for anyone else. |
| `get_my_received_reviews()` | authenticated | Reviews the caller received, with reviewer, project, and team context. |
| `get_my_coin_transactions(int)` | authenticated | Balance, total count, and the newest page of the caller's ledger (default 50, capped at 200). |

The profile reads `get_my_received_reviews` and `get_my_coin_transactions`;
`get_project_tasks` is ready for a project board but has no page yet.

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

## AI endpoints

There are two AI paths, and neither one runs in the browser:

- **`generate-ideas` (Supabase Edge Function → Gemini)** — the idea generator.
- **`POST /api/roadmap` (Node server → OpenAI-compatible provider)** — the roadmap for a selected idea.

The idea brief and its response are shown below; the roadmap endpoint has its
own shape further down.

```jsonc
// request
{
  "hackathon": { "title": "...", "category": "...", "organizer": "..." },
  "problem": "hackathon problem / theme statement",
  "skills": ["React", "Figma"],
  "interests": "accessible learning, climate data",
  "teamSkills": ["Python", "Design"],
  "time": "A weekend"
}

// 200 response — always exactly three complete ideas
{
  "ideas": [
    {
      "title": "...",
      "problem": "the specific user problem inside this hackathon's theme",
      "solution": "what the team builds and how it works",
      "key_features": ["..."],
      "target_users": "...",
      "tech_stack": ["..."],
      "required_team_roles": ["..."],
      "difficulty": "Beginner | Intermediate | Advanced",
      "estimated_time": "...",
      "risks": ["risk and its mitigation"],
      "why_it_fits": "..."
    }
  ]
}
```

The Edge Function validates the brief, builds the prompt, and fixes the Gemini
model and schema itself; client-supplied `model`, `messages`, or provider
parameters are ignored. It tells the model to solve the selected hackathon's
problem statement, use the team's real skills, and fit the available time —
narrowing scope instead of overrunning it. Ideas that come back incomplete,
duplicated, or as fewer than three are treated as an unusable model response
(`502`), so the page can always render three cards.

### Roadmap endpoint

Once an idea is selected, “Generate Roadmap” sends the idea, hackathon deadline,
team skills, and the chosen development-time label to `POST /api/roadmap`.

```jsonc
// request
{
  "idea": { "title": "...", "problem": "...", "solution": "...", "key_features": ["..."], "target_users": "...", "tech_stack": ["..."], "required_team_roles": ["..."], "difficulty": "...", "estimated_time": "..." },
  "hackathon": { "title": "...", "deadline": "24 Oct 2026" },
  "skills": ["React", "Figma"],
  "teamSkills": ["Python", "Design"],
  "time": "A weekend"
}

// 200 response — seven ordered phases that fit the budget
{
  "phases": [
    {
      "name": "Planning",
      "objective": "...",
      "tasks": ["..."],
      "estimated_minutes": 60,
      "estimated_time": "1h",
      "team_role": "Frontend developer",
      "priority": "High"
    }
  ],
  "total_minutes": 1710,
  "budget_minutes": 1800
}
```

The server maps the time label to a working-hour budget (few hours 4h, one day
8h, a weekend 30h, about a week 35h, more than a week 60h), validates all seven
phases in order, and rejects a plan whose `estimated_minutes` exceed the budget
(`502`) instead of showing an unrealistic roadmap. The deadline is context for
sequencing, not extra working hours. The roadmap is generated in component
state only; nothing is saved.

**Generate Tasks** converts the roadmap on the client into one draft per phase
action. A title repeated in a later phase stays as that phase's work and is
qualified with the phase name, so task titles remain unique. It uses the
existing `tasks` table:
`title` and `description` are real columns, priority is mapped to the existing
`smallint` column (`High` → 1, `Medium` → 3, `Low` → 5), and the phase, assigned
role, and estimate are composed into the description because the table has no
columns for them. Drafts stay in page state until the user presses **Confirm &
Save Tasks**; the save re-reads the chosen project's tasks and inserts only
titles that are not already there. No schema change is needed.

The Edge Function returns JSON `{ "error": "..." }` with `400` (validation),
`405`/`413`/`415` (bad request shape), `429` (Gemini quota reached), `502`
(provider failure or unusable model output), `503` (missing/invalid key or
configuration) or `504` (Gemini timeout). The roadmap endpoint uses the same
shape, with `429` for its 8-requests-per-minute-per-IP limit.

The Edge Function calls
`POST {GEMINI_API_BASE_URL}/models/{GEMINI_MODEL}:generateContent` with the key
in the `x-goog-api-key` header. The roadmap endpoint works with any
**OpenAI-compatible** provider: it calls `POST {AI_API_BASE_URL}/chat/completions`.
Configure the roadmap with server-only env vars (see the table above);
`AI_TIMEOUT_MS` is optional (default 30000).

Security rules enforced by the implementation:

- `GEMINI_API_KEY` is read only inside `supabase/functions/generate-ideas/`
  via the Edge Function environment (`Deno.env`), where it is stored as a
  Supabase secret. It is sent only in the `x-goog-api-key` header, never in a
  URL, never logged, never returned, and never bundled into the frontend.
- `AI_API_KEY` is read only by `server/roadmap.mjs` via `process.env`, from
  `.env.local`/`.env` loaded by the Node process. It is never sent to the
  browser, never prefixed with `VITE_`, never included in the bundle, never
  logged, and never returned in a response.
- Both paths rebuild the prompt from validated fields (length-capped) and fix
  the provider model/temperature themselves; client-supplied `model`,
  `messages`, or other provider parameters are ignored.
- Provider failures are mapped to generic messages; upstream error bodies are not
  forwarded.
- The Edge Function needs no database credentials, so it uses no service-role
  key and no tables. The roadmap server likewise needs no Supabase credentials.

---

## Deployment

The SPA can be hosted statically. Ideas work with only the deployed Supabase
Edge Function; “Generate Roadmap” additionally needs a Node process.

- Deploy the SPA to any static host (build `dist/`, rewrite unknown paths to `index.html`).
- Deploy `generate-ideas` to Supabase and set `GEMINI_API_KEY` as a Supabase
  secret (see step 6). The frontend only needs `VITE_SUPABASE_URL` and
  `VITE_SUPABASE_ANON_KEY`.
- If you use roadmaps, run `npm run serve:dist` (or deploy `server/`,
  `scripts/serve-dist.mjs`, and `dist/` together) with `AI_API_KEY`,
  `AI_API_BASE_URL`, and `AI_MODEL` as **server** environment variables.

**Vercel** — build command `npm run build`, output directory `dist`; add a
rewrite of `/(.*)` → `/index.html`. The idea generator needs no Vercel function;
add one or a small server only for `/api/roadmap`.

**Netlify** — build command `npm run build`, publish directory `dist`; add
`/* /index.html 200` to `_redirects`. Add a Netlify function/server only if you
use `/api/roadmap`.

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
| “The idea generator isn't configured on the server yet.” | Set the `GEMINI_API_KEY` Supabase secret and redeploy: `npx supabase secrets set GEMINI_API_KEY=...` then `npx supabase functions deploy generate-ideas --no-verify-jwt`. Never use a `VITE_GEMINI_API_KEY`. |
| “The idea service is unavailable right now.” | Gemini failed or the function is unreachable. Check the function logs (`npx supabase functions logs generate-ideas`), the `GEMINI_MODEL` / `GEMINI_API_BASE_URL` secrets, and Google AI status. Only the HTTP status is logged. |
| “Could not reach the idea service.” | The function is not deployed or is named differently, the network is down, or `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` point at another project. Run `npx supabase functions list` and redeploy `generate-ideas`. |
| “Too many idea requests.” | Gemini returned `429`, or the roadmap endpoint hit its 8/minute limit; wait a minute before retrying. |
| Deep links 404 in production | Configure the SPA fallback/rewrite on the host. |

---

## Notes and limitations

- Hackathon creation/editing UI and organizer dashboards are not part of this
  frontend yet; events are seeded or created directly through Supabase.
- Reviews, coins, and projects have no editing UI in this version; tasks can be
  created from a roadmap but not edited, and the dashboard and profile only read
  them.
- “Use This Idea” reuses the existing `projects` table and its insert policy
  (team leaders only). Title and description stay real columns, and the complete
  idea is stored as JSON in `projects.idea_data`
  (`20261029120000_add_project_idea_data.sql`); the description keeps a readable
  summary. Projects created before that column existed have `idea_data = null`
  and are labelled as incomplete. The dialog creates nothing until the user
  confirms, and duplicate titles for the same team are blocked in the UI and
  re-checked immediately before insert.
- The idea generator invokes the Supabase Edge Function `generate-ideas`, which
  calls Gemini with `GEMINI_API_KEY` from its own secret environment. Approved
  hackathons come from `hackathons.approval_status`; skills prefill from the
  signed-in profile via `get_my_profile`. Nothing is persisted: the brief and
  ideas live in component state, and skills are written only by the explicit
  “Save skills to profile” action.
- The idea function is public (deployed with `--no-verify-jwt`) and has no
  streaming or per-user quota; Gemini's own quota/429 response is surfaced as a
  retryable message. Without the secret it returns `503` and the page shows a
  setup message; provider failures return `502`/`504` without upstream details.
- Static hosting is enough for the idea generator because the AI call lives in
  Supabase. `/api/roadmap` still needs the Node server with its server-only
  environment variables.
- Demo leaderboard rows are intentionally visible (badged `DEMO`) until the
  first real profile is registered.
- `legacy/` contains the previous static implementation and can be deleted once
  it is no longer needed.
