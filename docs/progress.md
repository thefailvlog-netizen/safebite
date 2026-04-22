# SafeBite — Build Log & Progress Tracker

> Chronological record of what was built, decisions made, and issues resolved.
> Owner: Mike Pacione (Product) | Built with Claude

---

## Sprint 1 — Infrastructure & Auth MVP
**Dates:** 2026-04-21 – 2026-04-22
**Status:** ✅ Complete

---

### Phase 1 — Infrastructure Setup

**Completed:**
- [x] Supabase project created (`swwefnbjrjodekpnazpl`, region: `us-east-1`)
- [x] PostGIS extension enabled
- [x] Next.js 14 app scaffolded at `~/Documents/Claude Projects/safebite`
  - TypeScript, App Router, Tailwind CSS v3, shadcn/ui
- [x] GitHub repo created: `thefailvlog-netizen/safebite` (public)
- [x] Vercel project connected to GitHub — auto-deploys on push to `main`
- [x] Environment variables set in Vercel and `.env.local`
- [x] Database schema applied (establishments, inspections, infractions, operators)
- [x] Row Level Security (RLS) policies applied on operators table

**DB migrations applied:**
1. Core schema — establishments, inspections, infractions
2. Operators table — `id`, `email`, `full_name`, `is_approved`, `is_admin`, `created_at`
3. RLS policies — `operators_read_own`, `operators_update_own`, `operators_admin_read_all`, `operators_admin_update_all`
4. SECURITY DEFINER trigger — `on_auth_user_created` → auto-creates operator row from `auth.users` metadata on every new signup

---

### Phase 2 — DineSafe Data

**Completed:**
- [x] DineSafe Edge Function built (`supabase/functions/sync-dinesafe/index.ts`)
  - Paginates Toronto Open Data CKAN API
  - Upserts establishments, inspections, infractions
  - Updates PostGIS geometry columns
- [x] Nightly sync scheduled via `pg_cron` (3am UTC)
- [x] Local seed script built (`scripts/seed-dinesafe.ts`)
- [x] Initial dataset loaded:
  - **18,925 establishments**
  - **1,198 inspections**
  - **646 infractions**

---

### Phase 3 — Public Web App

**Completed:**
- [x] Landing page (`/`) — dark navy hero, stats bar, 3 feature cards, CTA banner, footer
- [x] Search page (`/search`) — debounced name search (300ms), outcome badges (Pass=green, Conditional=amber, Closed=red)
- [x] Restaurant detail page (`/restaurant/[id]`) — full inspection history, expandable infractions, severity badges (Minor=yellow, Significant=orange, Crucial=red)

---

### Phase 4 — Auth & Access Control

**Completed:**
- [x] Login page (`/login`) — email + password, redirects to `/dashboard`
- [x] Signup page (`/signup`) — name, email, password; creates auth user; DB trigger creates operator row with `is_approved = false`; redirects to `/pending`
- [x] Pending page (`/pending`) — waiting screen; auto-redirects to `/dashboard` if user becomes approved
- [x] Middleware (`middleware.ts`) — protects `/dashboard` (requires auth + is_approved) and `/admin` (requires auth + is_admin)
- [x] Dashboard placeholder (`/dashboard`) — shell for approved operators
- [x] Admin panel (`/admin`) — user list with approve and remove controls
- [x] Admin API routes (`/api/admin/users`) — GET all operators, POST approve/remove

**Admin user seeded:**
- Mike Pacione (`thefailvlog@gmail.com`) — `is_admin = true`, `is_approved = true` (inserted directly via service role on 2026-04-22)

---

## Issues Encountered & Resolved

### 1. Geist font not in Next.js 14
- **Problem:** `create-next-app` scaffold used `import { Geist } from "next/font/google"` which doesn't exist in v14
- **Fix:** Replaced with `Inter` from `next/font/google`

### 2. shadcn v4 / Tailwind v3 CSS mismatch
- **Problem:** shadcn v4 `init` rewrote `globals.css` using `@import "shadcn/tailwind.css"` and `oklch()` color values — incompatible with Tailwind v3
- **Fix:** Rewrote `globals.css` with standard HSL CSS variables; updated `tailwind.config.ts` with full shadcn token map

