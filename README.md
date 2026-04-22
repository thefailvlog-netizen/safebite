# SafeBite

B2B SaaS platform that surfaces public restaurant inspection data to food operators. Inspection data is public but scattered — SafeBite gives operators a clean way to track their own record, benchmark against competitors, and prepare for upcoming inspections.

**Live:** [safebite-three.vercel.app](https://safebite-three.vercel.app)
**Repo:** [github.com/thefailvlog-netizen/safebite](https://github.com/thefailvlog-netizen/safebite)

---

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS v3 + shadcn/ui |
| Database | Supabase (PostgreSQL + PostGIS) |
| Auth | Supabase Auth |
| Deployment | Vercel (auto-deploy from `main`) |
| Data source | Toronto DineSafe Open Data API |

---

## Project Structure

```
safebite/
├── app/
│   ├── page.tsx              # Landing page (public)
│   ├── search/               # Restaurant search (public)
│   ├── restaurant/[id]/      # Restaurant detail (public)
│   ├── login/                # Login page
│   ├── signup/               # Signup / access request
│   ├── pending/              # Awaiting admin approval
│   ├── dashboard/            # Operator dashboard (auth + approved)
│   ├── admin/                # Admin panel (auth + admin)
│   └── api/
│       ├── search/           # Search API route
│       ├── restaurant/[id]/  # Restaurant detail API route
│       └── admin/users/      # Admin user management API
├── docs/
│   ├── requirements.md       # Product requirements (living doc)
│   └── progress.md           # Build log and sprint history
├── lib/supabase/
│   ├── client.ts             # Browser Supabase client
│   └── server.ts             # Server-side Supabase client
├── middleware.ts             # Route protection
├── scripts/
│   └── seed-dinesafe.ts      # Local DB seed script
└── supabase/
    └── functions/
        └── sync-dinesafe/    # Nightly DineSafe sync Edge Function
```

---

## Infrastructure

| Resource | Value |
|---|---|
| Supabase project | `swwefnbjrjodekpnazpl` |
| Supabase org | `umpsnwebemegoqfkzabn` |
| Vercel team | `team_huqDTSoX66ed7lVjZsHRaBtn` |
| GitHub org | `thefailvlog-netizen` |

---

## Access Model

| Route | Auth required | Notes |
|---|---|---|
| `/` | No | Public landing page |
| `/search` | No | Public search |
| `/restaurant/[id]` | No | Public restaurant detail |
| `/login`, `/signup` | No | Auth pages |
| `/pending` | No | Shown after signup, before approval |
| `/dashboard` | Yes + `is_approved` | Operator dashboard |
| `/admin` | Yes + `is_admin` | Mike only |

---

## Database Schema

```sql
establishments     -- Restaurant records from DineSafe
  id, external_id, name, address, city, province, lat, lng, category, status, location (PostGIS)

inspections        -- Per-visit inspection records
  id, establishment_id, inspection_date, inspection_type, outcome, source

infractions        -- Individual violations per inspection
  id, inspection_id, infraction_text, severity, action

operators          -- User accounts (created by DB trigger on signup)
  id, email, full_name, is_approved, is_admin, created_at
```

---

## Running Locally

```bash
# Install dependencies
npm install

# Add environment variables
cp .env.local.example .env.local
# Fill in NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

# Run dev server
npm run dev

# Seed DineSafe data (one-time)
npx ts-node --project tsconfig.node.json scripts/seed-dinesafe.ts
```

---

## Admin

Admin user: Mike Pacione (`thefailvlog@gmail.com`) — `is_admin = true`, `is_approved = true`

To approve a new user: go to `/admin`, click Approve next to their name.