### 3. DineSafe "None"/"null" Inspection IDs
- **Problem:** DineSafe API returns the literal strings `"None"` or `"null"` for missing Inspection IDs, collapsing 18K+ infractions into 2 fake inspection rows
- **Fix:** Added `isNullLike()` helper; synthesized stable key from `(EstID_Date_Type)` when Inspection ID is absent

### 4. Vercel build failure — TypeScript path conflicts
- **Problem:** `scripts/seed-dinesafe.ts` used Node.js APIs (`MapIterator`), and `supabase/functions/` used Deno/`esm.sh` imports — both incompatible with Next.js TypeScript target
- **Fix:** Added `"scripts"` and `"supabase"` to `tsconfig.json` `exclude` array

### 5. RLS error on signup
- **Problem:** Signup page tried to manually `INSERT` into `operators` using the anon client before the session was confirmed — hit RLS policy blocking unauthenticated inserts
- **Fix:** Removed manual insert from signup page; created `SECURITY DEFINER` trigger `on_auth_user_created` that auto-creates operator row from `auth.users` metadata; passed `full_name` in `options.data` metadata to `signUp()`

### 6. Email confirmation callback error
- **Problem:** Supabase sent a confirmation email; clicking it hit a broken callback URL
- **Fix:** Set `emailRedirectTo: undefined` in `signUp()` call; disabled email confirmation in Supabase Dashboard → Authentication → Providers → Email

### 7. Admin UPDATE returned 0 rows
- **Problem:** `UPDATE operators SET is_admin=TRUE WHERE email='thefailvlog@gmail.com'` returned empty — operator row was never created because trigger wasn't deployed when Mike first signed up
- **Fix:** Manually `INSERT`ed operator row directly with service role key

### 8. Middleware RLS bypass — users stuck on `/pending`
- **Problem:** Anon-key Supabase client inside Next.js Edge middleware doesn't reliably forward the user's JWT to PostgREST for RLS evaluation. Operator queries returned `null`, making every user appear unapproved and causing infinite redirect to `/pending`
- **Fix:** Switched middleware and pending page operator lookups to use the service role client, which bypasses RLS entirely (safe — this is server-side auth logic, not user-facing data)

---

## Architecture Decisions

| Decision | Rationale |
|---|---|
| Service role key for middleware operator lookups | Anon key + user JWT in Edge middleware doesn't reliably trigger RLS policies — service role is safer and more predictable for server-side auth gates |
| SECURITY DEFINER trigger for operator row creation | Ensures operator row is always created atomically with auth user creation, regardless of client-side RLS restrictions |
| `emailRedirectTo: undefined` on signup | Access is admin-controlled, not email-verified. Skipping the email redirect avoids broken callback URLs and matches the intended access model |
| Synthetic inspection key for DineSafe | DineSafe returns null-like strings for Inspection IDs. Synthesizing `(EstID_Date_Type)` as a key ensures stable upsert IDs without data loss |

---

## Current State (as of 2026-04-22)

| Area | Status |
|---|---|
| Infrastructure | ✅ Live |
| DineSafe data (Toronto) | ✅ Seeded — 18,925 establishments |
| Landing page | ✅ Live |
| Restaurant search | ✅ Live |
| Restaurant detail | ✅ Live |
| Auth (login / signup / pending) | ✅ Live |
| Admin panel | ✅ Live |
| Operator dashboard | 🟡 Placeholder only |
| Nightly DineSafe sync | ✅ Scheduled (3am UTC) |
| Welcome email on approval | ❌ Not built |

---

## Next Up (Sprint 2 candidates)

- [ ] **REQ-007** — Operator claims: search for your restaurant, submit a claim, admin verifies
- [ ] **REQ-008** — New inspection alert email (requires email provider — Resend recommended)
- [ ] **REQ-009** — Benchmarking: pass/fail rate vs. similar restaurants
- [ ] Welcome email when admin approves a user
- [ ] Forgot password flow

---

*Last updated: 2026-04-22*
